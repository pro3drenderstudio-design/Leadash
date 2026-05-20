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

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const since24h = new Date(Date.now() - 86_400_000).toISOString();

  const [totalAccts, pendingKyc, activeAccts, pendingPayouts, volumeRes, tx24h] = await Promise.all([
    db.from("leadpay_accounts").select("id", { count: "exact", head: true }),
    db.from("leadpay_accounts").select("id", { count: "exact", head: true }).eq("kyc_status", "pending"),
    db.from("leadpay_accounts").select("id", { count: "exact", head: true }).eq("status", "active"),
    db.from("leadpay_payouts").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("leadpay_transactions").select("usd_amount_cents").eq("status", "completed").eq("type", "invoice_payment"),
    db.from("leadpay_transactions").select("id", { count: "exact", head: true }).gte("created_at", since24h),
  ]);

  const totalVolumeUsd = (volumeRes.data ?? []).reduce((s, t) => s + ((t.usd_amount_cents ?? 0) / 100), 0);

  return NextResponse.json({
    total_accounts:   totalAccts.count   ?? 0,
    pending_kyc:      pendingKyc.count   ?? 0,
    active_accounts:  activeAccts.count  ?? 0,
    pending_payouts:  pendingPayouts.count ?? 0,
    total_volume_usd: Math.round(totalVolumeUsd * 100) / 100,
    transactions_24h: tx24h.count ?? 0,
  });
}
