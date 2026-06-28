import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const lessonId = req.nextUrl.searchParams.get("lesson_id");
  if (!lessonId) return NextResponse.json({ error: "lesson_id required" }, { status: 400 });

  const { db } = auth;

  // academy_comments.user_id references auth.users, not a public "profiles"
  // table (no such table exists in this schema) — so commenter names/avatars
  // have to be looked up via the auth admin API rather than a PostgREST embed.
  const { data, error } = await db
    .from("academy_comments")
    .select("*")
    .eq("lesson_id", lessonId)
    .is("parent_id", null)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch replies for top-level comments
  const commentIds = (data ?? []).map((c: { id: string }) => c.id);
  let replies: Record<string, unknown>[] = [];
  if (commentIds.length) {
    const { data: replyData } = await db
      .from("academy_comments")
      .select("*")
      .in("parent_id", commentIds)
      .order("created_at", { ascending: true });
    replies = replyData ?? [];
  }

  type AuthUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };
  const { data: { users } } = await db.auth.admin.listUsers({ perPage: 1000 });
  const userMap = new Map<string, AuthUser>((users as AuthUser[]).map((u) => [u.id, u]));

  function withUser(c: Record<string, unknown>) {
    const u = userMap.get(c.user_id as string);
    return {
      ...c,
      user_name:   (u?.user_metadata as { full_name?: string } | undefined)?.full_name || u?.email?.split("@")[0] || "User",
      user_avatar: null,
    };
  }

  const comments = (data ?? []).map((c: Record<string, unknown>) => ({
    ...withUser(c),
    replies: replies
      .filter((r) => r.parent_id === c.id)
      .map(withUser),
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
    .in("status", ["active", "completed"])
    .maybeSingle();

  if (!enrollment) return NextResponse.json({ error: "Not enrolled" }, { status: 403 });

  const { data, error } = await db.from("academy_comments")
    .insert({ lesson_id, enrollment_id: enrollment.id, user_id: userId, body: text.trim(), parent_id: parent_id ?? null })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data }, { status: 201 });
}
