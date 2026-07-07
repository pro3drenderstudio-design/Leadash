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

// PUT /api/admin/finance/settings — updates reserves.
export async function PUT(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const body = await req.json();

  const reserves = Number(body.reserves_ngn);
  if (!Number.isFinite(reserves) || reserves < 0) {
    return NextResponse.json({ error: "reserves_ngn must be >= 0" }, { status: 400 });
  }

  const { data, error } = await ctx.db.from("finance_settings")
    .update({ reserves_ngn: Math.round(reserves), updated_by: ctx.user.id })
    .eq("id", 1).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
