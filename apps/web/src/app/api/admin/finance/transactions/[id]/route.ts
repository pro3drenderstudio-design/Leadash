/**
 * /api/admin/finance/transactions/[id]
 *
 * PATCH — edit a manual entry, or review-actions on any row (auto rows accept
 * ONLY review fields: review_status/review_note). DELETE — manual rows only.
 * The DB period-lock trigger independently rejects content edits in closed
 * months, so a stale client can't bypass the close.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../../_helpers";
import { TYPES, CATEGORIES, type TxType } from "@/lib/finance/tax";

const VALID_TYPES = Object.keys(TYPES) as TxType[];
const REVIEW_STATUSES = ["unreviewed", "reviewed", "flagged"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;

  const { data: row } = await ctx.db.from("finance_transactions").select("*").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  let isReviewAction = false;

  // Review fields — allowed on every row
  if (body.review_status !== undefined) {
    if (!REVIEW_STATUSES.includes(body.review_status as string)) {
      return NextResponse.json({ error: "Invalid review_status" }, { status: 400 });
    }
    patch.review_status = body.review_status;
    patch.reviewed_by   = ctx.user.id;
    patch.reviewed_at   = new Date().toISOString();
    isReviewAction = true;
  }
  if (body.review_note !== undefined) {
    patch.review_note = body.review_note ? String(body.review_note).trim() : null;
    isReviewAction = true;
  }

  // Content fields — manual rows only
  const contentKeys = ["date", "type", "category", "amount_ngn", "description", "reference"] as const;
  const hasContentEdit = contentKeys.some(k => body[k] !== undefined);
  if (hasContentEdit) {
    if (row.is_auto) {
      return NextResponse.json({ error: "Auto-recorded rows can't be edited — add an adjusting entry instead" }, { status: 400 });
    }
    if (body.date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      patch.date = body.date;
    }
    if (body.type !== undefined) {
      if (!VALID_TYPES.includes(body.type as TxType)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });
      patch.type = body.type;
    }
    const effType = (patch.type ?? row.type) as TxType;
    if (body.category !== undefined) {
      if (!CATEGORIES[effType]?.[body.category as string]) return NextResponse.json({ error: "Unknown category for this type" }, { status: 400 });
      patch.category = body.category;
    }
    if (body.amount_ngn !== undefined) {
      const amount = Number(body.amount_ngn);
      if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "amount_ngn must be >= 0" }, { status: 400 });
      patch.amount_ngn = amount;
    }
    if (body.description !== undefined) patch.description = body.description ? String(body.description).trim() : null;
    if (body.reference   !== undefined) patch.reference   = body.reference ? String(body.reference).trim() : null;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "No recognized fields to update" }, { status: 400 });
  }

  const { data, error } = await ctx.db.from("finance_transactions").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await ctx.db.from("finance_audit_log").insert({
    actor:       ctx.user.id,
    action:      isReviewAction && !hasContentEdit
      ? (patch.review_status === "flagged" ? "flag" : "review")
      : "manual_edit",
    entity_type: "finance_transactions",
    entity_id:   id,
    detail:      patch,
  });

  return NextResponse.json({ transaction: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const { id } = await params;

  const { data: row } = await ctx.db.from("finance_transactions").select("id, is_auto, date, type, category, amount_ngn").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.is_auto) {
    return NextResponse.json({ error: "Auto-recorded rows can't be deleted — add an adjusting entry instead" }, { status: 400 });
  }

  const { error } = await ctx.db.from("finance_transactions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await ctx.db.from("finance_audit_log").insert({
    actor:       ctx.user.id,
    action:      "manual_delete",
    entity_type: "finance_transactions",
    entity_id:   id,
    detail:      { date: row.date, type: row.type, category: row.category, amount_ngn: row.amount_ngn },
  });

  return NextResponse.json({ ok: true });
}
