/**
 * Transactional notification emails for support tickets.
 * Uses AWS SES SMTP credentials (same setup as outreach).
 * Requires: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, NOTIFY_FROM_EMAIL
 */

import nodemailer from "nodemailer";
import { getSmtpCredentials } from "@/lib/outreach/ses";

function createTransporter() {
  const smtp = getSmtpCredentials();
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.username, pass: smtp.password },
  });
}

const FROM = process.env.NOTIFY_FROM_EMAIL ?? "noreply@leadash.io";

export async function sendAdminNewTicketNotification(opts: {
  adminEmail: string;
  ticketNumber: number;
  subject: string;
  message: string;
  userEmail: string;
  category: string;
  priority: string;
  ticketId: string;
}): Promise<void> {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `Leadash Support <${FROM}>`,
    to: opts.adminEmail,
    subject: `[New Ticket #${opts.ticketNumber}] ${opts.subject}`,
    text: [
      `New support ticket from ${opts.userEmail}`,
      ``,
      `Ticket: #${opts.ticketNumber}`,
      `Category: ${opts.category}`,
      `Priority: ${opts.priority}`,
      `Subject: ${opts.subject}`,
      ``,
      `Message:`,
      opts.message,
      ``,
      `View ticket: ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/support/${opts.ticketId}`,
    ].join("\n"),
    html: `
      <p>New support ticket from <strong>${opts.userEmail}</strong></p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Ticket</td><td><strong>#${opts.ticketNumber}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Category</td><td>${opts.category}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Priority</td><td>${opts.priority}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Subject</td><td>${opts.subject}</td></tr>
      </table>
      <p style="color:#374151">${opts.message.replace(/\n/g, "<br>")}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/support/${opts.ticketId}" style="background:#3b82f6;color:#fff;padding:8px 20px;border-radius:8px;text-decoration:none;font-weight:600">View Ticket</a></p>
    `,
  });
}

export async function sendUserReplyNotification(opts: {
  userEmail: string;
  ticketNumber: number;
  subject: string;
  adminReply: string;
  supportEmail: string;
}): Promise<void> {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `Leadash Support <${FROM}>`,
    replyTo: opts.supportEmail,
    to: opts.userEmail,
    subject: `Re: [Ticket #${opts.ticketNumber}] ${opts.subject}`,
    text: [
      `Hi,`,
      ``,
      `Your support ticket has received a reply from the Leadash team.`,
      ``,
      `Subject: ${opts.subject}`,
      ``,
      `Reply:`,
      opts.adminReply,
      ``,
      `You can view your ticket and reply at: ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/support`,
      ``,
      `— Leadash Support`,
    ].join("\n"),
    html: `
      <p>Hi,</p>
      <p>Your support ticket has received a reply from the Leadash team.</p>
      <p style="color:#6b7280;font-size:13px">Ticket #${opts.ticketNumber} — ${opts.subject}</p>
      <div style="background:#f3f4f6;border-left:3px solid #3b82f6;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0">
        <p style="margin:0;color:#374151">${opts.adminReply.replace(/\n/g, "<br>")}</p>
      </div>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/support" style="background:#3b82f6;color:#fff;padding:8px 20px;border-radius:8px;text-decoration:none;font-weight:600">View &amp; Reply</a></p>
      <p style="color:#9ca3af;font-size:12px">— Leadash Support Team</p>
    `,
  });
}
