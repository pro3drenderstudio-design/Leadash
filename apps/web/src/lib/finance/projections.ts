/**
 * Expands stored `finance_projections` rows (which may be recurring) into
 * concrete dated instances within a date range — a "monthly" projection
 * yields one instance per month it overlaps, a "once" projection yields at
 * most one instance. The output shape matches what `computePeriodSummary`
 * expects, so projected and actual totals can be aggregated with the exact
 * same rollup logic and compared like-for-like.
 */
import type { TxType } from "./tax";

export interface StoredProjection {
  id: string;
  type: TxType;
  category: string;
  amount_ngn: number;
  label: string | null;
  recurrence: "once" | "monthly" | "quarterly" | "yearly";
  start_date: string;
  end_date: string | null;
  bank_account_id: string | null;
}

export interface ProjectionInstance {
  projection_id: string;
  date: string;
  type: TxType;
  category: string;
  amount_ngn: number;
  label: string | null;
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Expands one projection into every instance date within [rangeStart, rangeEnd]. */
function expandOne(p: StoredProjection, rangeStart: string, rangeEnd: string): ProjectionInstance[] {
  const instances: ProjectionInstance[] = [];
  const effectiveEnd = p.end_date && p.end_date < rangeEnd ? p.end_date : rangeEnd;
  if (p.start_date > effectiveEnd) return instances;

  if (p.recurrence === "once") {
    if (p.start_date >= rangeStart && p.start_date <= rangeEnd) {
      instances.push({ projection_id: p.id, date: p.start_date, type: p.type, category: p.category, amount_ngn: p.amount_ngn, label: p.label });
    }
    return instances;
  }

  const step = p.recurrence === "monthly" ? 1 : p.recurrence === "quarterly" ? 3 : 12;
  let cursor = p.start_date;
  // Fast-forward cursor to the first instance at/after rangeStart without an unbounded loop.
  if (cursor < rangeStart) {
    const cursorDate = new Date(`${cursor}T00:00:00Z`);
    const startDate = new Date(`${rangeStart}T00:00:00Z`);
    const monthsBetween = (startDate.getUTCFullYear() - cursorDate.getUTCFullYear()) * 12 + (startDate.getUTCMonth() - cursorDate.getUTCMonth());
    const steps = Math.max(0, Math.floor(monthsBetween / step));
    cursor = addMonths(cursor, steps * step);
    while (cursor < rangeStart) cursor = addMonths(cursor, step);
  }

  let guard = 0;
  while (cursor <= effectiveEnd && guard < 1000) {
    if (cursor >= rangeStart) {
      instances.push({ projection_id: p.id, date: cursor, type: p.type, category: p.category, amount_ngn: p.amount_ngn, label: p.label });
    }
    cursor = addMonths(cursor, step);
    guard++;
  }
  return instances;
}

export function expandProjections(projections: StoredProjection[], rangeStart: string, rangeEnd: string): ProjectionInstance[] {
  return projections.flatMap(p => expandOne(p, rangeStart, rangeEnd));
}
