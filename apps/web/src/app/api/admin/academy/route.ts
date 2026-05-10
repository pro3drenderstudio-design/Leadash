import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

// GET — all products, cohorts, enrollments summary
export async function GET(req: NextRequest) {
  const db = await requireAdmin(req);
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [productsRes, cohortsRes, enrollmentsRes, modulesRes] = await Promise.all([
    db.from("academy_products").select("*").order("price_ngn"),
    db.from("academy_cohorts").select("*").order("starts_at", { ascending: false }),
    db.from("academy_enrollments")
      .select("id, product_id, status, enrolled_at, workspace_id, workspaces(name)")
      .order("enrolled_at", { ascending: false })
      .limit(100),
    db.from("academy_modules").select("id, product_id, day_number, title, mux_playback_id, unlock_offset_hours").order("day_number"),
  ]);

  return NextResponse.json({
    products:    productsRes.data    ?? [],
    cohorts:     cohortsRes.data     ?? [],
    enrollments: enrollmentsRes.data ?? [],
    modules:     modulesRes.data     ?? [],
  });
}
