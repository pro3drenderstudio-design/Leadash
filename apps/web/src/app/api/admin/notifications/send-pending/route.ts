import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendAlertNotification } from "@/lib/email/alerts";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

// POST /api/admin/notifications/send-pending
// Called by the worker every 5 minutes with Authorization: Bearer <CRON_SECRET>
// Finds unsent critical/warning notifications and emails configured recipients.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();

  // Load notification settings
  const { data: settings } = await db
    .from("notification_settings")
    .select("email_recipients, email_on_warning, email_on_critical, quiet_hours_start, quiet_hours_end")
    .limit(1)
    .maybeSingle();

  if (!settings) return NextResponse.json({ sent: 0 });

  const recipients: string[] = settings.email_recipients ?? [];
  if (recipients.length === 0) return NextResponse.json({ sent: 0 });

  // Check quiet hours
  if (settings.quiet_hours_start && settings.quiet_hours_end) {
    const now      = new Date();
    const hhmm     = now.toISOString().slice(11, 16); // "HH:MM"
    const start    = settings.quiet_hours_start as string;
    const end      = settings.quiet_hours_end as string;
    const inQuiet  = start < end
      ? hhmm >= start && hhmm < end
      : hhmm >= start || hhmm < end; // overnight window
    if (inQuiet) return NextResponse.json({ sent: 0, skipped: "quiet_hours" });
  }

  // Find unsent active notifications that meet the severity threshold
  const severityFilter: string[] = [];
  if (settings.email_on_critical) severityFilter.push("critical");
  if (settings.email_on_warning)  severityFilter.push("warning");
  if (severityFilter.length === 0) return NextResponse.json({ sent: 0 });

  const { data: pending } = await db
    .from("notifications")
    .select("id, type, severity, title, body")
    .is("resolved_at", null)
    .is("email_sent_at", null)
    .in("severity", severityFilter)
    .order("created_at", { ascending: true })
    .limit(20);

  if (!pending?.length) return NextResponse.json({ sent: 0 });

  type NotificationRow = { id: string; type: string; severity: string; title: string; body: string | null };
  let sent = 0;
  const sentIds: string[] = [];

  for (const n of pending as NotificationRow[]) {
    const errors: string[] = [];
    for (const to of recipients) {
      try {
        await sendAlertNotification({
          to,
          severity:       n.severity as "info" | "warning" | "critical",
          title:          n.title,
          body:           n.body ?? undefined,
          type:           n.type,
          notificationId: n.id,
        });
        sent++;
      } catch (e) {
        errors.push(String(e));
      }
    }
    if (errors.length === 0) {
      sentIds.push(n.id);
    }
  }

  if (sentIds.length > 0) {
    await db.from("notifications")
      .update({ email_sent_at: new Date().toISOString() })
      .in("id", sentIds);
  }

  return NextResponse.json({ sent });
}
