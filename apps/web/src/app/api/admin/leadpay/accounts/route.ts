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
  const kyc    = searchParams.get("kyc_status");
  const search = searchParams.get("search")?.trim();
  const page   = Math.max(1, parseInt(searchParams.get("page")  ?? "1"));
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "25"));

  let query = db
    .from("leadpay_accounts")
    .select("*, workspace:workspaces(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (kyc && kyc !== "all") query = query.eq("kyc_status", kyc);
  if (search) {
    query = query.or(
      `legal_first_name.ilike.%${search}%,legal_last_name.ilike.%${search}%,business_name.ilike.%${search}%`
    );
  }

  const { data: accounts, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accounts: accounts ?? [], total: count ?? 0 });
}
