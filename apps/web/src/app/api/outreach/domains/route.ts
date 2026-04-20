import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data, error } = await db
    .from("outreach_domains")
    .select("id, domain, status, mailbox_count, mailbox_prefixes, warmup_ends_at, error_message, created_at, redirect_url, reply_forward_to, forward_verified")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // Attach live inbox counts per domain
  const domainIds = rows.map((d: { id: string }) => d.id);
  const inboxCounts: Record<string, number> = {};
  if (domainIds.length) {
    const { data: inboxRows } = await db
      .from("outreach_inboxes")
      .select("domain_id")
      .in("domain_id", domainIds)
      .eq("workspace_id", workspaceId);
    for (const row of inboxRows ?? []) {
      const dr = row as { domain_id: string };
      inboxCounts[dr.domain_id] = (inboxCounts[dr.domain_id] ?? 0) + 1;
    }
  }

  return NextResponse.json(rows.map((d: { id: string; [k: string]: unknown }) => ({
    ...d,
    inbox_count: inboxCounts[d.id] ?? 0,
  })));
}

export async function DELETE(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Verify ownership
  const { data: domain } = await db
    .from("outreach_domains")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domain) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.from("outreach_domains").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
