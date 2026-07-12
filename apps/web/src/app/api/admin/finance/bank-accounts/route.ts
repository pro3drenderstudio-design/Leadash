/**
 * /api/admin/finance/bank-accounts
 *
 * Bank accounts + opening/closing balance for a selected period. Cash
 * direction per transaction comes from `cashSign(type, category)` in
 * lib/finance/tax.ts (revenue/equity-in = +1, everything else = -1) —
 * balances are opening_balance_ngn plus the signed sum of every transaction
 * tagged to that account up to a given date.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../_helpers";
import { cashSign, type TxType } from "@/lib/finance/tax";

function periodBounds(period: string, asof: string): { start: string; end: string } {
  const d = new Date(`${asof}T00:00:00Z`);
  if (period === "day") {
    return { start: asof, end: asof };
  }
  if (period === "week") {
    const day = d.getUTCDay();
    const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
    const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
    return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
  }
  if (period === "quarter") {
    const q = Math.floor(d.getUTCMonth() / 3);
    const start = new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1));
    const end = new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  if (period === "year") {
    return { start: `${d.getUTCFullYear()}-01-01`, end: `${d.getUTCFullYear()}-12-31` };
  }
  // month (default)
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

async function balanceAsOf(
  db: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>["db"],
  accountId: string,
  openingBalance: number,
  openingDate: string,
  asof: string,
): Promise<number> {
  if (asof < openingDate) return openingBalance;
  const { data: txs } = await db
    .from("finance_transactions")
    .select("type, category, amount_ngn")
    .eq("bank_account_id", accountId)
    .gte("date", openingDate)
    .lte("date", asof);
  let balance = openingBalance;
  for (const tx of (txs ?? []) as { type: TxType; category: string; amount_ngn: number }[]) {
    balance += tx.amount_ngn * cashSign(tx.type, tx.category);
  }
  return balance;
}

// GET ?period=day|week|month|quarter|year&asof=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();

  const period = req.nextUrl.searchParams.get("period") ?? "month";
  const asof = req.nextUrl.searchParams.get("asof") ?? new Date().toISOString().slice(0, 10);
  const { start, end } = periodBounds(period, asof);
  const today = new Date().toISOString().slice(0, 10);
  const closingAsOf = end > today ? today : end;

  const { data: accounts, error } = await ctx.db.from("finance_bank_accounts").select("*").order("is_default", { ascending: false }).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = await Promise.all((accounts ?? []).map(async (acct: Record<string, unknown>) => {
    const opening = Number(acct.opening_balance_ngn);
    const openingDate = String(acct.opening_balance_date);
    const dayBeforeStart = new Date(`${start}T00:00:00Z`);
    dayBeforeStart.setUTCDate(dayBeforeStart.getUTCDate() - 1);

    const [periodOpening, periodClosing, currentBalance] = await Promise.all([
      balanceAsOf(ctx.db, acct.id as string, opening, openingDate, dayBeforeStart.toISOString().slice(0, 10)),
      balanceAsOf(ctx.db, acct.id as string, opening, openingDate, closingAsOf),
      balanceAsOf(ctx.db, acct.id as string, opening, openingDate, today),
    ]);

    return { ...acct, period_start: start, period_end: end, period_opening: periodOpening, period_closing: periodClosing, current_balance: currentBalance };
  }));

  return NextResponse.json({
    period, start, end,
    accounts: results,
    total_current_balance: results.reduce((sum, a) => sum + (a.is_active ? a.current_balance : 0), 0),
  });
}

// POST — create a bank account
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const body = await req.json() as {
    name?: string; bank_name?: string; account_number_masked?: string;
    opening_balance_ngn?: number; opening_balance_date?: string; is_default?: boolean;
  };

  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!body.opening_balance_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.opening_balance_date)) {
    return NextResponse.json({ error: "opening_balance_date (YYYY-MM-DD) is required" }, { status: 400 });
  }
  const openingBalance = Number(body.opening_balance_ngn ?? 0);
  if (!Number.isFinite(openingBalance)) return NextResponse.json({ error: "opening_balance_ngn must be a number" }, { status: 400 });

  if (body.is_default) {
    await ctx.db.from("finance_bank_accounts").update({ is_default: false }).eq("is_default", true);
  }

  const { data, error } = await ctx.db.from("finance_bank_accounts").insert({
    name: body.name.trim(),
    bank_name: body.bank_name?.trim() || null,
    account_number_masked: body.account_number_masked?.trim() || null,
    opening_balance_ngn: openingBalance,
    opening_balance_date: body.opening_balance_date,
    is_default: Boolean(body.is_default),
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.is_default) {
    await ctx.db.from("finance_settings").update({ default_bank_account_id: data.id }).eq("id", 1);
  }

  await ctx.db.from("finance_audit_log").insert({
    actor: ctx.user.id, action: "manual_entry", entity_type: "finance_bank_accounts", entity_id: data.id,
    detail: { name: data.name, opening_balance_ngn: openingBalance },
  });

  return NextResponse.json({ account: data });
}
