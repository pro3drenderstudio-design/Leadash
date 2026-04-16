/**
 * Transactional notification emails for support tickets and beta programme.
 * Uses Resend — requires RESEND_API_KEY and RESEND_FROM_EMAIL env vars.
 */

const FROM = process.env.RESEND_FROM_EMAIL ?? "notifications@leadash.io";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.io";

async function sendEmail(opts: {
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Leadash Support <${FROM}>`,
      to: [opts.to],
      reply_to: opts.replyTo,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

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
  await sendEmail({
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
      `View ticket: ${APP_URL}/admin/support/${opts.ticketId}`,
    ].join("\n"),
    html: `
      <p>New support ticket from <strong>${opts.userEmail}</strong></p>
      <table style="border-collapse:collapse;margin:16px 0;font-family:sans-serif;font-size:14px">
        <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Ticket</td><td><strong>#${opts.ticketNumber}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Category</td><td>${opts.category}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Priority</td><td>${opts.priority}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Subject</td><td>${opts.subject}</td></tr>
      </table>
      <div style="background:#f9fafb;border-left:3px solid #6366f1;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0;font-family:sans-serif;font-size:14px;color:#374151">
        ${opts.message.replace(/\n/g, "<br>")}
      </div>
      <p><a href="${APP_URL}/admin/support/${opts.ticketId}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-family:sans-serif;font-size:14px">View Ticket →</a></p>
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
  await sendEmail({
    to: opts.userEmail,
    replyTo: opts.supportEmail,
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
      `View your ticket and reply at: ${APP_URL}/support`,
      ``,
      `— Leadash Support`,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <p style="color:#374151;font-size:15px">Hi,</p>
        <p style="color:#374151;font-size:15px">Your support ticket has received a reply from the Leadash team.</p>
        <p style="color:#9ca3af;font-size:13px;margin-top:-8px">Ticket #${opts.ticketNumber} — ${opts.subject}</p>
        <div style="background:#f3f4f6;border-left:3px solid #3b82f6;padding:14px 18px;margin:20px 0;border-radius:0 8px 8px 0;font-size:14px;color:#374151;line-height:1.6">
          ${opts.adminReply.replace(/\n/g, "<br>")}
        </div>
        <p><a href="${APP_URL}/support" style="display:inline-block;background:#3b82f6;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View &amp; Reply →</a></p>
        <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
          — Leadash Support Team · <a href="mailto:${opts.supportEmail}" style="color:#9ca3af">${opts.supportEmail}</a>
        </p>
      </div>
    `,
  });
}
