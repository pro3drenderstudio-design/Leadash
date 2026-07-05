import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, db };
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "queued";

  const { data, error } = await ctx.db
    .from("affiliate_payouts")
    .select(`
      id, amount_ngn, method, credit_multiplier, destination, status,
      fraud_flag, notes, created_at, paid_at,
      affiliates!affiliate_payouts_affiliate_id_fkey(
        id, handle, tier, bank_name, bank_account_number, bank_account_name,
        workspaces!affiliates_workspace_id_fkey(name, billing_email)
      )
    `)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payouts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = ctx.db;
  const { payout_id, action, notes } = await req.json();

  if (!payout_id || !action) return NextResponse.json({ error: "payout_id and action required" }, { status: 400 });

  const statusMap: Record<string, string> = { approve: "paid", hold: "held", reject: "held" };
  const newStatus = statusMap[action];
  if (!newStatus) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const updates: Record<string, unknown> = { status: newStatus, notes: notes ?? null };
  if (action === "approve") updates.paid_at = new Date().toISOString();

  const { error } = await db.from("affiliate_payouts").update(updates).eq("id", payout_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // For approved credit payouts, grant credits to the workspace
  if (action === "approve") {
    const { data: payout } = await db
      .from("affiliate_payouts")
      .select("method, amount_ngn, credit_multiplier, destination")
      .eq("id", payout_id)
      .single();

    if (payout?.method === "credit" && payout?.credit_multiplier) {
      const destWsId = (payout.destination as Record<string, string>)?.workspace_id;
      if (destWsId) {
        const creditAmount = Math.floor(Number(payout.amount_ngn) * Number(payout.credit_multiplier));
        const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", destWsId).single();
        if (ws) {
          await db.from("workspaces").update({ lead_credits_balance: (ws.lead_credits_balance ?? 0) + creditAmount }).eq("id", destWsId);
          await db.from("lead_credit_transactions").insert({
            workspace_id: destWsId,
            type: "grant",
            amount: creditAmount,
            description: `Affiliate payout credit (×${payout.credit_multiplier})`,
          });
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
