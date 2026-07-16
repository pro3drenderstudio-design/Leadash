/**
 * /api/admin/finance/source-routing
 * Maps each auto-sync source (paystack, challenge_signups, manual) to a
 * bank account. Auto-sync triggers consult this map before falling back to
 * finance_settings.default_bank_account_id.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../_helpers";

const KNOWN_SOURCES = new Set(["paystack", "challenge_signups", "manual"]);

export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const { data, error } = await ctx.db.from("finance_source_routing").select("*").order("source_type");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ routing: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const body = await req.json() as { source_type?: string; bank_account_id?: string | null };
  if (!body.source_type || !KNOWN_SOURCES.has(body.source_type)) {
    return NextResponse.json({ error: `source_type must be one of ${[...KNOWN_SOURCES].join(", ")}` }, { status: 400 });
  }
  const patch = {
    source_type:     body.source_type,
    bank_account_id: body.bank_account_id || null,
    updated_at:      new Date().toISOString(),
    updated_by:      ctx.user.id,
  };
  const { data, error } = await ctx.db.from("finance_source_routing")
    .upsert(patch, { onConflict: "source_type" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await ctx.db.from("finance_audit_log").insert({
    actor: ctx.user.id, action: "route_source",
    entity_type: "finance_source_routing", entity_id: body.source_type,
    detail: { bank_account_id: body.bank_account_id ?? null },
  });

  return NextResponse.json({ routing: data });
}
