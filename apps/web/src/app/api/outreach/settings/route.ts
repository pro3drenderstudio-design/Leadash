import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data } = await db
    .from("workspace_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();

  return NextResponse.json(data ?? {
    footer_enabled: true, footer_custom_text: null, footer_address: null,
    track_opens_default: true, track_clicks_default: true,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json();
  const update = { ...body, workspace_id: workspaceId, updated_at: new Date().toISOString() };

  const { data, error } = await db
    .from("workspace_settings")
    .upsert(update, { onConflict: "workspace_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
