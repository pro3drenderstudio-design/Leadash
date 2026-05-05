/**
 * PATCH /api/admin/dedicated-ip/[id]
 *
 * Admin actions:
 *   provision      — set ip_address → status "active" + immediate blacklist check
 *   set_pending    — revert to pending
 *   cancel         — begin 30-day retirement (status → "cancelling")
 *   finalise_cancel — mark as fully cancelled
 *   blacklist_check — trigger an on-demand DNS blacklist check
 *   (no action)    — free-form field update
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { checkIpBlacklists } from "@/lib/billing/blacklist";
import { createIpPool } from "@/lib/outreach/postal";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminClient = createAdminClient();
  const { data: admin } = await adminClient.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, adminClient };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id }         = await params;
  const { adminClient: db } = ctx;
  const body = await req.json() as {
    action?:           string;
    ip_address?:       string;
    postal_pool_id?:   string;
    postal_server_id?: number;
    notes?:            string;
    max_domains?:      number;
    max_inboxes?:      number;
  };

  const { data: sub } = await db
    .from("dedicated_ip_subscriptions")
    .select("*")
    .eq("id", id)
    .single();

  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { action } = body;

  // ── Create IP pool in Postal ──────────────────────────────────────────────
  if (action === "create_postal_pool") {
    if (!body.ip_address) {
      return NextResponse.json({ error: "ip_address is required" }, { status: 400 });
    }
    const { data: ws } = await db.from("workspaces").select("name").eq("id", sub.workspace_id).single();
    const poolName = ws?.name ?? sub.workspace_id;
    let poolId: number;
    let newServerId: number;
    try {
      ({ poolId, serverId: newServerId } = await createIpPool(poolName, body.ip_address));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Postal agent error: ${msg}` }, { status: 502 });
    }
    await db.from("dedicated_ip_subscriptions").update({
      ip_address:       body.ip_address,
      postal_pool_id:   String(poolId),
      postal_server_id: newServerId,
      updated_at:       new Date().toISOString(),
    }).eq("id", id);
    return NextResponse.json({ ok: true, pool_id: poolId, server_id: newServerId });
  }

  // ── Provision ──────────────────────────────────────────────────────────────
  if (action === "provision") {
    if (!body.ip_address) {
      return NextResponse.json({ error: "ip_address is required to provision" }, { status: 400 });
    }

    // Upsert a postal_nodes row for this dedicated IP and link it to the subscription.
    // Re-use an existing node for this IP if one already exists (idempotent re-provision).
    const { data: ws } = await db.from("workspaces").select("name").eq("id", sub.workspace_id).single();
    let nodeId: string | null = sub.postal_node_id ?? null;
    const { data: existingNode } = await db
      .from("postal_nodes")
      .select("id")
      .eq("ip_address", body.ip_address)
      .maybeSingle();

    if (existingNode) {
      nodeId = existingNode.id;
      await db.from("postal_nodes").update({
        status:           "active",
        workspace_id:     sub.workspace_id,
        inbox_limit:      body.max_inboxes ?? sub.max_inboxes ?? 100,
        provisioned_at:   new Date().toISOString(),
        postal_server_id: body.postal_server_id ?? sub.postal_server_id ?? null,
        postal_pool_id:   body.postal_pool_id   ?? sub.postal_pool_id   ?? null,
      }).eq("id", nodeId);
    } else {
      const { data: newNode } = await db.from("postal_nodes").insert({
        label:            `${ws?.name ?? sub.workspace_id} — Dedicated`,
        ip_address:       body.ip_address,
        status:           "active",
        is_shared:        false,
        workspace_id:     sub.workspace_id,
        inbox_limit:      body.max_inboxes ?? sub.max_inboxes ?? 100,
        postal_server_id: body.postal_server_id ?? sub.postal_server_id ?? null,
        postal_pool_id:   body.postal_pool_id   ?? sub.postal_pool_id   ?? null,
        provisioned_at:   new Date().toISOString(),
      }).select("id").single();
      nodeId = newNode?.id ?? null;
    }

    await db.from("dedicated_ip_subscriptions").update({
      status:           "active",
      ip_address:       body.ip_address,
      postal_pool_id:   body.postal_pool_id   ?? sub.postal_pool_id,
      postal_server_id: body.postal_server_id ?? sub.postal_server_id,
      max_domains:      body.max_domains      ?? sub.max_domains,
      max_inboxes:      body.max_inboxes      ?? sub.max_inboxes,
      postal_node_id:   nodeId,
      updated_at:       new Date().toISOString(),
    }).eq("id", id);

    // Run immediate blacklist check on provisioned IP
    try {
      const result = await checkIpBlacklists(body.ip_address);
      await db.from("dedicated_ip_blacklist_checks").insert({
        subscription_id:    id,
        blacklists_checked: result.blacklistsChecked,
        blacklists_hit:     result.blacklistsHit,
        is_clean:           result.isClean,
        raw_results:        result.rawResults,
      });
    } catch (err) {
      console.error("[dedicated-ip provision] blacklist check failed:", err);
    }

    return NextResponse.json({ ok: true, newStatus: "active", nodeId });
  }

  // ── Set pending ────────────────────────────────────────────────────────────
  if (action === "set_pending") {
    await db.from("dedicated_ip_subscriptions").update({
      status:     "pending",
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    return NextResponse.json({ ok: true, newStatus: "pending" });
  }

  // ── Cancel (begin 30-day retirement) ──────────────────────────────────────
  if (action === "cancel") {
    const retireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.from("dedicated_ip_subscriptions").update({
      status:               "cancelling",
      cancel_requested_at:  new Date().toISOString(),
      retire_at:            retireAt,
      updated_at:           new Date().toISOString(),
    }).eq("id", id);

    // Unlink all domains from this subscription
    await db.from("outreach_domains")
      .update({ dedicated_ip_subscription_id: null })
      .eq("dedicated_ip_subscription_id", id);

    return NextResponse.json({ ok: true, newStatus: "cancelling", retire_at: retireAt });
  }

  // ── Finalise cancel (IP fully retired) ────────────────────────────────────
  if (action === "finalise_cancel") {
    await db.from("dedicated_ip_subscriptions").update({
      status:     "cancelled",
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    return NextResponse.json({ ok: true, newStatus: "cancelled" });
  }

  // ── On-demand blacklist check ──────────────────────────────────────────────
  if (action === "blacklist_check") {
    if (!sub.ip_address) {
      return NextResponse.json({ error: "No IP address configured" }, { status: 400 });
    }
    const result = await checkIpBlacklists(sub.ip_address);
    await db.from("dedicated_ip_blacklist_checks").insert({
      subscription_id:    id,
      blacklists_checked: result.blacklistsChecked,
      blacklists_hit:     result.blacklistsHit,
      is_clean:           result.isClean,
      raw_results:        result.rawResults,
    });
    return NextResponse.json({ ok: true, result });
  }

  // ── Generic field update ───────────────────────────────────────────────────
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.ip_address       !== undefined) updates.ip_address       = body.ip_address;
  if (body.postal_pool_id   !== undefined) updates.postal_pool_id   = body.postal_pool_id;
  if (body.postal_server_id !== undefined) updates.postal_server_id = body.postal_server_id;
  if (body.notes            !== undefined) updates.notes            = body.notes;
  if (body.max_domains      !== undefined) updates.max_domains      = body.max_domains;
  if (body.max_inboxes      !== undefined) updates.max_inboxes      = body.max_inboxes;

  await db.from("dedicated_ip_subscriptions").update(updates).eq("id", id);
  return NextResponse.json({ ok: true });
}
