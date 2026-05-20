import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, db };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db, user } = ctx;
  const { id } = await params;

  const { data: payout } = await db
    .from("leadpay_payouts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!payout) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json() as { action?: string; rejection_reason?: string; provider_ref?: string };
  const now  = new Date().toISOString();

  if (body.action === "approve") {
    if (payout.status !== "pending") {
      return NextResponse.json({ error: "Payout is not pending approval" }, { status: 409 });
    }
    const { data: updated } = await db
      .from("leadpay_payouts")
      .update({
        status:       "processing",
        approved_by:  user.id,
        approved_at:  now,
        provider_ref: body.provider_ref ?? null,
        updated_at:   now,
      })
      .eq("id", id)
      .select().single();

    await db.from("leadpay_transactions")
      .update({ status: "pending" })
      .eq("payout_id", id);

    return NextResponse.json({ payout: updated });
  }

  if (body.action === "complete") {
    const { data: updated } = await db
      .from("leadpay_payouts")
      .update({ status: "completed", provider_ref: body.provider_ref ?? payout.provider_ref, updated_at: now })
      .eq("id", id)
      .select().single();

    await db.from("leadpay_transactions")
      .update({ status: "completed" })
      .eq("payout_id", id);

    return NextResponse.json({ payout: updated });
  }

  if (body.action === "reject") {
    if (!body.rejection_reason?.trim()) {
      return NextResponse.json({ error: "rejection_reason required" }, { status: 400 });
    }
    // Refund balance
    const { data: acct } = await db.from("leadpay_accounts")
      .select("usd_balance_cents")
      .eq("workspace_id", payout.workspace_id)
      .maybeSingle();

    if (acct) {
      await db.from("leadpay_accounts").update({
        usd_balance_cents: acct.usd_balance_cents + payout.usd_amount_cents,
        updated_at:        now,
      }).eq("workspace_id", payout.workspace_id);
    }

    const { data: updated } = await db
      .from("leadpay_payouts")
      .update({
        status:           "failed",
        failure_reason:   body.rejection_reason.trim(),
        rejection_reason: body.rejection_reason.trim(),
        updated_at:       now,
      })
      .eq("id", id)
      .select().single();

    await db.from("leadpay_transactions")
      .update({ status: "failed" })
      .eq("payout_id", id);

    return NextResponse.json({ payout: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
