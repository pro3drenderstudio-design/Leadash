import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString();

  const [poolRes, todayRes, weekRes] = await Promise.all([
    db.from("outreach_inboxes")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("warmup_enabled", true)
      .eq("status", "active"),
    db.from("outreach_warmup_sends")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("sent_at", todayStart.toISOString()),
    db.from("outreach_warmup_sends")
      .select("replied_at, rescued_from_spam")
      .eq("workspace_id", workspaceId)
      .gte("sent_at", sevenDaysAgo),
  ]);

  const sends7d       = weekRes.data ?? [];
  const replied7d     = sends7d.filter((s: { replied_at: string | null }) => s.replied_at).length;
  const rescued7d     = sends7d.filter((s: { rescued_from_spam: boolean }) => s.rescued_from_spam).length;

  return NextResponse.json({
    pool_size:            poolRes.count ?? 0,
    sent_today:           todayRes.count ?? 0,
    reply_rate_7d:        sends7d.length > 0 ? replied7d / sends7d.length : 0,
    rescued_from_spam_7d: rescued7d,
  });
}
