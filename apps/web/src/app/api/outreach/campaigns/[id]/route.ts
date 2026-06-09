import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { enqueueSend } from "@/lib/queue/client";
import { getPoolQuotaStatus } from "@/lib/billing/pool-quota";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { data, error } = await db
    .from("outreach_campaigns")
    .select("*, sequence_steps:outreach_sequences(id, step_order, type, wait_days, subject_template, subject_template_b, body_template, created_at)")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [enrolled, sent, opened, replied] = await Promise.all([
    db.from("outreach_enrollments").select("id", { count: "exact", head: true }).eq("campaign_id", id),
    db.from("outreach_sends").select("id", { count: "exact", head: true }).eq("campaign_id", id),
    db.from("outreach_sends").select("id", { count: "exact", head: true }).eq("campaign_id", id).not("opened_at", "is", null),
    db.from("outreach_enrollments").select("id", { count: "exact", head: true }).eq("campaign_id", id).or("crm_status.eq.replied,status.eq.replied"),
  ]);

  return NextResponse.json({
    ...data,
    total_enrolled: enrolled.count ?? 0,
    total_sent:     sent.count     ?? 0,
    total_opened:   opened.count   ?? 0,
    total_replied:  replied.count  ?? 0,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const body = await req.json();
  const update: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };
  delete update.workspace_id; delete update.id;

  const { data: before } = await db
    .from("outreach_campaigns")
    .select("status, inbox_ids")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  // Clear pause reason when reactivating
  if (update.status === "active" && before?.status !== "active") {
    update.pause_reason = null;
  }

  // Validate campaign state before activation
  if (update.status === "active" && before?.status !== "active") {
    const inboxIds = (before?.inbox_ids ?? []) as string[];
    if (!inboxIds.length) {
      return NextResponse.json(
        { error: "Cannot activate campaign: no inboxes assigned. Add at least one inbox first." },
        { status: 400 },
      );
    }
    const { data: inboxDetails } = await db
      .from("outreach_inboxes")
      .select("id, email_address, status, last_error")
      .in("id", inboxIds);

    type InboxDetail = { id: string; email_address: string; status: string; last_error: string | null };
    const details      = (inboxDetails ?? []) as InboxDetail[];
    const activeCount  = details.filter(i => i.status === "active").length;
    const errorInboxes = details.filter(i => i.status === "error");
    const pausedInboxes = details.filter(i => i.status === "paused");

    if (!activeCount) {
      let errorMsg: string;
      if (errorInboxes.length > 0) {
        const names = errorInboxes.map(i => i.email_address).join(", ");
        const firstReason = errorInboxes[0].last_error;
        errorMsg = errorInboxes.length === 1
          ? `Cannot activate: inbox "${names}" is in error state${firstReason ? ` — ${firstReason}` : ""}. Fix the inbox issue first.`
          : `Cannot activate: ${errorInboxes.length} inboxes are in error state (${names}). Fix the inbox issues first.`;
      } else if (pausedInboxes.length > 0) {
        errorMsg = "Cannot activate campaign: all assigned inboxes are paused. Enable at least one inbox first.";
      } else {
        errorMsg = "Cannot activate campaign: no inboxes assigned or all inboxes have been removed. Add an active inbox first.";
      }
      return NextResponse.json(
        { error: errorMsg, inbox_errors: errorInboxes.map(i => ({ email_address: i.email_address, last_error: i.last_error })) },
        { status: 400 },
      );
    }

    const quota = await getPoolQuotaStatus(db, workspaceId);
    if (quota.isOver) {
      return NextResponse.json(
        {
          error: `Cannot activate campaign: outreach leads pool over limit ` +
            `(${quota.used.toLocaleString()} / ${quota.max.toLocaleString()} leads). ` +
            `Delete leads to get under the limit, then re-activate.`,
        },
        { status: 403 },
      );
    }
  }

  const { data, error } = await db
    .from("outreach_campaigns")
    .update(update)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Kick off sends when campaign becomes active
  if (update.status === "active" && before?.status !== "active") {
    await enqueueSend(workspaceId, 200).catch(() => {});
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { error } = await db.from("outreach_campaigns").delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
