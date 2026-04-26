/**
 * POST /api/billing/dedicated-ip/cancel
 *
 * Requests cancellation of the workspace's dedicated IP subscription.
 * Status moves to "cancelling"; the IP remains active for 30 days
 * (retire_at) to allow IP reputation to be properly retired before
 * reassignment. Admin finalises cancellation via the admin panel.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data: sub } = await db
    .from("dedicated_ip_subscriptions")
    .select("id, status")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: "No active dedicated IP subscription found." }, { status: 404 });
  }

  const retireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await db.from("dedicated_ip_subscriptions").update({
    status:               "cancelling",
    cancel_requested_at:  new Date().toISOString(),
    retire_at:            retireAt,
    updated_at:           new Date().toISOString(),
  }).eq("id", sub.id);

  return NextResponse.json({ ok: true, retire_at: retireAt });
}
