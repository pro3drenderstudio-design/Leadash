import nodemailer from "nodemailer";
import { decrypt } from "./crypto";
import type { OutreachInbox } from "@/types/outreach";

export interface SmtpSendOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  fromName?: string;
  messageId?: string;
  inReplyToMessageId?: string;
  replyToThreadId?: string;
  customHeaders?: Record<string, string>;
}

export interface SmtpSendResult {
  messageId: string;
}

/**
 * Creates a nodemailer transporter from inbox SMTP credentials.
 * The stored password is AES-encrypted — decrypted at call time only.
 */
function createTransport(inbox: OutreachInbox) {
  const pass = inbox.smtp_pass_encrypted ? decrypt(inbox.smtp_pass_encrypted) : "";
  return nodemailer.createTransport({
    host: inbox.smtp_host!,
    port: inbox.smtp_port ?? 587,
    secure: (inbox.smtp_port ?? 587) === 465,
    auth: {
      user: inbox.smtp_user!,
      pass,
    },
    tls: { rejectUnauthorized: false },
  });
}

export async function sendSmtpMessage(
  inbox: OutreachInbox,
  opts: SmtpSendOptions,
): Promise<SmtpSendResult> {
  const transport = createTransport(inbox);

  const from = opts.fromName
    ? `"${opts.fromName}" <${inbox.email_address}>`
    : inbox.email_address;

  const info = await transport.sendMail({
    from,
    to:        opts.to,
    subject:   opts.subject,
    html:      opts.htmlBody,
    text:      opts.textBody,
    messageId: opts.messageId,
    ...(opts.inReplyToMessageId ? { inReplyTo: opts.inReplyToMessageId, references: opts.inReplyToMessageId } : {}),
    ...(opts.customHeaders ? { headers: opts.customHeaders } : {}),
  });

  return { messageId: info.messageId ?? "" };
}

/**
 * Verify SMTP credentials are valid (used when adding a new inbox).
 */
export async function verifySmtpCredentials(inbox: OutreachInbox): Promise<boolean> {
  try {
    const transport = createTransport(inbox);
    await transport.verify();
    return true;
  } catch {
    return false;
  }
}
