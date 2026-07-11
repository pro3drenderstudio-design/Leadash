import { createClient } from "@supabase/supabase-js";
import type { OutreachEnrollment, OutreachCampaign, OutreachSequenceStep } from "@/types/outreach";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  return createClient(url!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export interface DueEnrollment {
  enrollment: OutreachEnrollment;
  campaign: OutreachCampaign;
  step: OutreachSequenceStep;
}

export async function getDueEnrollments(workspaceId: string, limit = 500): Promise<DueEnrollment[]> {
  const supabase = adminClient();
  const now = new Date().toISOString();

  const { data: enrollments, error } = await supabase
    .from("outreach_enrollments")
    .select("*, campaign:outreach_campaigns(*), lead:outreach_leads(*)")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .or(`next_send_at.is.null,next_send_at.lte.${now}`)
    .limit(limit);

  if (error || !enrollments) { console.log(`[scheduler] getDueEnrollments error:`, error?.message); return []; }

  console.log(`[scheduler] getDueEnrollments raw=${enrollments.length} ws=${workspaceId}`);
  const results: DueEnrollment[] = [];
  for (const enrollment of enrollments) {
    const campaign = enrollment.campaign as OutreachCampaign;
    if (!campaign || campaign.status !== "active") {
      console.log(`[scheduler] skip enrollment=${enrollment.id} campaign_status=${campaign?.status}`);
      continue;
    }

    // Enforce send window unless the enrollment is overdue by more than 2 hours
    // (handles missed cron runs without permanently skipping scheduled sends)
    const overdueMs = enrollment.next_send_at
      ? Date.now() - new Date(enrollment.next_send_at).getTime()
      : Infinity;
    if (overdueMs < 2 * 60 * 60 * 1000 && !isWithinSendWindow(campaign)) {
      console.log(`[scheduler] skip enrollment=${enrollment.id} outside send window overdueMs=${overdueMs}`);
      continue;
    }

    const { data: step } = await supabase
      .from("outreach_sequences")
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("step_order", enrollment.current_step)
      .single();

    if (!step) {
      console.log(`[scheduler] skip enrollment=${enrollment.id} no step at step_order=${enrollment.current_step}`);
      continue;
    }
    results.push({ enrollment, campaign, step });
  }
  return results;
}

function isWithinSendWindow(campaign: OutreachCampaign): boolean {
  const now = new Date();
  const tz  = campaign.timezone ?? "America/New_York";

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });

  const parts   = formatter.formatToParts(now);
  const weekday = parts.find(p => p.type === "weekday")?.value?.toLowerCase().slice(0, 3) ?? "";
  const hour    = parseInt(parts.find(p => p.type === "hour")?.value ?? "0");
  const minute  = parseInt(parts.find(p => p.type === "minute")?.value ?? "0");
  const current = hour * 60 + minute;

  if (!(campaign.send_days ?? ["mon","tue","wed","thu","fri"]).includes(weekday)) return false;

  const [sh, sm] = (campaign.send_start_time ?? "09:00").split(":").map(Number);
  const [eh, em] = (campaign.send_end_time   ?? "17:00").split(":").map(Number);
  const start = sh * 60 + sm;
  const end   = eh * 60 + em;
  // Handle midnight-wrap windows (e.g. 23:00–00:00 means 23:00–00:00 next day)
  if (end <= start) return current >= start || current < end;
  return current >= start && current < end;
}

export function computeNextSendAt(waitDays: number, campaign: OutreachCampaign): Date {
  const tz       = campaign.timezone ?? "America/New_York";
  const sendDays = campaign.send_days ?? ["mon","tue","wed","thu","fri"];
  const [sh, sm] = (campaign.send_start_time ?? "09:00").split(":").map(Number);

  const base = new Date();
  base.setDate(base.getDate() + waitDays);

  for (let i = 0; i < 14; i++) {
    const probe = new Date(base);
    probe.setDate(base.getDate() + i);

    const tzParts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "short", year: "numeric", month: "numeric", day: "numeric",
    }).formatToParts(probe);

    const weekday = (tzParts.find(p => p.type === "weekday")?.value ?? "").toLowerCase().slice(0, 3);
    if (!sendDays.includes(weekday)) continue;

    const year  = parseInt(tzParts.find(p => p.type === "year")!.value);
    const month = parseInt(tzParts.find(p => p.type === "month")!.value) - 1;
    const day   = parseInt(tzParts.find(p => p.type === "day")!.value);

    const targetH = sh;
    const targetM = sm + Math.floor(Math.random() * 60);

    // Build a UTC timestamp that equals targetH:targetM in the campaign timezone.
    // Start with a naïve UTC value for that date+time, then correct by the tz offset.
    const naive = new Date(Date.UTC(year, month, day, targetH, targetM, 0));
    const inTz  = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(naive);
    const localH = parseInt(inTz.find(p => p.type === "hour")!.value);
    const localM = parseInt(inTz.find(p => p.type === "minute")!.value);
    const diffMs = ((targetH * 60 + targetM) - (localH * 60 + localM)) * 60_000;
    return new Date(naive.getTime() + diffMs);
  }

  const fb = new Date();
  fb.setDate(fb.getDate() + waitDays);
  return fb;
}

export async function checkDailyLimits(inboxId: string, dailyLimit: number): Promise<number> {
  const supabase   = adminClient();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("outreach_sends")
    .select("id", { count: "exact", head: true })
    .eq("inbox_id", inboxId)
    .in("status", ["sent","queued"])
    .gte("created_at", todayStart.toISOString());

  return Math.max(0, dailyLimit - (count ?? 0));
}

export async function markEnrollmentReplied(enrollmentId: string, sendId: string): Promise<void> {
  const supabase = adminClient();
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from("outreach_enrollments").update({ status: "replied" }).eq("id", enrollmentId),
    supabase.from("outreach_sends").update({ replied_at: now }).eq("id", sendId),
  ]);
}

export async function advanceEnrollment(
  enrollmentId: string, nextStep: number, nextSendAt: Date | null, completed: boolean,
): Promise<void> {
  const supabase = adminClient();
  await supabase.from("outreach_enrollments").update({
    current_step: nextStep,
    status:       completed ? "completed" : "active",
    next_send_at: nextSendAt?.toISOString() ?? null,
    completed_at: completed ? new Date().toISOString() : null,
  }).eq("id", enrollmentId);

  if (completed) {
    await maybeCompleteCampaign(enrollmentId).catch(e =>
      console.error("[scheduler] campaign-completion check failed:", e));
  }
}

/**
 * When the last live enrollment of a campaign finishes, flip the campaign to
 * 'completed' and push a milestone notification. The status-guarded update
 * makes the flip idempotent under concurrent enrollment completions — only
 * the update that actually changes the row fires the push.
 */
async function maybeCompleteCampaign(enrollmentId: string): Promise<void> {
  const supabase = adminClient();

  const { data: enr } = await supabase
    .from("outreach_enrollments")
    .select("campaign_id, workspace_id")
    .eq("id", enrollmentId)
    .single();
  if (!enr) return;

  const { count: liveCount } = await supabase
    .from("outreach_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", enr.campaign_id)
    .in("status", ["active", "paused"]);
  if ((liveCount ?? 0) > 0) return;

  const { data: flipped } = await supabase
    .from("outreach_campaigns")
    .update({ status: "completed" })
    .eq("id", enr.campaign_id)
    .eq("status", "active")
    .select("id, name")
    .maybeSingle();
  if (!flipped) return;

  const { count: totalEnrolled } = await supabase
    .from("outreach_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", enr.campaign_id);

  import("@/lib/queue").then(({ enqueuePush }) => enqueuePush({
    type:         "milestone",
    workspace_id: enr.workspace_id,
    campaign_id:  enr.campaign_id,
    title:        "Sequence finished",
    body:         `"${flipped.name}" finished sending to ${totalEnrolled ?? 0} enrolled leads.`,
  })).catch(() => {});
}
