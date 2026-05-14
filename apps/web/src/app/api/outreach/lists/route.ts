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

  // Attach lead counts + verification stats per list in a single query
  const listIds = (data ?? []).map((l: { id: string }) => l.id);
  const statsMap: Record<string, { lead_count: number; verified_count: number; pending_count: number; invalid_count: number }> = {};

  if (listIds.length > 0) {
    const { data: statRows } = await db
      .from("outreach_leads")
      .select("list_id, verification_status")
      .eq("workspace_id", workspaceId)
      .in("list_id", listIds)
      .eq("status", "active");

    const VERIFIED = new Set(["safe", "valid", "catch_all", "verified_external"]);
    const INVALID  = new Set(["invalid", "disposable"]);

    for (const row of statRows ?? []) {
      const s = statsMap[row.list_id] ?? { lead_count: 0, verified_count: 0, pending_count: 0, invalid_count: 0 };
      s.lead_count++;
      if (VERIFIED.has(row.verification_status)) s.verified_count++;
      else if (INVALID.has(row.verification_status)) s.invalid_count++;
      else s.pending_count++;
      statsMap[row.list_id] = s;
    }
  }

  const enriched = (data ?? []).map((list: { id: string; [key: string]: unknown }) => ({
    ...list,
    ...(statsMap[list.id] ?? { lead_count: 0, verified_count: 0, pending_count: 0, invalid_count: 0 }),
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
