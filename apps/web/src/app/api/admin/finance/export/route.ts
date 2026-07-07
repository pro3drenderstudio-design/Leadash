import { NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../_helpers";

const CAT_LABEL: Record<string, string> = {
  infra: "Infrastructure", salaries: "Salaries", fees: "Payment fees",
  marketing: "Marketing", software: "Software & tools", oneoff: "Other", refunds: "Refunds",
};
const INCOME_LABEL: Record<string, string> = {
  plan: "Plan", academy: "Academy", offer: "Offer", credits: "Credits", addon: "Add-on",
  external: "External campaign", partner: "Partnership", consulting: "Consulting", grant: "Grant / other",
};

// GET /api/admin/finance/export — returns text/csv, one row per entry.
// Skips test-flagged income and paused recurring expenses (matches the P&L on
// screen). Consumers can save the response as leadash-financials.csv.
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();

  const [{ data: income }, { data: expenses }] = await Promise.all([
    ctx.db.from("finance_income").select("*").order("date", { ascending: false }),
    ctx.db.from("finance_expenses").select("*").order("since", { ascending: false }),
  ]);

  const rows: (string | number)[][] = [["Section", "Item", "Category", "Amount (NGN)", "Date"]];

  for (const i of (income ?? []) as { is_test: boolean; source_label: string; type: string; amount_ngn: number; date: string }[]) {
    if (i.is_test) continue;
    rows.push(["Income", i.source_label, INCOME_LABEL[i.type] ?? i.type, i.amount_ngn, i.date]);
  }
  for (const e of (expenses ?? []) as { kind: string; status: string; name: string; category: string; amount_ngn: number; since: string }[]) {
    if (e.kind === "recurring" && e.status !== "active") continue;
    const section = e.kind === "recurring" ? "Recurring expense" : "One-off expense";
    rows.push([section, e.name, CAT_LABEL[e.category] ?? e.category, e.amount_ngn, e.since]);
  }

  const csv = rows.map(r => r.map(c => {
    const s = String(c);
    return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leadash-financials-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}
