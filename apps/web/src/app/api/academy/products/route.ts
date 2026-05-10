import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const { db, workspaceId } = auth;

  const [productsRes, enrollmentsRes, cohortsRes, progressRes, modulesRes] = await Promise.all([
    db.from("academy_products").select("*").eq("is_active", true).order("price_ngn"),
    userId
      ? db.from("academy_enrollments").select("*").eq("user_id", userId).eq("workspace_id", workspaceId)
      : Promise.resolve({ data: [] }),
    db.from("academy_cohorts").select("*").in("status", ["upcoming", "active"]).order("starts_at"),
    userId
      ? db.from("academy_progress")
          .select("enrollment_id")
          .in("enrollment_id",
            (await db.from("academy_enrollments").select("id").eq("user_id", userId).eq("workspace_id", workspaceId)).data?.map(e => e.id) ?? []
          )
      : Promise.resolve({ data: [] }),
    db.from("academy_modules").select("id, product_id"),
  ]);

  const enrollments = enrollmentsRes.data ?? [];
  const cohorts     = cohortsRes.data ?? [];
  const allProgress = progressRes.data ?? [];
  const allModules  = modulesRes.data ?? [];

  const products = (productsRes.data ?? []).map(p => {
    const enrollment = enrollments.find(e => e.product_id === p.id) ?? null;
    const cohort     = enrollment?.cohort_id
      ? cohorts.find(c => c.id === enrollment.cohort_id) ?? null
      : cohorts.find(c => c.product_id === p.id) ?? null;
    const progress_count = enrollment
      ? allProgress.filter(pr => pr.enrollment_id === enrollment.id).length
      : 0;
    const module_count = allModules.filter(m => m.product_id === p.id).length;
    return { ...p, enrollment, cohort, progress_count, module_count };
  });

  return NextResponse.json({ products });
}
