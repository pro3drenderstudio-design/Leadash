/**
 * Core outreach send loop — workspace-scoped for multi-tenant use.
 */

import { createClient } from "@supabase/supabase-js";
import { getDueEnrollments, checkDailyLimits, advanceEnrollment, computeNextSendAt } from "@/lib/outreach/scheduler";
import { renderEmail } from "@/lib/outreach/template";
import { sendGmailMessage } from "@/lib/outreach/gmail";
import { sendMicrosoftMessage } from "@/lib/outreach/microsoft";
import { sendSmtpMessage } from "@/lib/outreach/smtp";
import type { OutreachInbox, OutreachSequenceStep, OutreachCampaign } from "@/types/outreach";

const BOUNCE_PATTERN     = /5\d\d|user unknown|mailbox not found|no such user|does not exist|invalid.*address|recipient.*rejected/i;
const AUTH_ERROR_PATTERN = /invalid_grant|token.*expired|token.*revoked|access.*denied|unauthorized|authentication.*fail|auth.*fail|535|534|530|credentials|wrong.*password|password.*incorrect|account.*suspended|account.*disabled|login.*fail|AUTHENTICATIONFAILED|AUTH.*FAILED/i;

function supabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export interface SendRunResult {
  processed: number;
  sent:      number;
  skipped:   number;
  errors:    number;
}

interface InboxSlot { inbox: OutreachInbox; remaining: number; used: number; }

const DOMAIN_MAX_DAILY = 15; // hard cap for Leadash-provisioned inboxes

async function buildInboxPool(db: ReturnType<typeof supabase>, campaign: OutreachCampaign): Promise<InboxSlot[]> {
  if (!campaign.inbox_ids?.length) return [];
  const { data: rows } = await db
    .from("outreach_inboxes")
    .select("*, outreach_domains(warmup_ends_at)")
    .in("id", campaign.inbox_ids)
    .eq("status", "active");

  const slots: InboxSlot[] = [];
  for (const row of rows ?? []) {
    // Block inboxes that are still in the 21-day warmup period
    const domainWarmupEndsAt = (row as Record<string, unknown>).outreach_domains
      ? ((row as Record<string, unknown>).outreach_domains as Record<string, unknown>).warmup_ends_at as string | null
      : null;
    const inboxWarmupEndsAt = (row as Record<string, unknown>).warmup_ends_at as string | null;
    const effectiveWarmupEnd = domainWarmupEndsAt ?? inboxWarmupEndsAt;
    if (effectiveWarmupEnd && new Date(effectiveWarmupEnd) > new Date()) continue;

    // Enforce hard cap for Leadash-provisioned inboxes
    const sendLimit = row.domain_id ? Math.min(row.daily_send_limit, DOMAIN_MAX_DAILY) : row.daily_send_limit;

    const remaining = await checkDailyLimits(row.id, sendLimit);
    if (remaining > 0) slots.push({ inbox: row as OutreachInbox, remaining, used: 0 });
  }
  return slots;
}

function pickInbox(slots: InboxSlot[], rrIndex: number): { slot: InboxSlot; nextRr: number } | null {
  const n = slots.length;
  for (let i = 0; i < n; i++) {
    const slot = slots[(rrIndex + i) % n];
    if (slot.used < slot.remaining) return { slot, nextRr: (rrIndex + i + 1) % n };
  }
  return null;
}

export async function runSendBatch(
  workspaceId: string,
  limit    = 20,
  minDelay = 2_000,
  maxDelay = 5_000,
): Promise<SendRunResult> {
  const due    = await getDueEnrollments(workspaceId, limit);
  const result: SendRunResult = { processed: due.length, sent: 0, skipped: 0, errors: 0 };
  if (!due.length) return result;

  const db = supabase();

  // Load workspace settings once
  const { data: wsSettings } = await db.from("workspace_settings").select("*").eq("workspace_id", workspaceId).single();
  const footerEnabled = wsSettings?.footer_enabled !== false;
  const footerText    = wsSettings?.footer_custom_text ?? undefined;
  const footerAddress = wsSettings?.footer_address ?? undefined;

  // Group by campaign → one inbox pool per campaign
  const byCampaign = new Map<string, { items: typeof due; slots: InboxSlot[]; rrIdx: number }>();
  for (const item of due) {
    const cid = item.campaign.id;
    if (!byCampaign.has(cid)) {
      const slots = await buildInboxPool(db, item.campaign);
      byCampaign.set(cid, { items: [], slots, rrIdx: 0 });
    }
    byCampaign.get(cid)!.items.push(item);
  }

  for (const { items, slots, rrIdx: startRr } of byCampaign.values()) {
    if (!slots.length) { result.skipped += items.length; continue; }
    let rr = startRr;

    for (const { enrollment, campaign, step: seqStep } of items) {
      const pick = pickInbox(slots, rr);
      if (!pick) { result.skipped++; continue; }
      const { slot } = pick;
      rr = pick.nextRr;
      slot.used++;

      if (seqStep.type === "wait") {
        const nextSendAt = computeNextSendAt(seqStep.wait_days, campaign);
        const { data: nextStep } = await db.from("outreach_sequences").select("*")
          .eq("campaign_id", campaign.id).eq("step_order", seqStep.step_order + 1).single();
        await advanceEnrollment(enrollment.id, seqStep.step_order + 1, nextSendAt, !nextStep);
        result.skipped++;
        continue;
      }

      const { data: lead } = await db.from("outreach_leads").select("*").eq("id", enrollment.lead_id).single();
      if (!lead) { result.skipped++; continue; }

      // Unsubscribe check
      const { data: unsub } = await db.from("outreach_unsubscribes").select("id")
        .eq("workspace_id", workspaceId).eq("email", lead.email.toLowerCase()).single();
      if (unsub) {
        await db.from("outreach_enrollments").update({ status: "unsubscribed" }).eq("id", enrollment.id);
        result.skipped++; continue;
      }

      // Blacklist domain check
      const domain = lead.email.split("@")[1]?.toLowerCase();
      if (domain) {
        const { data: blocked } = await db.from("outreach_blacklist_domains").select("id")
          .eq("workspace_id", workspaceId).eq("domain", domain).single();
        if (blocked) { result.skipped++; continue; }
      }

      // Pause after open
      if (campaign.pause_after_open) {
        const { data: opened } = await db.from("outreach_sends").select("id")
          .eq("enrollment_id", enrollment.id).not("opened_at", "is", null).limit(1).single();
        if (opened) { result.skipped++; continue; }
      }

      const abVariant: "a" | "b" = enrollment.ab_variant ?? "a";
      const subjectTemplate = abVariant === "b" && seqStep.subject_template_b
        ? seqStep.subject_template_b
        : (seqStep.subject_template ?? "");

      const { data: sendRecord } = await db.from("outreach_sends").insert({
        workspace_id:     workspaceId,
        enrollment_id:    enrollment.id,
        sequence_step_id: seqStep.id,
        inbox_id:         slot.inbox.id,
        to_email:         lead.email,
        subject:          subjectTemplate,
        body:             seqStep.body_template ?? "",
        status:           "queued",
      }).select("id").single();

      if (!sendRecord) { result.errors++; continue; }

      const rendered = renderEmail({
        subjectTemplate,
        bodyTemplate:    seqStep.body_template ?? "",
        lead,
        sendId:          sendRecord.id,
        signature:       slot.inbox.signature,
        trackOpens:      campaign.track_opens,
        trackClicks:     campaign.track_clicks,
        footerEnabled,
        footerText,
        physicalAddress: footerAddress,
      });

      if (rendered.trackedLinks.length) {
        await db.from("outreach_tracked_links").insert(
          rendered.trackedLinks.map(l => ({ workspace_id: workspaceId, send_id: sendRecord.id, ...l }))
        );
      }

      await db.from("outreach_sends").update({ subject: rendered.subject, body: rendered.body }).eq("id", sendRecord.id);

      // For follow-up steps, thread the email onto the previous send in this enrollment
      let inReplyToMessageId: string | undefined;
      let replyToThreadId: string | undefined;
      if (seqStep.step_order > 1) {
        const { data: prevSend } = await db
          .from("outreach_sends")
          .select("message_id, thread_id")
          .eq("enrollment_id", enrollment.id)
          .eq("status", "sent")
          .order("sent_at", { ascending: false })
          .limit(1)
          .single();
        if (prevSend?.message_id) {
          inReplyToMessageId = prevSend.message_id;
          replyToThreadId    = prevSend.thread_id ?? prevSend.message_id;
        }
      }

      try {
        const sendResult = await sendViaInbox(slot.inbox, {
          to: lead.email, subject: rendered.subject, htmlBody: rendered.body, textBody: rendered.textBody,
          inReplyToMessageId, replyToThreadId,
        });

        await db.from("outreach_sends").update({
          status:     "sent",
          sent_at:    new Date().toISOString(),
          message_id: sendResult.messageId.replace(/^<|>$/g, ""),
          thread_id:  sendResult.threadId ?? null,
        }).eq("id", sendRecord.id);

        result.sent++;
      } catch (err) {
        const errMsg = String(err);
        if (BOUNCE_PATTERN.test(errMsg)) {
          await db.from("outreach_sends").update({ status: "bounced", bounced_at: new Date().toISOString() }).eq("id", sendRecord.id);
          await db.from("outreach_enrollments").update({ status: "bounced" }).eq("id", enrollment.id);
          await db.from("outreach_leads").update({ status: "bounced" }).eq("id", lead.id);
        } else {
          await db.from("outreach_sends").update({ status: "failed" }).eq("id", sendRecord.id);
          const inboxPatch: Record<string, unknown> = { last_error: errMsg.slice(0, 500), updated_at: new Date().toISOString() };
          if (AUTH_ERROR_PATTERN.test(errMsg)) inboxPatch.status = "error";
          await db.from("outreach_inboxes").update(inboxPatch).eq("id", slot.inbox.id);
        }
        result.errors++;
        continue;
      }

      const { data: nextStep } = await db.from("outreach_sequences").select("*")
        .eq("campaign_id", campaign.id).eq("step_order", seqStep.step_order + 1).single();

      if (nextStep) {
        const nextSendAt = computeNextSendAt((nextStep as OutreachSequenceStep).wait_days, campaign);
        await advanceEnrollment(enrollment.id, (nextStep as OutreachSequenceStep).step_order, nextSendAt, false);
      } else {
        await advanceEnrollment(enrollment.id, seqStep.step_order + 1, null, true);
      }

      const delay = minDelay + Math.random() * (maxDelay - minDelay);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return result;
}

async function sendViaInbox(
  inbox: OutreachInbox,
  opts: { to: string; subject: string; htmlBody: string; textBody: string; inReplyToMessageId?: string; replyToThreadId?: string },
): Promise<{ messageId: string; threadId?: string }> {
  if (inbox.provider === "gmail"   && inbox.oauth_refresh_token) return sendGmailMessage(inbox, opts);
  if (inbox.provider === "outlook" && inbox.oauth_refresh_token) return sendMicrosoftMessage(inbox, opts);
  const r = await sendSmtpMessage(inbox, opts);
  return { messageId: r.messageId };
}
