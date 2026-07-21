import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

export async function GET(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const productId = req.nextUrl.searchParams.get("product_id");
  const cohortId  = req.nextUrl.searchParams.get("cohort_id");
  const status    = req.nextUrl.searchParams.get("status");

  let query = db.from("academy_enrollments")
    // FK hint required — see api/academy/progress/route.ts: winner_enrollment_id
    // makes a bare academy_cohorts embed ambiguous (PGRST201).
    .select("*, workspaces(name), academy_cohorts!academy_enrollments_cohort_id_fkey(name)")
    .order("enrolled_at", { ascending: false })
    .limit(200);

  if (productId) query = query.eq("product_id", productId);
  if (cohortId)  query = query.eq("cohort_id", cohortId);
  if (status)    query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enrollments: data });
}

/** Grant free/admin access to a user */
export async function POST(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    user_id?: string;
    workspace_id?: string;
    product_id?: string;
    cohort_id?: string;
    access_type?: string;
    phone?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { user_id, workspace_id, product_id, cohort_id, access_type = "admin_granted", phone } = body;
  if (!user_id || !workspace_id || !product_id)
    return NextResponse.json({ error: "user_id, workspace_id, product_id required" }, { status: 400 });

  const { data, error } = await db.from("academy_enrollments")
    .insert({ user_id, workspace_id, product_id, cohort_id, access_type, phone, status: "active" })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enrollment: data }, { status: 201 });
}

/** Update enrollment (change cohort, status, etc.) */
export async function PATCH(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: string; status?: string; cohort_id?: string; access_type?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await db.from("academy_enrollments").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enrollment: data });
}
