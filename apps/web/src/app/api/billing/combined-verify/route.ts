/**
 * POST /api/billing/combined-verify  { reference }
 *
 * Eager activation for a combined checkout — called by the callback page on
 * return from Paystack so the plan is active immediately instead of waiting on
 * the webhook. Idempotent with the webhook (both call activateCombinedCheckout,
 * keyed on the plan invoice's unique reference).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { verifyPaystackPayment } from "@/lib/billing/paystack";
import { activateCombinedCheckout } from "@/lib/billing/combined";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { reference } = await req.json() as { reference?: string };
  if (!reference) return NextResponse.json({ error: "reference required" }, { status: 400 });

  const { paid, metadata, authorizationCode, customerCode, customerEmail, amountKobo, feesKobo } = await verifyPaystackPayment(reference);
  if (!paid) return NextResponse.json({ error: "Payment not successful" }, { status: 402 });

  const meta = (metadata ?? {}) as Record<string, unknown>;
  if (meta.type !== "combined_checkout") {
    return NextResponse.json({ error: "Not a combined checkout" }, { status: 400 });
  }
  // Guard: the reference must belong to this workspace.
  if (meta.workspace_id && meta.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const planId    = meta.plan_id as string | undefined;
  const isAnnual  = (meta.interval as string | undefined) === "annual";
  const domainIds = String(meta.domain_record_ids ?? "").split(",").filter(Boolean);
  if (!planId) return NextResponse.json({ error: "Missing plan on payment" }, { status: 400 });

  const { alreadyDone } = await activateCombinedCheckout(db, {
    reference, workspaceId, planId, isAnnual, domainIds,
    authorizationCode, customerCode, customerEmail, amountKobo, feesKobo,
  });

  return NextResponse.json({ ok: true, already_done: alreadyDone });
}
