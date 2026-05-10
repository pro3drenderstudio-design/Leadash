import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const lessonId = req.nextUrl.searchParams.get("lesson_id");
  if (!lessonId) return NextResponse.json({ error: "lesson_id required" }, { status: 400 });

  const { db, userId } = auth;

  const { data } = await db
    .from("academy_notes")
    .select("*")
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  return NextResponse.json({ note: data });
}

export async function PUT(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const { db, workspaceId, userId } = auth;

  let body: { lesson_id?: string; product_id?: string; body?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { lesson_id, product_id, body: text } = body;
  if (!lesson_id || !product_id) return NextResponse.json({ error: "lesson_id and product_id required" }, { status: 400 });

  const { data: enrollment } = await db
    .from("academy_enrollments")
    .select("id")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("product_id", product_id)
    .maybeSingle();

  if (!enrollment) return NextResponse.json({ error: "Not enrolled" }, { status: 403 });

  const { data, error } = await db.from("academy_notes")
    .upsert({
      enrollment_id: enrollment.id,
      lesson_id,
      user_id: userId,
      body:    text ?? "",
      updated_at: new Date().toISOString(),
    }, { onConflict: "enrollment_id,lesson_id" })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}
