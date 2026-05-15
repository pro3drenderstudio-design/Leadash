import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

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
  { params }: { params: Promise<{ domainId: string }> }
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { domainId } = await params;
  const body = await req.json();
  const { action } = body;

  if (!["retry_dns", "force_active", "reset", "set_failed", "mark_purchased", "purchase_via_dev"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // purchase_via_dev: call purchaseDomain from this machine (residential IP) then re-enqueue
  if (action === "purchase_via_dev") {
    const { data: domainRow } = await ctx.adminClient
      .from("outreach_domains")
      .select("workspace_id, domain, status, domain_price_usd")
      .eq("id", domainId)
      .single();

    if (!domainRow) return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    if (domainRow.status !== "awaiting_manual_purchase" && domainRow.status !== "purchasing") {
      return NextResponse.json({ error: "Domain is not awaiting manual purchase" }, { status: 400 });
    }

    const { purchaseDomain } = await import("@/lib/outreach/porkbun");
    try {
      await purchaseDomain(
        domainRow.domain as string,
        undefined,
        (domainRow.domain_price_usd as number) ?? undefined,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Purchase failed: ${msg}` }, { status: 422 });
    }

    await ctx.adminClient
      .from("outreach_domains")
      .update({ status: "purchasing", error_message: null, updated_at: now })
      .eq("id", domainId);

    const { enqueueProvision } = await import("@/lib/queue");
    await enqueueProvision(domainId, domainRow.workspace_id as string);

    return NextResponse.json({ ok: true, action, newStatus: "purchasing" });
  }

  // mark_purchased: admin manually bought the domain on Porkbun — re-enqueue provisioning
  if (action === "mark_purchased") {
    const { data: domain } = await ctx.adminClient
      .from("outreach_domains")
      .select("workspace_id, status")
      .eq("id", domainId)
      .single();

    if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    if (domain.status !== "awaiting_manual_purchase" && domain.status !== "purchasing") {
      return NextResponse.json({ error: "Domain is not awaiting manual purchase" }, { status: 400 });
    }

    await ctx.adminClient
      .from("outreach_domains")
      .update({ status: "purchasing", error_message: null, updated_at: now })
      .eq("id", domainId);

    const { enqueueProvision } = await import("@/lib/queue");
    await enqueueProvision(domainId, domain.workspace_id as string);

    return NextResponse.json({ ok: true, action, newStatus: "purchasing" });
  }

  const statusMap: Record<string, string> = {
    retry_dns:    "dns_pending",
    force_active: "active",
    reset:        "dns_pending",
    set_failed:   "failed",
  };

  const updates: Record<string, unknown> = {
    status:     statusMap[action],
    updated_at: now,
  };

  if (action === "retry_dns" || action === "force_active") {
    updates.error_message = null;
  }

  const { error } = await ctx.adminClient
    .from("outreach_domains")
    .update(updates)
    .eq("id", domainId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, action, newStatus: statusMap[action] });
}
