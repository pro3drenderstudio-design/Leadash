import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { awardChallengePoints } from "@/lib/academy/points";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data, error } = await db
    .from("workspace_icps")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ icps: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json();
  const { name = "My ICP" } = body as { name?: string };

  const { data, error } = await db
    .from("workspace_icps")
    .insert({ workspace_id: workspaceId, name })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await awardChallengePoints(db, { workspaceId, action: "icp_created", ref: `icp:${data.id}` });
  return NextResponse.json({ icp: data }, { status: 201 });
}
