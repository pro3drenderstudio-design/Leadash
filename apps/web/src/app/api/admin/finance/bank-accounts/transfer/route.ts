/**
 * POST /api/admin/finance/bank-accounts/transfer
 * Transfer cash between two bank accounts. Creates a matched pair of
 * finance_transactions rows (one opex outflow on the source, one revenue
 * inflow on the destination) sharing a reference so they can be reconciled.
 *
 * Both rows are marked is_auto=false, review_status=reviewed (accountant-
 * initiated), and use categories opex.bank_charges (source) / revenue.other
 * (destination) so the ledger's cash-sign math nets to zero across the two
 * accounts — total cash is unchanged, only its distribution moves.
 *
 * Source and destination MUST be different active bank accounts. Amount must
 * be positive.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../../_helpers";

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();

  const body = await req.json() as {
    from_account_id?: string;
    to_account_id?: string;
    amount_ngn?: number;
    date?: string;
    note?: string;
  };

  if (!body.from_account_id || !body.to_account_id) {
    return NextResponse.json({ error: "from_account_id and to_account_id are required" }, { status: 400 });
  }
  if (body.from_account_id === body.to_account_id) {
    return NextResponse.json({ error: "Source and destination must be different accounts" }, { status: 400 });
  }
  const amt = Number(body.amount_ngn);
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: "amount_ngn must be > 0" }, { status: 400 });
  }
  const date = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : new Date().toISOString().slice(0, 10);

  const { data: accounts, error: acctErr } = await ctx.db
    .from("finance_bank_accounts")
    .select("id, name")
    .in("id", [body.from_account_id, body.to_account_id]);
  if (acctErr) return NextResponse.json({ error: acctErr.message }, { status: 500 });
  if (!accounts || accounts.length !== 2) {
    return NextResponse.json({ error: "One or both bank accounts not found" }, { status: 404 });
  }
  const accts = accounts as { id: string; name: string }[];
  const fromName = accts.find(a => a.id === body.from_account_id)?.name ?? "source";
  const toName   = accts.find(a => a.id === body.to_account_id)?.name   ?? "destination";
  const ref      = `TRF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const desc     = body.note?.trim() ? ` — ${body.note.trim()}` : "";

  const nowIso = new Date().toISOString();
  const rows = [
    {
      date, type: "opex", category: "opex.bank_charges", amount_ngn: amt,
      description: `Transfer to ${toName}${desc}`, reference: ref,
      bank_account_id: body.from_account_id,
      is_auto: false, review_status: "reviewed",
      reviewed_by: ctx.user.id, reviewed_at: nowIso, created_by: ctx.user.id,
      source_type: "bank_transfer", source_id: ref, kind: "out",
    },
    {
      date, type: "revenue", category: "revenue.other", amount_ngn: amt,
      description: `Transfer from ${fromName}${desc}`, reference: ref,
      bank_account_id: body.to_account_id,
      is_auto: false, review_status: "reviewed",
      reviewed_by: ctx.user.id, reviewed_at: nowIso, created_by: ctx.user.id,
      source_type: "bank_transfer", source_id: ref, kind: "in",
    },
  ];

  const { data, error } = await ctx.db.from("finance_transactions").insert(rows).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await ctx.db.from("finance_audit_log").insert({
    actor: ctx.user.id, action: "bank_transfer",
    entity_type: "finance_transactions", entity_id: data?.[0]?.id ?? null,
    detail: { from: body.from_account_id, to: body.to_account_id, amount_ngn: amt, date, reference: ref },
  });

  return NextResponse.json({ transactions: data, reference: ref });
}
