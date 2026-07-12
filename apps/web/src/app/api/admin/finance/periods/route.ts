/**
 * /api/admin/finance/periods
 *
 * Monthly close/sign-off workflow. GET lists months with review counts; POST
 * closes or reopens a month. Closing refuses while unreviewed/flagged rows
 * remain (unless override=true, which is logged). On close, the month's
 * summary is pushed to mizark-partners for investor reporting — the push is
 * non-fatal (sync_status records failures for retry) and lands there as
 * PENDING until explicitly approved, so nothing reaches investors
 * automatically.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../_helpers";
import { computePeriodSummary, type FinanceTransaction } from "@/lib/finance/tax";

export const maxDuration = 30;

const MIZARK_SYNC_URL    = process.env.MIZARK_SYNC_URL ?? "";
const LEADASH_SYNC_SECRET = process.env.LEADASH_SYNC_SECRET ?? "";

function monthBounds(periodMonth: string): { start: string; end: string } {
  const start = new Date(`${periodMonth}T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

type FinanceDb = NonNullable<Awaited<ReturnType<typeof requireAdmin>>>["db"];

async function reviewCounts(db: FinanceDb, start: string, end: string) {
  const base = () => db
    .from("finance_transactions")
    .select("id", { count: "exact", head: true })
    .gte("date", start).lte("date", end);
  const [{ count: unreviewed }, { count: flagged }] = await Promise.all([
    base().eq("review_status", "unreviewed"),
    base().eq("review_status", "flagged"),
  ]);
  return { unreviewed: unreviewed ?? 0, flagged: flagged ?? 0 };
}

// GET — list months (from earliest transaction to current), each with status + review counts
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();

  const { data: periods } = await ctx.db.from("finance_periods").select("*").order("period_month", { ascending: false });
  const { data: earliest } = await ctx.db.from("finance_transactions").select("date").order("date", { ascending: true }).limit(1).maybeSingle();

  // Build the month list: earliest transaction month → current month
  const months: string[] = [];
  const startMonth = earliest?.date ? new Date(`${(earliest.date as string).slice(0, 7)}-01T00:00:00Z`) : new Date();
  const cursor = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth(), 1));
  const now = new Date();
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  while (cursor <= currentMonth && months.length < 60) {
    months.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const periodByMonth = new Map((periods ?? []).map((p: Record<string, unknown>) => [p.period_month as string, p]));
  const result = [];
  for (const month of months.reverse()) {
    const { start, end } = monthBounds(month);
    const counts = await reviewCounts(ctx.db, start, end);
    result.push({
      period_month: month,
      status:       (periodByMonth.get(month) as Record<string, unknown> | undefined)?.status ?? "open",
      ...counts,
      ...(periodByMonth.get(month) ?? {}),
    });
  }

  return NextResponse.json({ periods: result });
}

// POST { period_month, action: "close"|"reopen"|"retry_sync", note?, override? }
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const body = await req.json() as { period_month?: string; action?: string; note?: string; override?: boolean };

  const periodMonth = body.period_month;
  if (!periodMonth || !/^\d{4}-\d{2}-01$/.test(periodMonth)) {
    return NextResponse.json({ error: "period_month must be the first of a month (YYYY-MM-01)" }, { status: 400 });
  }
  const { start, end } = monthBounds(periodMonth);

  if (body.action === "close") {
    // Refuse to close the current (still-accumulating) month
    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    if (periodMonth >= currentMonth) {
      return NextResponse.json({ error: "Can't close the current month before it ends" }, { status: 400 });
    }

    const counts = await reviewCounts(ctx.db, start, end);
    if ((counts.unreviewed > 0 || counts.flagged > 0) && !body.override) {
      return NextResponse.json({
        error: `Month has ${counts.unreviewed} unreviewed and ${counts.flagged} flagged transaction(s) — review them first, or close with override`,
        ...counts,
        requires_override: true,
      }, { status: 409 });
    }

    const { data: period, error } = await ctx.db.from("finance_periods").upsert({
      period_month: periodMonth,
      status:       "closed",
      closed_by:    ctx.user.id,
      closed_at:    new Date().toISOString(),
      close_note:   body.note?.trim() || null,
    }, { onConflict: "period_month" }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await ctx.db.from("finance_audit_log").insert({
      actor: ctx.user.id, action: "close_period",
      entity_type: "finance_periods", entity_id: periodMonth,
      detail: { note: body.note ?? null, override: Boolean(body.override), ...counts },
    });

    const sync = await pushToMizark(ctx.db, ctx.user.id, periodMonth, start, end);
    return NextResponse.json({ period, sync });
  }

  if (body.action === "reopen") {
    const { data: period, error } = await ctx.db.from("finance_periods")
      .update({ status: "open", reopened_by: ctx.user.id, reopened_at: new Date().toISOString() })
      .eq("period_month", periodMonth).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await ctx.db.from("finance_audit_log").insert({
      actor: ctx.user.id, action: "reopen_period",
      entity_type: "finance_periods", entity_id: periodMonth,
      detail: { note: body.note ?? null },
    });

    // Retract from mizark (numbers may change now) — non-fatal
    if (MIZARK_SYNC_URL && LEADASH_SYNC_SECRET) {
      try {
        await fetch(MIZARK_SYNC_URL, {
          method:  "POST",
          headers: { "Content-Type": "application/json", "x-sync-secret": LEADASH_SYNC_SECRET },
          body:    JSON.stringify({ period_month: periodMonth, retract: true }),
          signal:  AbortSignal.timeout(10000),
        });
        await ctx.db.from("finance_periods").update({ sync_status: "retracted" }).eq("period_month", periodMonth);
        await ctx.db.from("finance_audit_log").insert({
          actor: ctx.user.id, action: "retract", entity_type: "finance_periods", entity_id: periodMonth, detail: {},
        });
      } catch (e) {
        console.error("[finance/periods] retract sync failed:", e instanceof Error ? e.message : e);
      }
    }
    return NextResponse.json({ period });
  }

  if (body.action === "retry_sync") {
    const { data: period } = await ctx.db.from("finance_periods").select("status").eq("period_month", periodMonth).maybeSingle();
    if (period?.status !== "closed") {
      return NextResponse.json({ error: "Only closed months can be synced" }, { status: 400 });
    }
    const sync = await pushToMizark(ctx.db, ctx.user.id, periodMonth, start, end);
    return NextResponse.json({ sync });
  }

  return NextResponse.json({ error: "action must be 'close', 'reopen', or 'retry_sync'" }, { status: 400 });
}

async function pushToMizark(
  db: FinanceDb,
  actor: string,
  periodMonth: string,
  start: string,
  end: string,
): Promise<{ status: "synced" | "failed" | "skipped"; error?: string }> {
  if (!MIZARK_SYNC_URL || !LEADASH_SYNC_SECRET) return { status: "skipped" };

  try {
    const { data: txs } = await db.from("finance_transactions")
      .select("type, category, amount_ngn")
      .gte("date", start).lte("date", end);
    const summary = computePeriodSummary((txs ?? []) as Pick<FinanceTransaction, "type" | "category" | "amount_ngn">[]);

    const res = await fetch(MIZARK_SYNC_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-sync-secret": LEADASH_SYNC_SECRET },
      body:    JSON.stringify({ period_month: periodMonth, summary }),
      signal:  AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`mizark sync HTTP ${res.status}`);

    await db.from("finance_periods").update({ sync_status: "synced", synced_at: new Date().toISOString() }).eq("period_month", periodMonth);
    await db.from("finance_audit_log").insert({
      actor, action: "sync", entity_type: "finance_periods", entity_id: periodMonth,
      detail: { total_revenue: summary.total_revenue, net_profit: summary.net_profit },
    });
    return { status: "synced" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[finance/periods] mizark sync failed:", msg);
    await db.from("finance_periods").update({ sync_status: "failed" }).eq("period_month", periodMonth);
    return { status: "failed", error: msg };
  }
}
