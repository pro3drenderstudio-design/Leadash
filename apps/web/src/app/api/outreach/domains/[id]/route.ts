import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { setWebRedirect, setEmailForwarding } from "@/lib/outreach/cloudflare";

// GET /api/outreach/domains/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { data, error } = await db
    .from("outreach_domains")
    .select("id, domain, status, mailbox_count, mailbox_prefixes, redirect_url, reply_forward_to, forward_verified, warmup_ends_at, error_message, created_at, dns_records")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

// PATCH /api/outreach/domains/[id]
// Body: { redirect_url?: string | null, reply_forward_to?: string | null }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const body = await req.json() as {
    redirect_url?: string | null;
    reply_forward_to?: string | null;
  };

  const { data: domainRecord } = await db
    .from("outreach_domains")
    .select("domain, status, redirect_url, reply_forward_to")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domainRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (domainRecord.status !== "active") {
    return NextResponse.json({ error: "Domain must be active to update settings" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Handle redirect URL change
  if ("redirect_url" in body) {
    updates.redirect_url = body.redirect_url ?? null;
    if (body.redirect_url) {
      try {
        await setWebRedirect(domainRecord.domain, body.redirect_url);
      } catch (err) {
        return NextResponse.json(
          { error: `Failed to set web redirect: ${err instanceof Error ? err.message : String(err)}` },
          { status: 500 },
        );
      }
    }
  }

  // Handle email forwarding change
  if ("reply_forward_to" in body) {
    updates.reply_forward_to = body.reply_forward_to ?? null;
    updates.forward_verified = false;
    if (body.reply_forward_to) {
      try {
        await setEmailForwarding(domainRecord.domain, body.reply_forward_to);
      } catch (err) {
        return NextResponse.json(
          { error: `Failed to set email forwarding: ${err instanceof Error ? err.message : String(err)}` },
          { status: 500 },
        );
      }
    }
  }

  const { error } = await db
    .from("outreach_domains")
    .update(updates)
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
