import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { data } = await db.from("webhook_endpoints").select("*").eq("workspace_id", workspaceId).order("created_at");
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const body = await req.json() as { url: string; events: string[] };
  if (!body.url || !body.events?.length) return NextResponse.json({ error: "url and events required" }, { status: 400 });
  const { data, error } = await db.from("webhook_endpoints").insert({ workspace_id: workspaceId, url: body.url, events: body.events }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
