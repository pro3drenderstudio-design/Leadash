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
import { sendCancellationConfirmationEmail } from "@/lib/email/notifications";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  // 3 cancellations per day per workspace
  const allowed = await checkRateLimit(db, `cancel:${workspaceId}`, 3, 24 * 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const { data: ws } = await db
    .from("workspaces")
    .select("paystack_sub_code, plan_id, plan_status, billing_email, name")
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
  const { error: dbError } = await db.from("workspaces")
    .update({ plan_status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", workspaceId);
  if (dbError) console.error("[billing/cancel] DB update failed:", dbError);

  if (ws?.billing_email) {
    const planMap: Record<string, string> = { starter: "Starter", growth: "Growth", scale: "Scale" };
    sendCancellationConfirmationEmail({
      userEmail:     ws.billing_email,
      workspaceName: ws.name,
      planName:      planMap[ws.plan_id ?? ""] ?? (ws.plan_id ?? "paid"),
    }).catch(e => console.error("[billing/cancel] cancellation email failed:", e));
  }

  return NextResponse.json({ ok: true });
}
