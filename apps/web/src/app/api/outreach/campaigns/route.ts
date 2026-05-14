import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data: campaigns, error } = await db
    .from("outreach_campaigns")
    .select("*, sequence_steps:outreach_sequences(id, step_order, type, wait_days, subject_template, subject_template_b, body_template)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach counts
  const enriched = await Promise.all((campaigns ?? []).map(async (c: { id: string; [key: string]: unknown }) => {
    const [enrolled, sent, opened, replied] = await Promise.all([
      db.from("outreach_enrollments").select("id", { count: "exact", head: true }).eq("campaign_id", c.id),
      db.from("outreach_sends").select("id", { count: "exact", head: true }).eq("campaign_id", c.id),
      db.from("outreach_sends").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).not("opened_at", "is", null),
      db.from("outreach_enrollments").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).or("crm_status.eq.replied,status.eq.replied"),
    ]);
    return {
      ...c,
      total_enrolled: enrolled.count ?? 0,
      total_sent:     sent.count ?? 0,
      total_opened:   opened.count ?? 0,
      total_replied:  replied.count ?? 0,
    };
  }));

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json() as Record<string, unknown>;
  const name = (body.name as string | undefined)?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (name.length > 200) return NextResponse.json({ error: "name must be 200 characters or fewer" }, { status: 400 });

  // Validate time format
  const timeRe = /^\d{2}:\d{2}$/;
  const startTime = (body.send_start_time as string | undefined) ?? "09:00";
  const endTime   = (body.send_end_time   as string | undefined) ?? "17:00";
  if (!timeRe.test(startTime) || !timeRe.test(endTime)) {
    return NextResponse.json({ error: "send_start_time and send_end_time must be in HH:MM format" }, { status: 400 });
  }

  const dailyCap = body.daily_cap !== undefined ? Number(body.daily_cap) : 100;
  if (!Number.isInteger(dailyCap) || dailyCap < 1 || dailyCap > 10000) {
    return NextResponse.json({ error: "daily_cap must be between 1 and 10000" }, { status: 400 });
  }

  // Verify inbox_ids belong to this workspace
  const inboxIds = Array.isArray(body.inbox_ids) ? (body.inbox_ids as string[]) : [];
  if (inboxIds.length > 0) {
    const { count } = await db.from("outreach_inboxes")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("id", inboxIds);
    if ((count ?? 0) !== inboxIds.length) {
      return NextResponse.json({ error: "One or more inbox IDs are invalid" }, { status: 400 });
    }
  }

  // Verify list_ids belong to this workspace
  const listIds = Array.isArray(body.list_ids) ? (body.list_ids as string[]) : [];
  if (listIds.length > 0) {
    const { count } = await db.from("outreach_lists")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("id", listIds);
    if ((count ?? 0) !== listIds.length) {
      return NextResponse.json({ error: "One or more list IDs are invalid" }, { status: 400 });
    }
  }

  // Idempotency: optional client-supplied key prevents duplicates on double-submit
  const idempotencyKey = (body.idempotency_key as string | undefined) ?? null;
  if (idempotencyKey) {
    const { data: existing } = await db.from("outreach_campaigns")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (existing) return NextResponse.json(existing, { status: 200 });
  }

  const { data, error } = await db.from("outreach_campaigns").insert({
    workspace_id:       workspaceId,
    name,
    idempotency_key:    idempotencyKey,
    inbox_ids:          inboxIds,
    list_ids:           listIds,
    timezone:           body.timezone ?? "America/New_York",
    send_days:          body.send_days ?? ["mon","tue","wed","thu","fri"],
    send_start_time:    startTime,
    send_end_time:      endTime,
    daily_cap:          dailyCap,
    track_opens:        body.track_opens ?? true,
    track_clicks:       body.track_clicks ?? true,
    min_delay_seconds:  body.min_delay_seconds ?? 30,
    max_delay_seconds:  body.max_delay_seconds ?? 120,
    stop_on_reply:             body.stop_on_reply ?? true,
    stop_on_auto_reply:        body.stop_on_auto_reply ?? false,
    stop_on_company_reply:     body.stop_on_company_reply ?? false,
    pause_after_open:          body.pause_after_open ?? false,
    reply_to_email:            body.reply_to_email ?? null,
    text_only:                 body.text_only ?? false,
    first_email_text_only:     body.first_email_text_only ?? false,
    insert_unsubscribe_header: body.insert_unsubscribe_header ?? true,
    custom_tags:               body.custom_tags ?? [],
  }).select().single();

  if (error) {
    console.error("[campaigns POST]", error);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
