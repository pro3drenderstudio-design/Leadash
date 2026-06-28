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

/** GET /api/admin/academy/live-sessions?product_id=xxx
 *  Returns live sessions for a product, joined through their backing lesson. */
export async function GET(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const productId = req.nextUrl.searchParams.get("product_id");
  if (!productId) return NextResponse.json({ error: "product_id required" }, { status: 400 });

  const { data, error } = await db
    .from("academy_live_sessions")
    .select("id, lesson_id, scheduled_at, duration_mins, platform, join_url, academy_lessons!inner(product_id, title)")
    .eq("academy_lessons.product_id", productId)
    .order("scheduled_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  interface SessionRow {
    id: string;
    lesson_id: string;
    scheduled_at: string;
    duration_mins: number;
    platform: string;
    join_url: string;
    academy_lessons: { title: string } | null;
  }

  const sessions = ((data ?? []) as unknown as SessionRow[]).map((row) => {
    const lesson = row.academy_lessons;
    return {
      id: row.id,
      lesson_id: row.lesson_id,
      scheduled_at: row.scheduled_at,
      duration_mins: row.duration_mins,
      platform: row.platform,
      join_url: row.join_url,
      lesson_title: lesson?.title ?? "",
    };
  });

  return NextResponse.json({ sessions });
}

/** POST /api/admin/academy/live-sessions
 *  Body: { product_id, section_id, title, scheduled_at, duration_mins, platform, join_url }
 *  A live session must be backed by a lesson row (academy_live_sessions.lesson_id is NOT NULL) —
 *  this creates both in one call so the admin doesn't need to manage the lesson separately. */
export async function POST(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    product_id?: string;
    section_id?: string;
    title?: string;
    scheduled_at?: string;
    duration_mins?: number;
    platform?: string;
    join_url?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { product_id, title, scheduled_at, join_url } = body;
  const duration_mins = body.duration_mins ?? 60;
  const platform = body.platform ?? "zoom";

  if (!product_id || !title || !scheduled_at || !join_url) {
    return NextResponse.json({ error: "product_id, title, scheduled_at, join_url required" }, { status: 400 });
  }

  // Resolve (or create) a section to hold the backing lesson.
  let sectionId = body.section_id;
  if (!sectionId) {
    const { data: existingSection } = await db
      .from("academy_sections")
      .select("id")
      .eq("product_id", product_id)
      .order("position")
      .limit(1)
      .maybeSingle();
    if (existingSection) {
      sectionId = existingSection.id;
    } else {
      const { data: newSection, error: sectionErr } = await db
        .from("academy_sections")
        .insert({ product_id, title: "Live sessions", position: 0 })
        .select("id")
        .single();
      if (sectionErr) return NextResponse.json({ error: sectionErr.message }, { status: 500 });
      sectionId = newSection.id;
    }
  }

  const { count } = await db.from("academy_lessons").select("*", { count: "exact", head: true }).eq("section_id", sectionId);

  const { data: lesson, error: lessonErr } = await db
    .from("academy_lessons")
    .insert({
      section_id: sectionId,
      product_id,
      title,
      lesson_type: "live",
      position: count ?? 0,
      is_published: false,
    })
    .select("id")
    .single();
  if (lessonErr) return NextResponse.json({ error: lessonErr.message }, { status: 500 });

  const { data: session, error: sessionErr } = await db
    .from("academy_live_sessions")
    .insert({ lesson_id: lesson.id, scheduled_at, duration_mins, platform, join_url })
    .select()
    .single();
  if (sessionErr) {
    await db.from("academy_lessons").delete().eq("id", lesson.id);
    return NextResponse.json({ error: sessionErr.message }, { status: 500 });
  }

  return NextResponse.json({ session: { ...session, lesson_title: title } }, { status: 201 });
}
