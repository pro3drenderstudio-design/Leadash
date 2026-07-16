/**
 * /api/admin/finance/daily-close
 * GET  ?days=30  — list the last N days with per-day totals + closed flag
 * POST           — close (or reopen) a day. Payload: { day: 'YYYY-MM-DD', action: 'close'|'reopen', note? }
 *
 * Daily close is a lightweight checkpoint on top of the monthly close in
 * finance_periods. Closing a day does NOT lock the ledger (the monthly
 * period lock is what enforces write blocks); it's a per-day "the books
 * agree with the bank for this day" tick the accountant maintains.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../_helpers";

interface RevRow { date: string; type: string; amount_ngn: number; is_test: boolean; review_status: string }

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const days = Math.min(180, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30));

  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const startIso = start.toISOString().slice(0, 10);

  const [{ data: closes }, { data: txs }] = await Promise.all([
    ctx.db.from("finance_daily_reviews").select("*").gte("day", startIso).order("day", { ascending: false }),
    ctx.db.from("finance_transactions").select("date, type, amount_ngn, is_test, review_status")
      .gte("date", startIso).limit(20000),
  ]);

  const closeMap = new Map<string, { closed_at: string; close_note: string | null; closed_by: string | null }>();
  for (const c of (closes ?? []) as { day: string; closed_at: string; close_note: string | null; closed_by: string | null }[]) {
    closeMap.set(c.day, { closed_at: c.closed_at, close_note: c.close_note, closed_by: c.closed_by });
  }

  const buckets = new Map<string, { revenue: number; cost: number; unreviewed: number; flagged: number; count: number }>();
  for (const t of (txs ?? []) as RevRow[]) {
    if (t.is_test) continue;
    const b = buckets.get(t.date) ?? { revenue: 0, cost: 0, unreviewed: 0, flagged: 0, count: 0 };
    if (t.type === "revenue") b.revenue += Number(t.amount_ngn);
    else if (t.type === "cogs" || t.type === "opex" || t.type === "tax") b.cost += Number(t.amount_ngn);
    if (t.review_status === "unreviewed") b.unreviewed++;
    if (t.review_status === "flagged")    b.flagged++;
    b.count++;
    buckets.set(t.date, b);
  }

  const list: {
    day: string;
    revenue: number; cost: number; net: number;
    count: number; unreviewed: number; flagged: number;
    closed: boolean; closed_at?: string; close_note?: string | null;
  }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const b = buckets.get(iso) ?? { revenue: 0, cost: 0, unreviewed: 0, flagged: 0, count: 0 };
    const closed = closeMap.get(iso);
    list.push({
      day: iso,
      revenue: b.revenue, cost: b.cost, net: b.revenue - b.cost,
      count: b.count, unreviewed: b.unreviewed, flagged: b.flagged,
      closed: !!closed,
      closed_at: closed?.closed_at,
      close_note: closed?.close_note ?? null,
    });
  }

  return NextResponse.json({ days: list });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const body = await req.json() as { day?: string; action?: "close" | "reopen"; note?: string };

  if (!body.day || !/^\d{4}-\d{2}-\d{2}$/.test(body.day)) {
    return NextResponse.json({ error: "day (YYYY-MM-DD) is required" }, { status: 400 });
  }
  if (body.action !== "close" && body.action !== "reopen") {
    return NextResponse.json({ error: "action must be 'close' or 'reopen'" }, { status: 400 });
  }

  if (body.action === "close") {
    const { data, error } = await ctx.db.from("finance_daily_reviews").upsert({
      day: body.day,
      closed_by:  ctx.user.id,
      closed_at:  new Date().toISOString(),
      close_note: body.note?.trim() || null,
    }, { onConflict: "day" }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await ctx.db.from("finance_audit_log").insert({
      actor: ctx.user.id, action: "close_day",
      entity_type: "finance_daily_reviews", entity_id: body.day,
      detail: { note: body.note ?? null },
    });
    return NextResponse.json({ review: data });
  }

  // reopen
  const { error } = await ctx.db.from("finance_daily_reviews").delete().eq("day", body.day);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await ctx.db.from("finance_audit_log").insert({
    actor: ctx.user.id, action: "reopen_day",
    entity_type: "finance_daily_reviews", entity_id: body.day,
    detail: {},
  });
  return NextResponse.json({ ok: true });
}
