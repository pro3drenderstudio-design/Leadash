import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendSmtpMessage } from "@/lib/outreach/smtp";
import { sendGmailMessage } from "@/lib/outreach/gmail";
import { sendMicrosoftMessage } from "@/lib/outreach/microsoft";
import type { OutreachInbox } from "@/types/outreach";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db  = createAdminClient();
  const now = new Date().toISOString();

  // Find all enrollments with a scheduled reply that is now due
  const { data: enrollments, error } = await db
    .from("outreach_enrollments")
    .select("id, workspace_id, scheduled_reply_at, scheduled_reply_body, lead:outreach_leads!lead_id(id, email, first_name, last_name)")
    .not("scheduled_reply_at", "is", null)
    .not("scheduled_reply_body", "is", null)
    .lte("scheduled_reply_at", now)
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;

  for (const enrollment of enrollments ?? []) {
    const enrollmentId  = enrollment.id as string;
    const workspaceId   = enrollment.workspace_id as string;
    const body          = enrollment.scheduled_reply_body as string;
    const lead          = enrollment.lead as Record<string, unknown> | null;

    if (!lead) continue;

    const toEmail = lead.email as string;

    // Find inbox: prefer the one that received the original reply
    const { data: latestReply } = await db
      .from("outreach_replies")
      .select("inbox_id, subject, message_id")
      .eq("enrollment_id", enrollmentId)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let inbox: OutreachInbox | null = null;

    if (latestReply?.inbox_id) {
      const { data } = await db
        .from("outreach_inboxes")
        .select("*")
        .eq("id", latestReply.inbox_id as string)
        .eq("workspace_id", workspaceId)
        .single();
      inbox = (data as OutreachInbox) ?? null;
    }

    if (!inbox) {
      const { data } = await db
        .from("outreach_inboxes")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("status", "active")
        .limit(1)
        .single();
      inbox = (data as OutreachInbox) ?? null;
    }

    if (!inbox) {
      console.warn(`[cron/scheduled-replies] no inbox for enrollment ${enrollmentId}, skipping`);
      continue;
    }

    const subjectRaw   = (latestReply?.subject as string | null) ?? "";
    const subject      = subjectRaw.startsWith("Re:") ? subjectRaw : `Re: ${subjectRaw || "(no subject)"}`;
    const fromName     = [inbox.first_name, inbox.last_name].filter(Boolean).join(" ") || undefined;
    const inReplyToId  = (latestReply?.message_id as string | null) ?? undefined;
    const htmlBody     = body.replace(/\n/g, "<br>");

    try {
      let messageId: string;

      if (inbox.provider === "gmail" && inbox.oauth_refresh_token) {
        const result = await sendGmailMessage(inbox, {
          to: toEmail, subject, htmlBody, textBody: body, fromName, inReplyToMessageId: inReplyToId,
        });
        messageId = result.messageId;
      } else if (inbox.provider === "outlook" && inbox.oauth_refresh_token) {
        const result = await sendMicrosoftMessage(inbox, {
          to: toEmail, subject, htmlBody, textBody: body, fromName, inReplyToMessageId: inReplyToId,
        });
        messageId = result.messageId;
      } else {
        const result = await sendSmtpMessage(inbox, {
          to: toEmail, subject, htmlBody, textBody: body, fromName, inReplyToMessageId: inReplyToId,
        });
        messageId = result.messageId;
      }

      // Record the send
      await db.from("outreach_sends").insert({
        workspace_id:  workspaceId,
        enrollment_id: enrollmentId,
        inbox_id:      inbox.id,
        to_email:      toEmail,
        subject,
        body,
        status:        "sent",
        message_id:    messageId || null,
        sent_at:       new Date().toISOString(),
      });

      // Update enrollment status and clear scheduled reply fields
      await db
        .from("outreach_enrollments")
        .update({
          status:               "replied",
          scheduled_reply_at:   null,
          scheduled_reply_body: null,
        })
        .eq("id", enrollmentId);

      sent++;
    } catch (err) {
      console.error(`[cron/scheduled-replies] failed for enrollment ${enrollmentId}:`, err);
      // Clear the scheduled reply even on failure to avoid infinite retries
      await db
        .from("outreach_enrollments")
        .update({ scheduled_reply_at: null, scheduled_reply_body: null })
        .eq("id", enrollmentId);
    }
  }

  return NextResponse.json({ sent });
}
