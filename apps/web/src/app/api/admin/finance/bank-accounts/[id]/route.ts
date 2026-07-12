import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../../_helpers";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const { id } = await params;
  const body = await req.json() as {
    name?: string; bank_name?: string; account_number_masked?: string; is_active?: boolean; is_default?: boolean;
  };

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.bank_name !== undefined) patch.bank_name = body.bank_name ? String(body.bank_name).trim() : null;
  if (body.account_number_masked !== undefined) patch.account_number_masked = body.account_number_masked ? String(body.account_number_masked).trim() : null;
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
  if (body.is_default !== undefined) patch.is_default = Boolean(body.is_default);

  if (!Object.keys(patch).length) return NextResponse.json({ error: "No recognized fields to update" }, { status: 400 });

  if (patch.is_default === true) {
    await ctx.db.from("finance_bank_accounts").update({ is_default: false }).eq("is_default", true);
  }

  const { data, error } = await ctx.db.from("finance_bank_accounts").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (patch.is_default === true) {
    await ctx.db.from("finance_settings").update({ default_bank_account_id: id }).eq("id", 1);
  }

  return NextResponse.json({ account: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const { id } = await params;

  const { count } = await ctx.db.from("finance_transactions").select("id", { count: "exact", head: true }).eq("bank_account_id", id);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: `${count} transaction(s) reference this account — reassign them first, or deactivate instead of deleting` }, { status: 400 });
  }

  const { error } = await ctx.db.from("finance_bank_accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
