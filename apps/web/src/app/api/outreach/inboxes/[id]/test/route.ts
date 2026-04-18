import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { sendSmtpMessage } from "@/lib/outreach/smtp";
import { sendGmailMessage } from "@/lib/outreach/gmail";
import { sendMicrosoftMessage } from "@/lib/outreach/microsoft";
import { interpolate } from "@/lib/outreach/template";
import type { OutreachInbox, OutreachLead } from "@/types/outreach";

const SAMPLE_LEAD: OutreachLead = {
  id: "sample",
  workspace_id: "",
  email: "sample@example.com",
  first_name: "Jane",
  last_name: "Smith",
  company: "Acme Corp",
  title: "VP of Sales",
  website: "acmecorp.com",
  status: "active",
  custom_fields: {},
  created_at: new Date().toISOString(),
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { to_email, subject_template, body_template, lead_id } = await req.json() as {
    to_email: string;
    subject_template: string;
    body_template: string;
    lead_id?: string;
  };

  if (!to_email) return NextResponse.json({ error: "to_email is required" }, { status: 400 });

  // Fetch inbox
  const { data: inbox, error: inboxErr } = await db
    .from("outreach_inboxes")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (inboxErr || !inbox) return NextResponse.json({ error: "Inbox not found" }, { status: 404 });

  // Resolve lead for variable substitution
  let lead: OutreachLead = SAMPLE_LEAD;
  if (lead_id) {
    const { data: fetchedLead } = await db
      .from("outreach_leads")
      .select("*")
      .eq("id", lead_id)
      .eq("workspace_id", workspaceId)
      .single();
    if (fetchedLead) lead = fetchedLead as OutreachLead;
  }

  const subject = interpolate(subject_template ?? "", lead);
  let body = interpolate(body_template ?? "", lead);

  // Wrap plain text as HTML paragraphs if no HTML tags present
  if (!/<[a-z][\s\S]*>/i.test(body)) {
    body = body
      .split(/\n\n+/)
      .map((p) => `<p style="margin:0 0 14px 0">${p.replace(/\n/g, "<br/>")}</p>`)
      .join("\n");
  }

  // Append signature if set on the inbox
  if ((inbox as OutreachInbox).signature) {
    body += `<br/><br/>${(inbox as OutreachInbox).signature}`;
  }

  // Add a test banner so the recipient knows it's a test
  body += `<br/><p style="font-size:11px;color:#999;border-top:1px solid #eee;padding-top:10px;margin-top:16px">
    This is a test email sent from Leadash. It was not sent to any real leads.
  </p>`;

  const textBody = body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .trim();

  try {
    const typedInbox = inbox as OutreachInbox;
    if (typedInbox.provider === "gmail" && typedInbox.oauth_refresh_token) {
      await sendGmailMessage(typedInbox, { to: to_email, subject, htmlBody: body, textBody });
    } else if (typedInbox.provider === "outlook" && typedInbox.oauth_refresh_token) {
      await sendMicrosoftMessage(typedInbox, { to: to_email, subject, htmlBody: body, textBody });
    } else {
      await sendSmtpMessage(typedInbox, { to: to_email, subject, htmlBody: body, textBody });
    }

    return NextResponse.json({ ok: true, message: `Test email sent to ${to_email}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
