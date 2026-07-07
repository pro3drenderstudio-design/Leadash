import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../../../_helpers";

// POST /api/admin/finance/income/[id]/test — flip is_test on a single row.
// Used by the "Mark test" / "Restore" per-row button in the Income tab.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const { id } = await params;

  const { data: current, error: fetchErr } = await ctx.db.from("finance_income").select("is_test").eq("id", id).single();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 404 });

  const { data, error } = await ctx.db.from("finance_income")
    .update({ is_test: !current.is_test }).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ income: data });
}
