/**
 * POST /api/billing/cancel
 *
 * Cancels the workspace's active Paystack subscription.
 * The plan stays active until the current billing period ends — Paystack will
 * fire subscription.disable at period end, which triggers the downgrade.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { disablePaystackSubscription } from "@/lib/billing/paystack";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data: ws } = await db
    .from("workspaces")
    .select("paystack_sub_code, plan_id, plan_status")
    .eq("id", workspaceId)
    .single();

  if (!ws?.paystack_sub_code) {
    return NextResponse.json({ error: "No active subscription found." }, { status: 400 });
  }
  if (ws.plan_status === "canceled") {
    return NextResponse.json({ error: "Subscription is already canceled." }, { status: 400 });
  }

  // Fetch the email token required by Paystack to disable a subscription
  // Paystack requires both the sub code and the email token
  let emailToken: string | null = null;
  try {
    const res = await fetch(
      `https://api.paystack.co/subscription/${ws.paystack_sub_code}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } },
    );
    const json = await res.json() as { data?: { email_token?: string } };
    emailToken = json.data?.email_token ?? null;
  } catch {
    return NextResponse.json({ error: "Failed to fetch subscription details." }, { status: 502 });
  }

  if (!emailToken) {
    return NextResponse.json({ error: "Could not retrieve subscription token." }, { status: 502 });
  }

  try {
    await disablePaystackSubscription({ code: ws.paystack_sub_code, emailToken });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cancellation failed." },
      { status: 502 },
    );
  }

  // Mark as canceled in DB immediately — webhook will confirm it
  await db.from("workspaces")
    .update({ plan_status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", workspaceId);

  return NextResponse.json({ ok: true });
}
