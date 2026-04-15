/**
 * Warmup pool runner — workspace-scoped.
 * Steps: A) send warmup emails, B) auto-reply ~40%, C) spam rescue
 */

import { createClient } from "@supabase/supabase-js";
import { sendGmailMessage } from "@/lib/outreach/gmail";
import { sendMicrosoftMessage } from "@/lib/outreach/microsoft";
import { sendSmtpMessage } from "@/lib/outreach/smtp";
import { selectSendTemplate, selectReplyTemplate } from "@/lib/outreach/warmup-templates";
import type { OutreachInbox } from "@/types/outreach";

const AUTH_ERROR_PATTERN = /invalid_grant|token.*expired|token.*revoked|access.*denied|unauthorized|authentication.*fail|auth.*fail|535|534|530|credentials|wrong.*password|password.*incorrect|account.*suspended|account.*disabled|login.*fail|AUTHENTICATIONFAILED|AUTH.*FAILED/i;

function supabase() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface WarmupResult {
  sent: number; replied: number; rescued: number;
}

export async function runWarmupPool(workspaceId: string): Promise<WarmupResult> {
  const db = supabase();
  const result: WarmupResult = { sent: 0, replied: 0, rescued: 0 };

  // ── Trial expiry guard ──────────────────────────────────────────────────────
  // Free-plan workspaces with an expired trial have warmup disabled automatically.
  const { data: ws } = await db
    .from("workspaces")
    .select("plan_id, trial_ends_at")
    .eq("id", workspaceId)
    .single();

  if (ws?.plan_id === "free" && ws.trial_ends_at && new Date(ws.trial_ends_at) < new Date()) {
    // Disable warmup for all inboxes in this workspace so the flag is accurate
    await db
      .from("outreach_inboxes")
      .update({ warmup_enabled: false })
      .eq("workspace_id", workspaceId)
      .eq("warmup_enabled", true);
    console.log(`[warmup] ws=${workspaceId} trial expired — warmup disabled`);
    return result;
  }
  // ───────────────────────────────────────────────────────────────────────────

  // Global pool: all active warmup-enabled inboxes across every workspace.
  // Used as the recipient universe so a workspace benefits from all server emails.
  const { data: globalPool } = await db
    .from("outreach_inboxes")
    .select("*")
    .eq("status", "active")
    .eq("warmup_enabled", true);

  // Local pool: only this workspace's inboxes — we only send/reply/rescue from
  // inboxes we control (i.e. have credentials for in this workspace).
  const localPool = (globalPool ?? []).filter((i: OutreachInbox) => i.workspace_id === workspaceId);

  if (!localPool.length || !globalPool || globalPool.length < 2) return result;

  const localIds = new Set(localPool.map((i: OutreachInbox) => i.id));

  // ── Step A: Send warmup emails ────────────────────────────────────────────
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const { data: todayCounts } = await db
    .from("outreach_warmup_sends")
    .select("from_inbox_id")
    .in("from_inbox_id", localPool.map((i: OutreachInbox) => i.id))
    .gte("sent_at", todayStart.toISOString());

  const sentToday = new Map<string, number>();
  for (const r of todayCounts ?? []) sentToday.set(r.from_inbox_id, (sentToday.get(r.from_inbox_id) ?? 0) + 1);

  // Count campaign sends today per inbox so warmup stays within the daily_send_limit
  const { data: campaignCounts } = await db
    .from("outreach_sends")
    .select("inbox_id")
    .in("inbox_id", localPool.map((i: OutreachInbox) => i.id))
    .in("status", ["sent", "queued"])
    .gte("created_at", todayStart.toISOString());

  const campaignSentToday = new Map<string, number>();
  for (const r of campaignCounts ?? []) {
    campaignSentToday.set(r.inbox_id, (campaignSentToday.get(r.inbox_id) ?? 0) + 1);
  }

  for (const sender of localPool) {
    const campaignUsed  = campaignSentToday.get(sender.id) ?? 0;
    const remaining     = Math.max(0, (sender.daily_send_limit ?? 30) - campaignUsed);
    const perRun        = Math.max(1, Math.floor(sender.warmup_current_daily / 6));
    const alreadySent   = sentToday.get(sender.id) ?? 0;
    const toSend        = Math.min(perRun, Math.max(0, sender.warmup_current_daily - alreadySent), remaining);
    if (toSend === 0) continue;

    const recipients = pool.filter(r => r.id !== sender.id);
    if (!recipients.length) continue;

    for (let i = 0; i < toSend; i++) {
      const recipient  = recipients[i % recipients.length];
      const warmupId   = crypto.randomUUID();
      const template   = selectSendTemplate(`${sender.id}-${recipient.id}-${Date.now()}`, sender.first_name, recipient.first_name);
      const warmupHdr  = { "X-LD-Ref": warmupId };
      const htmlBody   = `<!--pps-ref:${warmupId}--><p>${template.body.replace(/\n/g, "</p><p>")}</p>`;

      try {
        let messageId = "", threadId = "";
        if (sender.provider === "gmail" && sender.oauth_refresh_token) {
          const r = await sendGmailMessage(sender as OutreachInbox, { to: recipient.email_address, subject: template.subject, htmlBody, textBody: template.body, customHeaders: warmupHdr });
          messageId = r.messageId; threadId = r.threadId ?? "";
        } else if (sender.provider === "outlook" && sender.oauth_refresh_token) {
          const r = await sendMicrosoftMessage(sender as OutreachInbox, { to: recipient.email_address, subject: template.subject, htmlBody, textBody: template.body, customHeaders: warmupHdr });
          messageId = r.messageId; threadId = r.threadId ?? "";
        } else {
          const r = await sendSmtpMessage(sender as OutreachInbox, { to: recipient.email_address, subject: template.subject, htmlBody, textBody: template.body, customHeaders: warmupHdr });
          messageId = r.messageId;
        }

        await db.from("outreach_warmup_sends").insert({
          id: warmupId, workspace_id: workspaceId,
          from_inbox_id: sender.id, to_inbox_id: recipient.id,
          message_id: messageId, thread_id: threadId || messageId,
          subject: template.subject, sent_at: new Date().toISOString(),
        });
        result.sent++;
      } catch (err) {
        const msg = String(err);
        if (AUTH_ERROR_PATTERN.test(msg)) {
          await db.from("outreach_inboxes").update({ status: "error", last_error: msg.slice(0, 500) }).eq("id", sender.id);
        }
      }
    }
  }

  // ── Step B: Reply to warmup emails (~40%) ─────────────────────────────────
  const since = new Date(Date.now() - 24 * 3_600_000);
  const { data: pending } = await db.from("outreach_warmup_sends")
    .select("*").eq("workspace_id", workspaceId).gte("sent_at", since.toISOString()).is("replied_at", null);

  for (const ws of pending ?? []) {
    if (Math.random() > 0.4) continue;
    const recipient = pool.find(p => p.id === ws.to_inbox_id);
    const sender    = pool.find(p => p.id === ws.from_inbox_id);
    if (!recipient || !sender) continue;

    const replyWarmupId = crypto.randomUUID();
    const tpl   = selectReplyTemplate(`reply-${ws.id}`, sender?.first_name);
    const subj  = ws.subject ? `Re: ${ws.subject}` : "Re: (no subject)";
    const html  = `<!--pps-ref:${replyWarmupId}--><p>${tpl.body}</p>`;
    const hdr   = { "X-LD-Ref": replyWarmupId };

    try {
      if (recipient.provider === "gmail" && recipient.oauth_refresh_token) {
        await sendGmailMessage(recipient as OutreachInbox, { to: sender.email_address, subject: subj, htmlBody: html, textBody: tpl.body, replyToThreadId: ws.thread_id, inReplyToMessageId: ws.message_id, customHeaders: hdr });
      } else if (recipient.provider === "outlook" && recipient.oauth_refresh_token) {
        await sendMicrosoftMessage(recipient as OutreachInbox, { to: sender.email_address, subject: subj, htmlBody: html, textBody: tpl.body, replyToThreadId: ws.thread_id, inReplyToMessageId: ws.message_id, customHeaders: hdr });
      } else {
        await sendSmtpMessage(recipient as OutreachInbox, { to: sender.email_address, subject: subj, htmlBody: html, textBody: tpl.body, inReplyToMessageId: ws.message_id, customHeaders: hdr });
      }
      await db.from("outreach_warmup_sends").update({ replied_at: new Date().toISOString() }).eq("id", ws.id);
      result.replied++;
    } catch { /* non-fatal */ }
  }

  // ── Step C: Spam rescue ───────────────────────────────────────────────────
  const { data: recentSends } = await db.from("outreach_warmup_sends")
    .select("*").eq("workspace_id", workspaceId).gte("sent_at", since.toISOString()).eq("rescued_from_spam", false);

  for (const ws of recentSends ?? []) {
    const inbox = pool.find(p => p.id === ws.to_inbox_id);
    if (!inbox) continue;

    try {
      let rescued = false;
      if (inbox.provider === "gmail" && inbox.oauth_refresh_token) {
        rescued = await rescueGmail(inbox as OutreachInbox, ws.id);
      } else if (inbox.imap_host) {
        rescued = await rescueSmtp(inbox as OutreachInbox, ws.id);
      }
      if (rescued) {
        await db.from("outreach_warmup_sends").update({ rescued_from_spam: true }).eq("id", ws.id);
        result.rescued++;
      }
    } catch { /* non-fatal */ }
  }

  return result;
}

// ── Gmail spam rescue ──────────────────────────────────────────────────────────
async function rescueGmail(inbox: OutreachInbox, warmupId: string): Promise<boolean> {
  const { getGmailClient } = await import("@/lib/outreach/gmail");
  const gmail = await getGmailClient(inbox);
  const spam  = await gmail.users.messages.list({ userId: "me", labelIds: ["SPAM"], q: "newer_than:1d", maxResults: 50 });

  for (const item of spam.data.messages ?? []) {
    if (!item.id) continue;
    const msg = await gmail.users.messages.get({ userId: "me", id: item.id, format: "metadata", metadataHeaders: ["X-LD-Ref"] });
    const ref  = msg.data.payload?.headers?.find(h => h.name === "X-LD-Ref")?.value;
    if (ref !== warmupId) continue;
    await gmail.users.messages.modify({ userId: "me", id: item.id, requestBody: { addLabelIds: ["INBOX","IMPORTANT"], removeLabelIds: ["SPAM"] } });
    return true;
  }
  return false;
}

// ── SMTP spam rescue ───────────────────────────────────────────────────────────
async function rescueSmtp(inbox: OutreachInbox, warmupId: string): Promise<boolean> {
  const { ImapFlow } = await import("imapflow");
  const { decrypt }  = await import("@/lib/outreach/crypto");
  const pass = inbox.smtp_pass_encrypted ? decrypt(inbox.smtp_pass_encrypted) : "";
  const client = new ImapFlow({ host: inbox.imap_host!, port: inbox.imap_port ?? 993, secure: true, auth: { user: inbox.smtp_user!, pass }, logger: false });

  await client.connect();
  const folders = ["Junk","[Gmail]/Spam","Spam","Junk Email"];
  let rescued = false;

  for (const folder of folders) {
    let lock;
    try { lock = await client.getMailboxLock(folder); } catch { continue; }
    try {
      for await (const msg of client.fetch({ since: new Date(Date.now() - 86_400_000) }, { envelope: true, headers: ["x-ld-ref"] })) {
        const h = msg.headers?.toString() ?? "";
        const m = h.match(/x-ld-ref:\s*(.+)/i);
        if (m?.[1]?.trim() !== warmupId) continue;
        if (msg.uid) { await client.messageMove(String(msg.uid), "INBOX", { uid: true }); rescued = true; }
        break;
      }
    } finally { lock.release(); }
    if (rescued) break;
  }

  await client.logout();
  return rescued;
}

// ── Weekly ramp (call every Monday) ──────────────────────────────────────────
export async function runWarmupRamp(workspaceId: string): Promise<void> {
  const db = supabase();
  const { data: inboxes } = await db.from("outreach_inboxes").select("id, warmup_current_daily, warmup_target_daily, warmup_ramp_per_week")
    .eq("workspace_id", workspaceId).eq("warmup_enabled", true);

  for (const inbox of inboxes ?? []) {
    if (inbox.warmup_current_daily >= inbox.warmup_target_daily) continue;
    const newVal = Math.min(inbox.warmup_target_daily, inbox.warmup_current_daily + inbox.warmup_ramp_per_week);
    await db.from("outreach_inboxes").update({ warmup_current_daily: newVal }).eq("id", inbox.id);
  }
}
