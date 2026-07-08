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

// GET /api/admin/workspaces/[workspaceId]/outreach
export async function GET(_: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { workspaceId } = await params;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: inboxes },
    { data: campaigns },
    { data: enrollments },
    { data: warmupSends },
  ] = await Promise.all([
    ctx.adminClient
      .from("outreach_inboxes")
      .select("id, email_address, label, provider, status, last_error, warmup_enabled, warmup_current_daily, warmup_target_daily, warmup_ends_at, daily_send_limit, smtp_host, smtp_user, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),

    ctx.adminClient
      .from("outreach_campaigns")
      .select("id, name, status, daily_cap, created_at, deleted_at")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),

    ctx.adminClient
      .from("outreach_enrollments")
      .select("campaign_id, status")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .limit(2000),

    ctx.adminClient
      .from("outreach_warmup_sends")
      .select("from_inbox_id, sent_at, replied_at, rescued_from_spam")
      .eq("workspace_id", workspaceId)
      .gte("sent_at", sevenDaysAgo),
  ]);

  type EnrollRow  = { campaign_id: string; status: string };
  type WarmupRow  = { replied_at: string | null; rescued_from_spam: boolean | null };
  type CampaignRow = { id: string; [key: string]: unknown };

  const typedEnrollments = (enrollments  ?? []) as EnrollRow[];
  const typedWarmup      = (warmupSends  ?? []) as WarmupRow[];
  const typedCampaigns   = (campaigns    ?? []) as CampaignRow[];

  // Enrollment counts per campaign
  const enrollmentCounts: Record<string, { total: number; active: number; completed: number; failed: number }> = {};
  for (const e of typedEnrollments) {
    const cid = e.campaign_id;
    if (!enrollmentCounts[cid]) enrollmentCounts[cid] = { total: 0, active: 0, completed: 0, failed: 0 };
    enrollmentCounts[cid].total++;
    if (e.status === "active" || e.status === "pending") enrollmentCounts[cid].active++;
    else if (e.status === "completed")                   enrollmentCounts[cid].completed++;
    else if (e.status === "failed")                      enrollmentCounts[cid].failed++;
  }

  const campaignsWithCounts = typedCampaigns.map(c => ({
    ...c,
    ...(enrollmentCounts[c.id as string] ?? { total: 0, active: 0, completed: 0, failed: 0 }),
  }));

  // Warmup summary
  const warmupSends7d   = typedWarmup.length;
  const warmupReplies7d = typedWarmup.filter(s => s.replied_at).length;
  const warmupRescued7d = typedWarmup.filter(s => s.rescued_from_spam).length;

  // Enrollment global summary
  const enrollmentSummary = {
    total:     typedEnrollments.length,
    active:    typedEnrollments.filter(e => e.status === "active" || e.status === "pending").length,
    completed: typedEnrollments.filter(e => e.status === "completed").length,
    failed:    typedEnrollments.filter(e => e.status === "failed").length,
  };

  return NextResponse.json({
    inboxes:  inboxes  ?? [],
    campaigns: campaignsWithCounts,
    warmup_summary: { total: warmupSends7d, sends_7d: warmupSends7d, replies_7d: warmupReplies7d, rescued_7d: warmupRescued7d },
    enrollment_summary: enrollmentSummary,
  });
}
