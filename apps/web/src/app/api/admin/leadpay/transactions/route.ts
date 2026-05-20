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
  const page   = Math.max(1, parseInt(searchParams.get("page")   ?? "1"));
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "25"));
  const type   = searchParams.get("type");
  const status = searchParams.get("status");
  const search = searchParams.get("search")?.trim();
  const wsId   = searchParams.get("workspace_id");

  let query = db
    .from("leadpay_transactions")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (type   && type   !== "all") query = query.eq("type",   type);
  if (status && status !== "all") query = query.eq("status", status);
  if (wsId)                        query = query.eq("workspace_id", wsId);
  if (search) {
    query = query.or(`description.ilike.%${search}%,reference.ilike.%${search}%`);
  }

  const { data: transactions, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transactions: transactions ?? [], total: count ?? 0 });
}
