import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ enrollmentId: string }> },
) {
  const { enrollmentId } = await params;
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { note } = await req.json() as { note: string };
  if (!note?.trim()) return NextResponse.json({ error: "note is required" }, { status: 400 });

  // Fetch lead_id from enrollment
  const { data: enrollment } = await db
    .from("outreach_enrollments")
    .select("lead_id")
    .eq("id", enrollmentId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!enrollment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await db
    .from("crm_notes")
    .insert({
      workspace_id:  workspaceId,
      lead_id:       enrollment.lead_id as string,
      enrollment_id: enrollmentId,
      body:          note.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
