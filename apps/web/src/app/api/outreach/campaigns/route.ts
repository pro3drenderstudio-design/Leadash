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
  const enriched = await Promise.all((campaigns ?? []).map(async (c) => {
    const [enrolled, sent, opened, replied] = await Promise.all([
      db.from("outreach_enrollments").select("id", { count: "exact", head: true }).eq("campaign_id", c.id),
      db.from("outreach_sends").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("status", ["sent","opened"]).eq("enrollment_id", c.id),
      db.from("outreach_sends").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "opened"),
      db.from("outreach_enrollments").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "replied"),
    ]);
    return {
      ...c,
      total_enrolled: enrolled.count ?? 0,
      total_replied:  replied.count ?? 0,
    };
  }));

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json();
  const { data, error } = await db.from("outreach_campaigns").insert({
    workspace_id:       workspaceId,
    name:               body.name,
    inbox_ids:          body.inbox_ids ?? [],
    list_ids:           body.list_ids ?? [],
    timezone:           body.timezone ?? "America/New_York",
    send_days:          body.send_days ?? ["mon","tue","wed","thu","fri"],
    send_start_time:    body.send_start_time ?? "09:00",
    send_end_time:      body.send_end_time ?? "17:00",
    daily_cap:          body.daily_cap ?? 100,
    track_opens:        body.track_opens ?? true,
    track_clicks:       body.track_clicks ?? true,
    min_delay_seconds:  body.min_delay_seconds ?? 30,
    max_delay_seconds:  body.max_delay_seconds ?? 120,
    stop_on_reply:      body.stop_on_reply ?? true,
    pause_after_open:   body.pause_after_open ?? false,
    reply_to_email:     body.reply_to_email ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
