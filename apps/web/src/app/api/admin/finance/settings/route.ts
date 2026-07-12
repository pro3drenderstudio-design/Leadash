import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../_helpers";

// GET /api/admin/finance/settings — always returns the singleton row (id=1).
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();

  const { data, error } = await ctx.db.from("finance_settings").select("*").eq("id", 1).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

// PUT /api/admin/finance/settings — updates reserves and/or tax settings.
export async function PUT(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const body = await req.json();

  const patch: Record<string, unknown> = { updated_by: ctx.user.id };

  if (body.reserves_ngn !== undefined) {
    const reserves = Number(body.reserves_ngn);
    if (!Number.isFinite(reserves) || reserves < 0) {
      return NextResponse.json({ error: "reserves_ngn must be >= 0" }, { status: 400 });
    }
    patch.reserves_ngn = Math.round(reserves);
  }
  if (body.vat_registered !== undefined) {
    patch.vat_registered = Boolean(body.vat_registered);
  }
  if (body.vat_pricing_mode !== undefined) {
    if (!["inclusive", "exclusive"].includes(body.vat_pricing_mode)) {
      return NextResponse.json({ error: "vat_pricing_mode must be 'inclusive' or 'exclusive'" }, { status: 400 });
    }
    patch.vat_pricing_mode = body.vat_pricing_mode;
  }
  if (body.firs_tin !== undefined) {
    patch.firs_tin = body.firs_tin ? String(body.firs_tin).trim() : null;
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "No recognized fields to update" }, { status: 400 });
  }

  const { data, error } = await ctx.db.from("finance_settings")
    .update(patch)
    .eq("id", 1).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
