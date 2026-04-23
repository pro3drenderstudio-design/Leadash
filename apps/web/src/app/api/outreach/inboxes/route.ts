import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { encrypt } from "@/lib/outreach/crypto";
import { checkInboxAccess } from "@/lib/outreach/inbox-access";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data, error } = await db
    .from("outreach_inboxes")
    .select("id, label, email_address, provider, status, daily_send_limit, send_window_start, send_window_end, signature, first_name, last_name, warmup_enabled, warmup_current_daily, warmup_target_daily, warmup_ramp_per_week, warmup_ends_at, last_error, smtp_host, smtp_port, smtp_user, imap_host, imap_port, domain_id, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json();

  const access = await checkInboxAccess(db, workspaceId, body.email_address);
  if (!access.ok) return NextResponse.json({ error: access.message, code: access.code }, { status: 403 });
  const insert: Record<string, unknown> = {
    workspace_id:       workspaceId,
    label:              body.label,
    email_address:      body.email_address,
    provider:           body.provider ?? "smtp",
    daily_send_limit:     body.daily_send_limit ?? 1,
    warmup_current_daily: 1,
    send_window_start:    body.send_window_start ?? "09:00",
    send_window_end:      body.send_window_end ?? "17:00",
    signature:            body.signature ?? null,
    first_name:           body.first_name ?? null,
    last_name:            body.last_name ?? null,
    warmup_enabled:       body.warmup_enabled ?? false,
    warmup_target_daily:  body.warmup_target_daily ?? 40,
    warmup_ramp_per_week: body.warmup_ramp_per_week ?? 5,
    smtp_host:          body.smtp_host ?? null,
    smtp_port:          body.smtp_port ?? 587,
    smtp_user:          body.smtp_user ?? null,
    imap_host:          body.imap_host ?? null,
    imap_port:          body.imap_port ?? 993,
  };

  if (body.smtp_password) {
    insert.smtp_pass_encrypted = encrypt(body.smtp_password);
  }

  const { data, error } = await db.from("outreach_inboxes").insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
