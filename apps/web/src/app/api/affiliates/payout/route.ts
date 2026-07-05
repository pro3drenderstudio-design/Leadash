import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createClient } from "@/lib/supabase/server";

const MIN_PAYOUT_NGN = 20000;

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const supabase = await createClient();
  const { method } = await req.json(); // "bank" | "credit"

  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("*")
    .eq("workspace_id", auth.workspaceId)
    .maybeSingle();

  if (!affiliate) return NextResponse.json({ error: "Not enrolled as affiliate" }, { status: 400 });

  // Calculate available balance
  const { data: commissions } = await supabase
    .from("commission_events")
    .select("id, amount_ngn, status, holds_until")
    .eq("affiliate_id", affiliate.id)
    .in("status", ["available", "pending"]);

  const now = new Date();
  const readyCommissions = (commissions ?? []).filter(
    c => c.status === "available" || (c.status === "pending" && new Date(c.holds_until) <= now),
  );
  const availableNgn = readyCommissions.reduce((s, c) => s + Number(c.amount_ngn), 0);

  if (availableNgn < MIN_PAYOUT_NGN) {
    return NextResponse.json({ error: `Minimum payout is ₦${MIN_PAYOUT_NGN.toLocaleString()}. You have ₦${Math.floor(availableNgn).toLocaleString()} available.` }, { status: 400 });
  }

  if (method === "bank" && (!affiliate.bank_name || !affiliate.bank_account_number)) {
    return NextResponse.json({ error: "Add your bank details first" }, { status: 400 });
  }

  // Create payout request
  const creditMultiplier = method === "credit" ? 1.25 : null;
  const destination = method === "bank"
    ? { bank_name: affiliate.bank_name, account_number: affiliate.bank_account_number, account_name: affiliate.bank_account_name }
    : { workspace_id: auth.workspaceId };

  const { data: payout, error: payoutErr } = await supabase
    .from("affiliate_payouts")
    .insert({
      affiliate_id:      affiliate.id,
      amount_ngn:        availableNgn,
      method,
      credit_multiplier: creditMultiplier,
      destination,
      status:            "queued",
    })
    .select("id")
    .single();

  if (payoutErr) return NextResponse.json({ error: payoutErr.message }, { status: 500 });

  // Mark commission events as paid (optimistically — admin will confirm)
  await supabase
    .from("commission_events")
    .update({ status: "paid" })
    .in("id", readyCommissions.map(c => c.id));

  return NextResponse.json({ payout_id: payout.id, amount_ngn: availableNgn });
}

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const supabase = await createClient();
  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("id")
    .eq("workspace_id", auth.workspaceId)
    .maybeSingle();

  if (!affiliate) return NextResponse.json({ payouts: [] });

  const { data: payouts } = await supabase
    .from("affiliate_payouts")
    .select("id, amount_ngn, method, status, fraud_flag, created_at, paid_at")
    .eq("affiliate_id", affiliate.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ payouts: payouts ?? [] });
}
