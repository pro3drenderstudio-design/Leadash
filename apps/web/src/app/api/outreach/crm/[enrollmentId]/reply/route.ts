import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { sendSmtpMessage } from "@/lib/outreach/smtp";
import { sendGmailMessage } from "@/lib/outreach/gmail";
import { sendMicrosoftMessage } from "@/lib/outreach/microsoft";
import type { OutreachInbox } from "@/types/outreach";

// POST /api/outreach/crm/[enrollmentId]/reply
// Sends a manual reply from the CRM inbox view.
// Uses the inbox that received the original reply (or the campaign's first inbox).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ enrollmentId: string }> },
) {
  const { enrollmentId } = await params;
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const payload = await req.json() as { body: string; html_body?: string };
  const body = payload.body ?? "";
  const htmlBodyRaw = payload.html_body;
  if (!body?.trim() && !htmlBodyRaw?.trim()) return NextResponse.json({ error: "body is required" }, { status: 400 });

  // Fetch enrollment + lead
  const { data: enrollment } = await db
    .from("outreach_enrollments")
    .select("*, lead:outreach_leads!lead_id(*)")
    .eq("id", enrollmentId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!enrollment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lead = enrollment.lead as Record<string, unknown>;

  // Find inbox: prefer the one that received the original reply
  const { data: latestReply } = await db
    .from("outreach_replies")
    .select("inbox_id, subject, message_id")
    .eq("enrollment_id", enrollmentId)
    .order("received_at", { ascending: false })
    .limit(1)
    .single();

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

  // Fallback: use any active inbox in the workspace
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

  if (!inbox) return NextResponse.json({ error: "No active inbox found to send from" }, { status: 400 });

  const toEmail   = lead.email as string;
  const firstName = (lead.first_name as string | null) || "";
  const subjectRaw = (latestReply?.subject as string | null) ?? "";
  const subject = subjectRaw.startsWith("Re:") ? subjectRaw : `Re: ${subjectRaw || "(no subject)"}`;
  const fromName = [inbox.first_name, inbox.last_name].filter(Boolean).join(" ") || undefined;
  const inReplyToId = (latestReply?.message_id as string | null) ?? undefined;

  try {
    let messageId: string;

    const htmlBody = htmlBodyRaw?.trim() ? htmlBodyRaw : body.replace(/\n/g, "<br>");
    const textBody = body || (htmlBodyRaw ?? "").replace(/<[^>]+>/g, "");

    if (inbox.provider === "gmail" && inbox.oauth_refresh_token) {
      const result = await sendGmailMessage(inbox, {
        to: toEmail, subject, htmlBody,
        textBody, fromName, inReplyToMessageId: inReplyToId,
      });
      messageId = result.messageId;
    } else if (inbox.provider === "outlook" && inbox.oauth_refresh_token) {
      const result = await sendMicrosoftMessage(inbox, {
        to: toEmail, subject, htmlBody,
        textBody, fromName, inReplyToMessageId: inReplyToId,
      });
      messageId = result.messageId;
    } else {
      const result = await sendSmtpMessage(inbox, {
        to: toEmail, subject, htmlBody,
        textBody, fromName, inReplyToMessageId: inReplyToId,
      });
      messageId = result.messageId;
    }

    // Record the send
    const { error: insertErr } = await db.from("outreach_sends").insert({
      workspace_id:  workspaceId,
      enrollment_id: enrollmentId,
      inbox_id:      inbox.id,
      to_email:      toEmail,
      subject,
      body:          htmlBodyRaw?.trim() ? htmlBodyRaw : body,
      status:        "sent",
      message_id:    messageId || null,
      sent_at:       new Date().toISOString(),
    });
    if (insertErr) console.error("[crm/reply] send record insert failed:", insertErr.message);

    // Ensure enrollment stays replied
    await db
      .from("outreach_enrollments")
      .update({ status: "replied" })
      .eq("id", enrollmentId)
      .eq("workspace_id", workspaceId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
