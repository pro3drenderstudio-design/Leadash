/**
 * /api/admin/finance/principals
 *
 * Lightweight investor/principal registry — just enough to pick from when
 * recording an equity transaction and see "total contributed per person"
 * without building a full cap table (equity %, vesting, etc.).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../_helpers";

// GET — list principals with running equity totals (in/out/net), computed
// from finance_transactions rather than stored, so it's always accurate.
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();

  const { data: principals, error } = await ctx.db.from("finance_principals").select("*").order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: txs } = await ctx.db
    .from("finance_transactions")
    .select("principal_id, category, amount_ngn")
    .eq("type", "equity")
    .not("principal_id", "is", null);

  const totals = new Map<string, { in: number; out: number }>();
  for (const tx of (txs ?? []) as { principal_id: string; category: string; amount_ngn: number }[]) {
    const t = totals.get(tx.principal_id) ?? { in: 0, out: 0 };
    if (tx.category === "equity.investment" || tx.category === "equity.loan_in") t.in += tx.amount_ngn;
    else t.out += tx.amount_ngn;
    totals.set(tx.principal_id, t);
  }

  return NextResponse.json({
    principals: (principals ?? []).map((p: { id: string; name: string; kind: string; notes: string | null; created_at: string }) => {
      const t = totals.get(p.id) ?? { in: 0, out: 0 };
      return { ...p, total_in_ngn: t.in, total_out_ngn: t.out, net_contributed_ngn: t.in - t.out };
    }),
  });
}

// POST — create a principal
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const body = await req.json() as { name?: string; kind?: "individual" | "entity"; notes?: string };

  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (body.kind && !["individual", "entity"].includes(body.kind)) {
    return NextResponse.json({ error: "kind must be 'individual' or 'entity'" }, { status: 400 });
  }

  const { data, error } = await ctx.db.from("finance_principals").insert({
    name: body.name.trim(),
    kind: body.kind ?? "individual",
    notes: body.notes?.trim() || null,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ principal: { ...data, total_in_ngn: 0, total_out_ngn: 0, net_contributed_ngn: 0 } });
}
