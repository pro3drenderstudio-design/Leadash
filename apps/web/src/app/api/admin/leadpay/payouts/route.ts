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

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const page   = Math.max(1, parseInt(searchParams.get("page")  ?? "1"));
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "25"));

  let query = db
    .from("leadpay_payouts")
    .select("*, bank_account:leadpay_bank_accounts(*), account:leadpay_accounts(legal_first_name, legal_last_name, business_name, workspace_id)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status && status !== "all") query = query.eq("status", status);

  const { data: payouts, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payouts: payouts ?? [], total: count ?? 0 });
}
