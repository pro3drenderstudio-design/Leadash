/**
 * /api/admin/finance/transactions
 *
 * The categorized finance ledger (revenue/cogs/opex/tax). Auto rows are fed
 * by DB triggers from billing_invoices/offer_purchases; manual rows (opex,
 * adjustments, tax entries) are created here. Every manual mutation lands in
 * finance_audit_log.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../_helpers";
import { TYPES, CATEGORIES, type TxType } from "@/lib/finance/tax";

const VALID_TYPES = Object.keys(TYPES) as TxType[];

function validCategory(type: TxType, category: string): boolean {
  return Boolean(CATEGORIES[type]?.[category]);
}

// GET ?start=YYYY-MM-DD&end=YYYY-MM-DD&type=&review_status=&limit=
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();

  const p = req.nextUrl.searchParams;
  let q = ctx.db.from("finance_transactions").select("*").order("date", { ascending: false }).order("created_at", { ascending: false });

  if (p.get("start"))         q = q.gte("date", p.get("start")!);
  if (p.get("end"))           q = q.lte("date", p.get("end")!);
  if (p.get("type"))          q = q.eq("type", p.get("type")!);
  if (p.get("review_status")) q = q.eq("review_status", p.get("review_status")!);
  q = q.limit(Math.min(parseInt(p.get("limit") ?? "500", 10) || 500, 2000));

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transactions: data ?? [] });
}

// POST — create a manual entry (opex, tax record, adjusting entry, …)
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const body = await req.json() as {
    date?: string; type?: TxType; category?: string; amount_ngn?: number;
    description?: string; reference?: string; adjusts_id?: string;
  };

  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) is required" }, { status: 400 });
  }
  if (!body.type || !VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: `type must be one of ${VALID_TYPES.join(", ")}` }, { status: 400 });
  }
  if (!body.category || !validCategory(body.type, body.category)) {
    return NextResponse.json({ error: "Unknown category for this type" }, { status: 400 });
  }
  const amount = Number(body.amount_ngn);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "amount_ngn must be >= 0" }, { status: 400 });
  }

  const { data, error } = await ctx.db.from("finance_transactions").insert({
    date:        body.date,
    type:        body.type,
    category:    body.category,
    amount_ngn:  amount,
    description: body.description?.trim() || null,
    reference:   body.reference?.trim() || null,
    adjusts_id:  body.adjusts_id || null,
    is_auto:     false,
    // Manual entries are the accountant's own — born reviewed.
    review_status: "reviewed",
    reviewed_by:   ctx.user.id,
    reviewed_at:   new Date().toISOString(),
    created_by:    ctx.user.id,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await ctx.db.from("finance_audit_log").insert({
    actor:       ctx.user.id,
    action:      body.adjusts_id ? "adjust" : "manual_entry",
    entity_type: "finance_transactions",
    entity_id:   data.id,
    detail:      { date: body.date, type: body.type, category: body.category, amount_ngn: amount, adjusts_id: body.adjusts_id ?? null },
  });

  return NextResponse.json({ transaction: data });
}
