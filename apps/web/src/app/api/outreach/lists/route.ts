import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data, error } = await db
    .from("outreach_lists")
    .select("id, name, description, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach lead counts
  const enriched = await Promise.all((data ?? []).map(async list => {
    const { count } = await db
      .from("outreach_leads")
      .select("id", { count: "exact", head: true })
      .eq("list_id", list.id)
      .eq("workspace_id", workspaceId)
      .eq("status", "active");
    return { ...list, lead_count: count ?? 0 };
  }));

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { name, description } = await req.json();
  const { data, error } = await db
    .from("outreach_lists")
    .insert({ workspace_id: workspaceId, name, description: description ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
