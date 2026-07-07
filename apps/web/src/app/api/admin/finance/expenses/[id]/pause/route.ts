import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../../../_helpers";

// POST /api/admin/finance/expenses/[id]/pause — toggle status active↔paused.
// Only meaningful for recurring expenses; called from the pause/resume icon
// button in the recurring-expenses table.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const { id } = await params;

  const { data: current, error: fetchErr } = await ctx.db.from("finance_expenses").select("status,kind").eq("id", id).single();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 404 });
  if (current.kind !== "recurring") return NextResponse.json({ error: "Only recurring expenses can be paused" }, { status: 400 });

  const next = current.status === "active" ? "paused" : "active";
  const { data, error } = await ctx.db.from("finance_expenses").update({ status: next }).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expense: data });
}
