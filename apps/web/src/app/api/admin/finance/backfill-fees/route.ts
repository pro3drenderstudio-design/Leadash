/**
 * POST /api/admin/finance/backfill-fees
 *
 * One-time (re-runnable) backfill of Paystack transaction fees for historical
 * rows that predate fee capture. Paystack's verify-transaction API returns
 * `fees` for any past reference indefinitely, so we page through paid rows
 * missing fees_kobo and fill them in. Each call processes a small batch
 * (Vercel-friendly); the client loops until `remaining` reaches 0.
 *
 * Rows where Paystack reports no fee get fees_kobo=0 (not null) so they are
 * never reselected. Synthetic references Paystack doesn't recognize (e.g.
 * grant:/renewal:/bundle_renewal: prefixes) also get 0 — no fee is knowable.
 */
import { NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../_helpers";
import { verifyPaystackPayment } from "@/lib/billing/paystack";

export const maxDuration = 60;

const BATCH = 40;
const SPACING_MS = 120; // ~8 rps, well under Paystack's limits

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface BackfillTable {
  table: "billing_invoices" | "offer_purchases";
  refColumn: string;
  statusFilter: string;
}

const TARGETS: BackfillTable[] = [
  { table: "billing_invoices", refColumn: "paystack_reference", statusFilter: "paid" },
  { table: "offer_purchases",  refColumn: "paystack_reference", statusFilter: "paid" },
];

export async function POST() {
  const auth = await requireAdmin();
  if (!auth) return forbidden();
  const { user, db } = auth;

  let processed = 0;
  let filled = 0;

  for (const target of TARGETS) {
    if (processed >= BATCH) break;

    const { data: rows, error } = await db
      .from(target.table)
      .select(`id, ${target.refColumn}`)
      .is("fees_kobo", null)
      .not(target.refColumn, "is", null)
      .eq("status", target.statusFilter)
      .order("created_at", { ascending: true })
      .limit(BATCH - processed);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const row of (rows ?? []) as unknown as Array<Record<string, unknown>>) {
      const reference = row[target.refColumn] as string;
      let fees = 0; // default: unknowable (synthetic ref / Paystack miss) → 0, never reselect
      try {
        const verified = await verifyPaystackPayment(reference);
        if (verified.feesKobo != null) { fees = verified.feesKobo; filled++; }
      } catch {
        // Reference unknown to Paystack (synthetic refs like grant:/renewal:) — leave fees at 0
      }
      await db.from(target.table).update({ fees_kobo: fees }).eq("id", row.id as string);
      processed++;
      await sleep(SPACING_MS);
    }
  }

  // Remaining across both tables
  let remaining = 0;
  for (const target of TARGETS) {
    const { count } = await db
      .from(target.table)
      .select("id", { count: "exact", head: true })
      .is("fees_kobo", null)
      .not(target.refColumn, "is", null)
      .eq("status", target.statusFilter);
    remaining += count ?? 0;
  }

  console.log(`[backfill-fees] actor=${user.id} processed=${processed} filled=${filled} remaining=${remaining}`);
  return NextResponse.json({ processed, filled, remaining });
}
