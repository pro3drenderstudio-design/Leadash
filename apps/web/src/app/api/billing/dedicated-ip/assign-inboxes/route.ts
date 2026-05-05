/**
 * POST /api/billing/dedicated-ip/assign-inboxes
 *
 * Move a list of inbox IDs from the shared pool to the workspace's dedicated node.
 * Enforces the 100-inbox cap per dedicated IP.
 *
 * Body: { inbox_ids: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { inbox_ids } = await req.json() as { inbox_ids?: string[] };
  if (!Array.isArray(inbox_ids) || inbox_ids.length === 0) {
    return NextResponse.json({ error: "inbox_ids must be a non-empty array" }, { status: 400 });
  }

  // Load active subscription with a provisioned node
  const { data: sub } = await db
    .from("dedicated_ip_subscriptions")
    .select("id, status, postal_node_id, max_inboxes")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .not("postal_node_id", "is", null)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json(
      { error: "No active dedicated IP with a provisioned node found." },
      { status: 404 },
    );
  }

  const nodeId = sub.postal_node_id as string;
  const cap    = sub.max_inboxes ?? 100;

  // Count inboxes already on this node
  const { count: existing } = await db
    .from("outreach_inboxes")
    .select("id", { count: "exact", head: true })
    .eq("postal_node_id", nodeId)
    .eq("status", "active");

  const currentCount = existing ?? 0;
  if (currentCount + inbox_ids.length > cap) {
    return NextResponse.json(
      {
        error: `Moving ${inbox_ids.length} inbox(es) would exceed the ${cap}-inbox limit for your dedicated IP. Currently using ${currentCount}.`,
      },
      { status: 422 },
    );
  }

  // Verify all inbox_ids belong to this workspace and are active
  const { data: inboxes } = await db
    .from("outreach_inboxes")
    .select("id")
    .in("id", inbox_ids)
    .eq("workspace_id", workspaceId)
    .eq("status", "active");

  if (!inboxes || inboxes.length !== inbox_ids.length) {
    return NextResponse.json(
      { error: "One or more inboxes not found or not active in your workspace." },
      { status: 400 },
    );
  }

  // Move inboxes to the dedicated node
  const { error } = await db
    .from("outreach_inboxes")
    .update({ postal_node_id: nodeId })
    .in("id", inbox_ids)
    .eq("workspace_id", workspaceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, moved: inbox_ids.length, node_id: nodeId });
}
