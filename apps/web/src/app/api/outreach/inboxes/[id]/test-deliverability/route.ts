import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { sendSmtpMessage } from "@/lib/outreach/smtp";
import { sendGmailMessage } from "@/lib/outreach/gmail";
import { sendMicrosoftMessage } from "@/lib/outreach/microsoft";
import type { OutreachInbox } from "@/types/outreach";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { data: inbox } = await db
    .from("outreach_inboxes")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!inbox) return NextResponse.json({ error: "Inbox not found" }, { status: 404 });

  // Send to the logged-in user's email
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const toEmail = user?.email;
  if (!toEmail) return NextResponse.json({ error: "Could not determine user email" }, { status: 400 });

  const subject  = "Leadash deliverability test";
  const textBody = "This is a test email sent by Leadash to verify your inbox can send successfully. You can delete it.";
  const htmlBody = `
    <div style="font-family:sans-serif;max-width:480px;padding:24px;color:#111">
      <h2 style="margin:0 0 12px;font-size:18px">Deliverability test ✓</h2>
      <p style="margin:0 0 8px;color:#555;font-size:14px">
        This message was sent by <strong>Leadash</strong> to verify that
        <strong>${inbox.email_address}</strong> can send successfully.
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#aaa">You can delete this email.</p>
    </div>`;

  try {
    if (inbox.provider === "gmail" && inbox.oauth_refresh_token) {
      await sendGmailMessage(inbox as OutreachInbox, {
        to: inbox.email_address,
        subject,
        htmlBody,
        textBody,
      });
    } else if (inbox.provider === "outlook" && inbox.oauth_refresh_token) {
      await sendMicrosoftMessage(inbox as OutreachInbox, {
        to: inbox.email_address,
        subject,
        htmlBody,
        textBody,
      });
    } else if (inbox.smtp_host && inbox.smtp_user) {
      await sendSmtpMessage(inbox as OutreachInbox, {
        to: inbox.email_address,
        subject,
        htmlBody,
        textBody,
      });
    } else {
      return NextResponse.json(
        { error: "Inbox has no sending credentials configured" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      message: `Test email sent to ${inbox.email_address} — check your inbox.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
