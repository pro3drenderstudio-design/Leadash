import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString();

  const [inboxes, stats] = await Promise.all([
    db.from("outreach_inboxes")
      .select("id, label, email_address, warmup_enabled, warmup_current_daily, warmup_target_daily, warmup_ramp_per_week, status")
      .eq("workspace_id", workspaceId)
      .eq("warmup_enabled", true),
    db.from("outreach_warmup_sends")
      .select("id, replied_at, rescued_from_spam, sent_at")
      .eq("workspace_id", workspaceId)
      .gte("sent_at", sevenDaysAgo),
  ]);

  const sends7d        = stats.data ?? [];
  const replied7d      = sends7d.filter((s: { replied_at?: string | null; rescued_from_spam?: boolean }) => s.replied_at).length;
  const rescuedFromSpam = sends7d.filter((s: { replied_at?: string | null; rescued_from_spam?: boolean }) => s.rescued_from_spam).length;

  return NextResponse.json({
    inboxes: inboxes.data ?? [],
    stats: {
      pool_size:            inboxes.data?.length ?? 0,
      sent_7d:              sends7d.length,
      reply_rate_7d:        sends7d.length > 0 ? Math.round((replied7d / sends7d.length) * 100) : 0,
      rescued_from_spam_7d: rescuedFromSpam,
    },
  });
}
