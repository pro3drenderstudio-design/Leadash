/**
 * POST /api/outreach/inboxes/bulk
 *
 * Bulk-imports inboxes from a CSV (already parsed to rows by the client).
 * Respects plan inbox limits — stops importing once the workspace limit is hit.
 * Returns an ImportResult-compatible response.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { checkInboxAccess } from "@/lib/outreach/inbox-access";
import { encrypt } from "@/lib/outreach/crypto";

interface InboxRow {
  email?: string;
  email_address?: string;
  smtp_host?: string;
  smtp_user?: string;
  smtp_pass?: string;
  smtp_password?: string;
  smtp_port?: string;
  imap_host?: string;
  imap_port?: string;
  label?: string;
  first_name?: string;
  last_name?: string;
  daily_limit?: string;
  timezone?: string;
  send_window_start?: string;
  send_window_end?: string;
  warmup_target?: string;
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json() as { rows?: InboxRow[] };
  const rows = body.rows ?? [];

  if (!rows.length) {
    return NextResponse.json({ imported: 0, skipped_duplicate: 0, skipped_unsubscribed: 0, errors: [] });
  }

  // ── Check overall access first (trial / plan status) ──────────────────────
  const accessCheck = await checkInboxAccess(db, workspaceId);
  if (!accessCheck.ok) {
    return NextResponse.json(
      { error: accessCheck.message, code: accessCheck.code },
      { status: 403 },
    );
  }

  // ── Get current inbox count + limit once ──────────────────────────────────
  const { data: ws } = await db
    .from("workspaces")
    .select("max_inboxes")
    .eq("id", workspaceId)
    .single();

  const maxInboxes = ws?.max_inboxes ?? 5;

  const { count: currentCount } = await db
    .from("outreach_inboxes")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  let inboxCount = currentCount ?? 0;

  // ── Process rows ──────────────────────────────────────────────────────────
  let imported = 0;
  let skipped_duplicate = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const email = (row.email ?? row.email_address ?? "").trim().toLowerCase();
    if (!email) { errors.push(`Row skipped: no email address`); continue; }

    // Check inbox limit
    if (maxInboxes !== -1 && inboxCount >= maxInboxes) {
      errors.push(`Inbox limit reached (${maxInboxes}). Remaining rows skipped.`);
      break;
    }

    // Check cross-workspace uniqueness
    const { data: existing } = await db
      .from("outreach_inboxes")
      .select("workspace_id")
      .eq("email_address", email)
      .maybeSingle();

    if (existing) {
      if (existing.workspace_id === workspaceId) {
        skipped_duplicate++;
      } else {
        errors.push(`${email}: already connected to another account`);
      }
      continue;
    }

    const smtpPass = row.smtp_pass ?? row.smtp_password ?? "";
    const port = parseInt(row.smtp_port ?? "587", 10);

    const insert: Record<string, unknown> = {
      workspace_id:       workspaceId,
      email_address:      email,
      label:              row.label ?? email,
      provider:           "smtp",
      smtp_host:          row.smtp_host ?? null,
      smtp_port:          isNaN(port) ? 587 : port,
      smtp_user:          row.smtp_user ?? null,
      imap_host:          row.imap_host ?? null,
      imap_port:          row.imap_port ? parseInt(row.imap_port, 10) : null,
      first_name:         row.first_name ?? null,
      last_name:          row.last_name ?? null,
      daily_send_limit:   row.daily_limit ? parseInt(row.daily_limit, 10) : 30,
      send_window_start:  row.send_window_start ?? "09:00",
      send_window_end:    row.send_window_end ?? "17:00",
      warmup_enabled:     false,
      warmup_target_daily: row.warmup_target ? parseInt(row.warmup_target, 10) : 40,
      warmup_ramp_per_week: 5,
      status:             "active",
    };

    if (smtpPass) {
      insert.smtp_pass_encrypted = encrypt(smtpPass);
    }

    const { error } = await db.from("outreach_inboxes").insert(insert);
    if (error) {
      errors.push(`${email}: ${error.message}`);
    } else {
      imported++;
      inboxCount++;
    }
  }

  return NextResponse.json({
    imported,
    skipped_duplicate,
    skipped_unsubscribed: 0,
    failed_verification: 0,
    errors,
  });
}
