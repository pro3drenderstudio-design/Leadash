import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ enrollmentId: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { enrollmentId } = await params;

  const { crm_status } = await req.json();
  const { data, error } = await db
    .from("outreach_enrollments")
    .update({ crm_status })
    .eq("id", enrollmentId)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
