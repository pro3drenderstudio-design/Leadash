import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { randomBytes } from "crypto";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { searchParams } = new URL(req.url);
  const page  = Math.max(1, parseInt(searchParams.get("page")  ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "25"));

  const { data: payouts, count, error } = await db
    .from("leadpay_payouts")
    .select("*, bank_account:leadpay_bank_accounts(*)", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payouts: payouts ?? [], total: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json() as Record<string, unknown>;
  const usdCents       = parseInt(String(body.usd_amount_cents ?? 0));
  const bankAccountId  = body.bank_account_id as string | undefined;

  if (!usdCents || usdCents <= 0) {
    return NextResponse.json({ error: "usd_amount_cents required" }, { status: 400 });
  }
  if (!bankAccountId) {
    return NextResponse.json({ error: "bank_account_id required" }, { status: 400 });
  }

  // Check minimum from settings
  const { data: minRow } = await db
    .from("admin_settings")
    .select("value")
    .eq("key", "leadpay_min_payout_ngn")
    .maybeSingle();
  const minNgn = minRow?.value ? parseFloat(String(minRow.value)) : 500;

  // Get current FX rate
  const { data: rateRow } = await db
    .from("admin_settings")
    .select("value")
    .eq("key", "leadpay_fx_rate_override")
    .maybeSingle();

  let midRate = rateRow?.value ? parseFloat(String(rateRow.value)) : 1580;

  const { data: spreadRow } = await db
    .from("admin_settings")
    .select("value")
    .eq("key", "leadpay_fx_spread_pct")
    .maybeSingle();
  const spreadPct   = spreadRow?.value ? parseFloat(String(spreadRow.value)) : 2.5;
  const clientRate  = midRate * (1 - spreadPct / 100);
  const fxFeeCents  = Math.round(usdCents * spreadPct / 100);
  const ngnKobo     = Math.round((usdCents / 100) * clientRate * 100);

  if (ngnKobo / 100 < minNgn) {
    return NextResponse.json({ error: `Minimum payout is ₦${minNgn.toLocaleString()}` }, { status: 400 });
  }

  // Verify account has sufficient balance
  const { data: account } = await db
    .from("leadpay_accounts")
    .select("usd_balance_cents, status, kyc_status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!account) return NextResponse.json({ error: "LeadPay account not found" }, { status: 404 });
  if (account.kyc_status !== "verified") {
    return NextResponse.json({ error: "KYC verification required before withdrawing" }, { status: 403 });
  }
  if (account.usd_balance_cents < usdCents) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 402 });
  }

  // Verify bank account belongs to workspace
  const { data: bankAccount } = await db
    .from("leadpay_bank_accounts")
    .select("*")
    .eq("id", bankAccountId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!bankAccount) return NextResponse.json({ error: "Bank account not found" }, { status: 404 });

  // Check auto-approve threshold
  const { data: autoRow } = await db
    .from("admin_settings")
    .select("value")
    .eq("key", "leadpay_auto_approve_payout_ngn")
    .maybeSingle();
  const autoApproveNgn = autoRow?.value ? parseFloat(String(autoRow.value)) : 50000;
  const isAutoApprove  = ngnKobo / 100 <= autoApproveNgn;

  const reference = `LP-PO-${randomBytes(6).toString("hex").toUpperCase()}`;

  // Deduct from balance
  await db.from("leadpay_accounts")
    .update({
      usd_balance_cents:  account.usd_balance_cents - usdCents,
      usd_pending_cents:  0, // will be updated properly when pending settled
      updated_at:         new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId);

  const { data: payout, error } = await db
    .from("leadpay_payouts")
    .insert({
      workspace_id:    workspaceId,
      bank_account_id: bankAccountId,
      usd_amount_cents: usdCents,
      fx_rate:          clientRate,
      fx_fee_cents:     fxFeeCents,
      ngn_amount_kobo:  ngnKobo,
      status:           isAutoApprove ? "processing" : "pending",
      reference,
    })
    .select("*, bank_account:leadpay_bank_accounts(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log transaction
  await db.from("leadpay_transactions").insert({
    workspace_id:     workspaceId,
    type:             "payout",
    payout_id:        payout.id,
    description:      `Payout to ${bankAccount.bank_name} •••• ${bankAccount.account_number.slice(-4)}`,
    usd_amount_cents: usdCents,
    ngn_amount_kobo:  ngnKobo,
    status:           isAutoApprove ? "pending" : "pending",
    reference,
  });

  return NextResponse.json({ payout }, { status: 201 });
}
