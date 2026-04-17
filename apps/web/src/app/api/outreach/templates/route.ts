import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data, error } = await db
    .from("outreach_templates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { name, subject, body } = await req.json() as { name?: string; subject?: string; body?: string };
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (name.length > 200)    return NextResponse.json({ error: "name must be 200 characters or fewer" }, { status: 400 });
  if (subject && subject.length > 500)    return NextResponse.json({ error: "subject must be 500 characters or fewer" }, { status: 400 });
  if (body    && body.length    > 50_000) return NextResponse.json({ error: "body must be 50,000 characters or fewer" }, { status: 400 });

  const { data, error } = await db
    .from("outreach_templates")
    .insert({ workspace_id: workspaceId, name: name.trim(), subject: subject?.trim() ?? "", body: body ?? "" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
