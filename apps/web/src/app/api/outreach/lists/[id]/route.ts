import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  // Verify ownership
  const { data: list } = await db
    .from("outreach_lists")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete leads first, then the list
  await db.from("outreach_leads").delete().eq("list_id", id).eq("workspace_id", workspaceId);
  const { error } = await db.from("outreach_lists").delete().eq("id", id).eq("workspace_id", workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const body = await req.json();
  const { name, description } = body;

  const { data, error } = await db
    .from("outreach_lists")
    .update({ ...(name !== undefined ? { name } : {}), ...(description !== undefined ? { description } : {}) })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
