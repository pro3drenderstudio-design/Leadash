/**
 * POST /api/admin/finance/transactions/[id]/test — flip is_test on a ledger row.
 * Used from the Income tab so an admin can quarantine a specific payment
 * (Paystack test transaction, mistaken confirmation, etc.) from all totals
 * without deleting it.
 */
import { NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../../../_helpers";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const { id } = await params;

  const { data: current, error: fetchErr } = await ctx.db
    .from("finance_transactions").select("is_test, source_type, source_id, kind").eq("id", id).single();
  if (fetchErr || !current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const next = !current.is_test;
  const { data, error } = await ctx.db.from("finance_transactions")
    .update({ is_test: next, updated_at: new Date().toISOString() })
    .eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mirror onto the source finance_income row if this is a mirrored manual
  // entry — keeps the two surfaces in sync for the Income tab flag column.
  if (current.source_type === "finance_income" && current.kind === "mirror" && current.source_id) {
    await ctx.db.from("finance_income").update({ is_test: next }).eq("id", current.source_id);
  }

  await ctx.db.from("finance_audit_log").insert({
    actor: ctx.user.id, action: next ? "flag_test" : "unflag_test",
    entity_type: "finance_transactions", entity_id: id,
    detail: {},
  });

  return NextResponse.json({ transaction: data });
}
