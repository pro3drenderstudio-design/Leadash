import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { enqueueSend } from "@/lib/queue/client";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { data, error } = await db
    .from("outreach_campaigns")
    .select("*, sequence_steps:outreach_sequences(id, step_order, type, wait_days, subject_template, subject_template_b, body_template, created_at)")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const body = await req.json();
  const update: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };
  delete update.workspace_id; delete update.id;

  const { data: before } = await db
    .from("outreach_campaigns")
    .select("status")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  const { data, error } = await db
    .from("outreach_campaigns")
    .update(update)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Kick off sends when campaign becomes active
  if (update.status === "active" && before?.status !== "active") {
    await enqueueSend(workspaceId, 200).catch(() => {});
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { error } = await db.from("outreach_campaigns").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
