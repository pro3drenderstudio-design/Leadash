import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data, error } = await db
    .from("outreach_crm_filters")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json();
  const { data, error } = await db
    .from("outreach_crm_filters")
    .insert({
      workspace_id: workspaceId,
      name:         body.name,
      type:         body.type,
      value:        body.value,
      action:       body.action ?? "exclude",
      auto_status:  body.auto_status ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { id } = await req.json();
  await db.from("outreach_crm_filters").delete().eq("id", id).eq("workspace_id", workspaceId);
  return new NextResponse(null, { status: 204 });
}
