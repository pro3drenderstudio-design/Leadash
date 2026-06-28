import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createClient } from "@/lib/supabase/server";
import { getSignedPlaybackToken } from "@/lib/academy/mux";
import { isLessonUnlocked } from "@/types/academy";

/** GET /api/academy/lessons/[id]/token
 *  Returns a signed Mux playback token. Never exposes signing keys to client. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const { db, workspaceId, userId } = auth;

  const { data: lesson } = await db
    .from("academy_lessons").select("*, academy_sections(product_id)").eq("id", id).single();

  if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  if (!lesson.mux_playback_id) return NextResponse.json({ error: "No video" }, { status: 404 });

  const productId = (lesson.academy_sections as { product_id: string } | null)?.product_id;

  const { data: enrollment } = await db
    .from("academy_enrollments")
    .select("*")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("product_id", productId)
    .maybeSingle();

  // Allow free preview without enrollment
  if (!lesson.is_free_preview && !enrollment)
    return NextResponse.json({ error: "Not enrolled" }, { status: 403 });

  if (enrollment) {
    let cohort = null;
    if (enrollment.cohort_id) {
      const { data } = await db.from("academy_cohorts").select("*").eq("id", enrollment.cohort_id).single();
      cohort = data;
    }
    if (!isLessonUnlocked(lesson, enrollment, cohort))
      return NextResponse.json({ error: "Lesson not yet unlocked" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const viewerId = session?.user?.id ?? "anon";

  const token = await getSignedPlaybackToken(lesson.mux_playback_id, viewerId);
  return NextResponse.json({ token, playback_id: lesson.mux_playback_id });
}
