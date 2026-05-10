import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const productId = req.nextUrl.searchParams.get("product_id");
  if (!productId) return NextResponse.json({ error: "product_id required" }, { status: 400 });

  const { db, workspaceId } = auth;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const [modulesRes, enrollmentRes] = await Promise.all([
    db.from("academy_modules")
      .select("*")
      .eq("product_id", productId)
      .order("day_number"),
    userId
      ? db.from("academy_enrollments")
          .select("*, academy_cohorts(*)")
          .eq("user_id", userId)
          .eq("workspace_id", workspaceId)
          .eq("product_id", productId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const modules    = modulesRes.data ?? [];
  const enrollment = enrollmentRes.data;
  const cohort     = (enrollment as Record<string, unknown> | null)?.academy_cohorts as { starts_at: string } | null ?? null;

  let progressSet = new Set<string>();
  if (enrollment) {
    const { data: progress } = await db
      .from("academy_progress")
      .select("module_id")
      .eq("enrollment_id", enrollment.id);
    progressSet = new Set((progress ?? []).map((p: { module_id: string }) => p.module_id));
  }

  const now = Date.now();
  const cohortStart = cohort ? new Date(cohort.starts_at).getTime() : null;

  const modulesWithState = (modules as Record<string, unknown>[]).map(m => {
    const unlocked = cohortStart === null
      ? true
      : now >= cohortStart + (m.unlock_offset_hours as number) * 3_600_000;
    return {
      ...m,
      unlocked,
      completed: progressSet.has(m.id as string),
    };
  });

  return NextResponse.json({
    modules: modulesWithState,
    enrollment: enrollment
      ? { ...enrollment, academy_cohorts: undefined, cohort }
      : null,
  });
}
