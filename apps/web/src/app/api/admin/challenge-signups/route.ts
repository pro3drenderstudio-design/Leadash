import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? { db, userId: user.id } : null;
}

// GET /api/admin/challenge-signups
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;

  const status = req.nextUrl.searchParams.get("status") || "pending";
  const search = req.nextUrl.searchParams.get("search")?.trim() || null;
  const page   = Math.max(0, parseInt(req.nextUrl.searchParams.get("page") ?? "0") || 0);
  const PAGE   = 50;

  let q = db
    .from("challenge_signups")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * PAGE, (page + 1) * PAGE - 1);

  if (status !== "all") q = q.eq("status", status);
  if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signups: data ?? [], total: count ?? 0, page });
}
