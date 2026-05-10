import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const lessonId = req.nextUrl.searchParams.get("lesson_id");
  if (!lessonId) return NextResponse.json({ error: "lesson_id required" }, { status: 400 });

  const { db } = auth;

  const { data, error } = await db
    .from("academy_comments")
    .select("*, profiles:user_id(full_name, avatar_url)")
    .eq("lesson_id", lessonId)
    .is("parent_id", null)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch replies for top-level comments
  const commentIds = (data ?? []).map(c => c.id);
  let replies: unknown[] = [];
  if (commentIds.length) {
    const { data: replyData } = await db
      .from("academy_comments")
      .select("*, profiles:user_id(full_name, avatar_url)")
      .in("parent_id", commentIds)
      .order("created_at", { ascending: true });
    replies = replyData ?? [];
  }

  const comments = (data ?? []).map(c => ({
    ...c,
    user_name:   (c.profiles as Record<string, string> | null)?.full_name ?? "User",
    user_avatar: (c.profiles as Record<string, string> | null)?.avatar_url ?? null,
    replies: replies
      .filter((r: unknown) => (r as { parent_id: string }).parent_id === c.id)
      .map((r: unknown) => {
        const reply = r as Record<string, unknown>;
        return {
          ...reply,
          user_name:   (reply.profiles as Record<string, string> | null)?.full_name ?? "User",
          user_avatar: (reply.profiles as Record<string, string> | null)?.avatar_url ?? null,
        };
      }),
  }));

  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const { db, workspaceId, userId } = auth;

  let body: { lesson_id?: string; product_id?: string; body?: string; parent_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { lesson_id, product_id, body: text, parent_id } = body;
  if (!lesson_id || !product_id || !text?.trim())
    return NextResponse.json({ error: "lesson_id, product_id, body required" }, { status: 400 });

  const { data: enrollment } = await db
    .from("academy_enrollments")
    .select("id")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("product_id", product_id)
    .eq("status", "active")
    .maybeSingle();

  if (!enrollment) return NextResponse.json({ error: "Not enrolled" }, { status: 403 });

  const { data, error } = await db.from("academy_comments")
    .insert({ lesson_id, enrollment_id: enrollment.id, user_id: userId, body: text.trim(), parent_id: parent_id ?? null })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data }, { status: 201 });
}
