import { createClient } from "@supabase/supabase-js";
import type { OutreachEnrollment, OutreachCampaign, OutreachSequenceStep } from "@/types/outreach";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
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

  if (error || !enrollments) return [];

  const results: DueEnrollment[] = [];
  for (const enrollment of enrollments) {
    const campaign = enrollment.campaign as OutreachCampaign;
    if (!campaign || campaign.status !== "active") continue;
    if (!isWithinSendWindow(campaign)) continue;

    const { data: step } = await supabase
      .from("outreach_sequences")
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("step_order", enrollment.current_step)
      .single();

    if (!step) continue;
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
  return current >= sh * 60 + sm && current < eh * 60 + em;
}

export function computeNextSendAt(waitDays: number, campaign: OutreachCampaign): Date {
  const tz       = campaign.timezone ?? "America/New_York";
  const sendDays = campaign.send_days ?? ["mon","tue","wed","thu","fri"];
  const [sh, sm] = (campaign.send_start_time ?? "09:00").split(":").map(Number);

  const base = new Date();
  base.setDate(base.getDate() + waitDays);

  for (let i = 0; i < 14; i++) {
    const candidate = new Date(base);
    candidate.setDate(base.getDate() + i);
    const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" })
      .format(candidate).toLowerCase().slice(0, 3);
    if (sendDays.includes(day)) {
      candidate.setHours(sh, sm + Math.floor(Math.random() * 60), 0, 0);
      return candidate;
    }
  }
  const fb = new Date(); fb.setDate(fb.getDate() + waitDays);
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
}
