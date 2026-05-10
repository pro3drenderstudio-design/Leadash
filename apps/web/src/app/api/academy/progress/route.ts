import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const { db, workspaceId } = auth;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { module_id?: string; product_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { module_id, product_id } = body;
  if (!module_id || !product_id) return NextResponse.json({ error: "module_id and product_id required" }, { status: 400 });

  const { data: enrollment } = await db
    .from("academy_enrollments")
    .select("id")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("product_id", product_id)
    .eq("status", "active")
    .maybeSingle();

  if (!enrollment) return NextResponse.json({ error: "Not enrolled" }, { status: 403 });

  await db.from("academy_progress")
    .insert({ enrollment_id: enrollment.id, module_id })
    .throwOnError()
    .then(() => {})
    .catch(e => { if (e.code !== "23505") throw e; });

  const { count } = await db
    .from("academy_progress")
    .select("*", { count: "exact", head: true })
    .eq("enrollment_id", enrollment.id);

  const { count: total } = await db
    .from("academy_modules")
    .select("*", { count: "exact", head: true })
    .eq("product_id", product_id);

  if (count && total && count >= total) {
    await db.from("academy_enrollments")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", enrollment.id);
  }

  return NextResponse.json({ ok: true, progress: count, total });
}
