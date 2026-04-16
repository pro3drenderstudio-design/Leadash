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

// GET /api/admin/beta — list all enrollments
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url   = new URL(req.url);
  const status = url.searchParams.get("status") ?? "all";

  let query = ctx.db
    .from("beta_enrollments")
    .select("id, user_id, workspace_id, email, name, reason, status, review_note, reviewed_at, created_at")
    .order("created_at", { ascending: false });

  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ enrollments: data ?? [] });
}
