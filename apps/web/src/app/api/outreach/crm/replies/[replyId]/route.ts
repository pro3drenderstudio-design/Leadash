import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ replyId: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { replyId } = await params;

  const body = await req.json();

  // Update reply
  const update: Record<string, unknown> = {};
  if (body.enrollment_id !== undefined) update.enrollment_id = body.enrollment_id;
  if (body.is_filtered   !== undefined) update.is_filtered   = body.is_filtered;

  const { error } = await db
    .from("outreach_replies")
    .update(update)
    .eq("id", replyId)
    .eq("workspace_id", workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If matching to an enrollment, mark it as replied
  if (body.enrollment_id) {
    await db
      .from("outreach_enrollments")
      .update({ status: "replied", crm_status: "neutral" })
      .eq("id", body.enrollment_id)
      .eq("workspace_id", workspaceId)
      .eq("status", "active");
  }

  return NextResponse.json({ ok: true });
}
