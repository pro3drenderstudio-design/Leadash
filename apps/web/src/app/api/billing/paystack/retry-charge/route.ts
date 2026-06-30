/**
 * POST /api/billing/paystack/retry-charge
 *
 * Re-attempts the subscription charge for a workspace currently in the grace
 * period (plan_status = "past_due"). Uses Paystack's charge_authorization
 * endpoint with the stored auth code.
 *
 * On success: clears grace period, restores plan_status to "active".
 * On failure: returns the Paystack error so the client can show it.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? "";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();

  // Find the user's workspace
  const { data: membership } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return NextResponse.json({ error: "No workspace found" }, { status: 404 });

  const { data: ws } = await db
    .from("workspaces")
    .select("id, plan_status, paystack_auth_code, paystack_customer_code, billing_email")
    .eq("id", membership.workspace_id)
    .single();

  if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (ws.plan_status !== "past_due") {
    return NextResponse.json({ error: "No outstanding payment" }, { status: 400 });
  }
  if (!ws.paystack_auth_code) {
    return NextResponse.json({ error: "No payment method on file — please update your card in billing settings." }, { status: 400 });
  }

  // Get billing email
  let email = ws.billing_email ?? null;
  if (!email) {
    const { data: { user: authUser } } = await db.auth.admin.getUserById(user.id);
    email = authUser?.email ?? null;
  }
  if (!email) return NextResponse.json({ error: "No billing email found" }, { status: 400 });

  // Attempt charge via Paystack
  const paystackRes = await fetch("https://api.paystack.co/transaction/charge_authorization", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      authorization_code: ws.paystack_auth_code,
      email,
      amount: 0, // Paystack uses the subscription amount; 0 triggers the stored recurring amount
    }),
  });

  const result = await paystackRes.json() as {
    status: boolean;
    message: string;
    data?: { status: string; gateway_response: string };
  };

  if (!paystackRes.ok || !result.status || result.data?.status === "failed") {
    return NextResponse.json({
      error: result.data?.gateway_response ?? result.message ?? "Payment failed",
    }, { status: 402 });
  }

  // Success — the webhook will handle plan_status update; optimistically clear grace state here too
  if (result.data?.status === "success") {
    await db.from("workspaces")
      .update({ plan_status: "active", grace_ends_at: null })
      .eq("id", ws.id);
  }

  return NextResponse.json({ ok: true, status: result.data?.status, message: result.data?.gateway_response });
}
