import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;
  const body = await req.json() as { enabled?: boolean };
  const { data, error } = await db.from("webhook_endpoints").update({ enabled: body.enabled }).eq("id", id).eq("workspace_id", workspaceId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;
  await db.from("webhook_endpoints").delete().eq("id", id).eq("workspace_id", workspaceId);
  return NextResponse.json({ ok: true });
}
