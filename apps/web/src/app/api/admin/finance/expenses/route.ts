import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../_helpers";

const CATEGORIES = new Set(["infra","salaries","fees","marketing","software","oneoff","refunds"]);
const KINDS      = new Set(["recurring","oneoff"]);

// GET /api/admin/finance/expenses
// Returns { recurring: Expense[], oneoff: Expense[] } split by kind.
// Each recurring row includes its full amount history for effective-dated
// aggregation on the client.
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();

  const [{ data: expenses, error: eErr }, { data: history, error: hErr }] = await Promise.all([
    ctx.db.from("finance_expenses").select("*").order("since", { ascending: false }),
    ctx.db.from("finance_expense_history").select("*").order("effective_from", { ascending: true }),
  ]);
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });
  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });

  type HistoryRow = { expense_id: string; effective_from: string; amount_ngn: number };
  type ExpenseRow = { id: string; kind: "recurring" | "oneoff"; [k: string]: unknown };

  const historyByExpense: Record<string, { effective_from: string; amount_ngn: number }[]> = {};
  for (const h of (history ?? []) as HistoryRow[]) {
    (historyByExpense[h.expense_id] ??= []).push({ effective_from: h.effective_from, amount_ngn: h.amount_ngn });
  }

  const recurring = ((expenses ?? []) as ExpenseRow[]).filter(e => e.kind === "recurring")
    .map(e => ({ ...e, history: historyByExpense[e.id] ?? [] }));
  const oneoff    = ((expenses ?? []) as ExpenseRow[]).filter(e => e.kind === "oneoff");

  return NextResponse.json({ recurring, oneoff });
}

// POST /api/admin/finance/expenses — create expense
// The seed-history trigger inserts the initial history row for recurring kinds.
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const body = await req.json();

  const kind     = String(body.kind ?? "").trim();
  const name     = String(body.name ?? "").trim();
  const category = String(body.category ?? "").trim();
  const amount   = Number(body.amount_ngn);
  const since    = String(body.since ?? "").trim();

  if (!KINDS.has(kind))                  return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  if (!name)                             return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!CATEGORIES.has(category))         return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Amount must be > 0" }, { status: 400 });
  if (!since)                            return NextResponse.json({ error: "Date is required" }, { status: 400 });

  const { data, error } = await ctx.db.from("finance_expenses")
    .insert({ kind, name, category, amount_ngn: Math.round(amount), since, created_by: ctx.user.id })
    .select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ expense: data });
}

// PATCH /api/admin/finance/expenses — edit fields on an existing expense
// If amount changes on a recurring expense, we insert a history row dated
// today so the change takes effect from now, not retroactively.
export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const body = await req.json();
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const patch: Record<string, string | number> = {};
  if (body.name       !== undefined) patch.name       = String(body.name).trim();
  if (body.category   !== undefined) {
    if (!CATEGORIES.has(body.category)) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    patch.category = body.category;
  }
  if (body.amount_ngn !== undefined) {
    const amt = Number(body.amount_ngn);
    if (!Number.isFinite(amt) || amt <= 0) return NextResponse.json({ error: "Amount must be > 0" }, { status: 400 });
    patch.amount_ngn = Math.round(amt);
  }
  if (body.since !== undefined) patch.since = String(body.since);

  // Look up the current row to decide whether an amount change needs a
  // history entry (recurring only).
  const { data: current, error: fetchErr } = await ctx.db.from("finance_expenses").select("*").eq("id", id).single();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 404 });

  const { data, error } = await ctx.db.from("finance_expenses").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (current.kind === "recurring" && patch.amount_ngn !== undefined && patch.amount_ngn !== current.amount_ngn) {
    const today = new Date().toISOString().slice(0, 10);
    await ctx.db.from("finance_expense_history")
      .upsert({ expense_id: id, effective_from: today, amount_ngn: patch.amount_ngn, created_by: ctx.user.id },
              { onConflict: "expense_id,effective_from" });
  }

  return NextResponse.json({ expense: data });
}

// DELETE /api/admin/finance/expenses?id=…
export async function DELETE(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await ctx.db.from("finance_expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
