import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { encrypt } from "@/lib/outreach/crypto";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const body = await req.json();
  const update: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };
  delete update.workspace_id;
  delete update.id;
  if (body.smtp_password) {
    update.smtp_pass_encrypted = encrypt(body.smtp_password);
    delete update.smtp_password;
  }

  // When warmup_target_daily is being raised, reset warmup_ends_at to now + 21 days
  // so the dynamic ramp has a full window to reach the new target.
  if (body.warmup_target_daily != null) {
    const { data: current } = await db
      .from("outreach_inboxes")
      .select("warmup_current_daily, warmup_target_daily")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();
    if (current && body.warmup_target_daily > (current.warmup_current_daily ?? 0)) {
      update.warmup_ends_at = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
    }
  }

  const { data, error } = await db
    .from("outreach_inboxes")
    .update(update)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { error } = await db
    .from("outreach_inboxes")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
