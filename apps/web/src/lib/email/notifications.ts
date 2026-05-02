/**
 * Transactional notification emails for support tickets and beta programme.
 * Primary: Resend API (reliable from Vercel serverless).
 * Fallback: Postal HTTP API on VPS (if POSTAL_HOST + POSTAL_API_KEY are set).
 */
const FROM    = process.env.RESEND_FROM_EMAIL ?? process.env.POSTAL_FROM ?? "notifications@leadash.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";

async function sendEmail(opts: {
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  // ── Primary: Resend API ───────────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:     `Leadash <${FROM}>`,
        to:       [opts.to],
        reply_to: opts.replyTo,
        subject:  opts.subject,
        html:     opts.html,
        text:     opts.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend error ${res.status}: ${body}`);
    }
    return;
  }

  // ── Fallback: Postal HTTP API ─────────────────────────────────────────────
  const postalHost   = process.env.POSTAL_HOST ?? process.env.SMTP_HOST;
  const postalApiKey = process.env.POSTAL_API_KEY;
  if (postalHost && postalApiKey) {
    const payload: Record<string, unknown> = {
      from:       `Leadash <${FROM}>`,
      to:         [opts.to],
      subject:    opts.subject,
      html_body:  opts.html,
      plain_body: opts.text,
    };
    if (opts.replyTo) payload.reply_to = opts.replyTo;

    const res = await fetch(`https://${postalHost}/api/v1/send/message`, {
      method:  "POST",
      headers: { "X-Server-API-Key": postalApiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Postal API error ${res.status}: ${body}`);
    }
    return;
  }

  throw new Error("No email transport configured: set RESEND_API_KEY or POSTAL_HOST + POSTAL_API_KEY");
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

// ─── Beta programme ───────────────────────────────────────────────────────────

export async function sendBetaApplicationConfirmation(opts: {
  userEmail: string;
  userName: string | null;
}): Promise<void> {
  const name = opts.userName ?? "there";
  await sendEmail({
    to: opts.userEmail,
    subject: "Your Leadash Beta application is received!",
    text: [
      `Hi ${name},`,
      ``,
      `Thanks for applying to the Leadash Beta Programme!`,
      ``,
      `We review applications manually and will get back to you within 24 hours.`,
      ``,
      `What you'll get if approved:`,
      `• 1 month free Starter plan access`,
      `• 500 lead credits to get started`,
      `• Early access to new features`,
      `• Priority support from the founding team`,
      ``,
      `You can check the status of your application at any time:`,
      `${APP_URL}/beta`,
      ``,
      `— The Leadash Team`,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
        <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:32px 32px 24px;border-radius:16px 16px 0 0;text-align:center">
          <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:16px">
            <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</span>
            <span style="font-size:9px;font-weight:700;text-transform:uppercase;background:rgba(249,115,22,0.15);color:#fb923c;border:1px solid rgba(249,115,22,0.25);padding:2px 6px;border-radius:4px;letter-spacing:0.5px">Beta</span>
          </div>
          <p style="color:#fb923c;font-size:13px;font-weight:600;margin:0">Application Received</p>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
          <p style="font-size:16px;margin-top:0">Hi ${name},</p>
          <p style="color:#6b7280">Thanks for applying to the <strong style="color:#374151">Leadash Beta Programme!</strong> We review every application manually and will get back to you within 24 hours.</p>
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:20px;margin:24px 0">
            <p style="margin:0 0 12px;font-weight:600;color:#9a3412;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">What you get if approved</p>
            <table style="font-size:14px;color:#374151;border-spacing:0">
              <tr><td style="padding:4px 0">🚀</td><td style="padding:4px 0 4px 10px"><strong>1 month free Starter plan</strong></td></tr>
              <tr><td style="padding:4px 0">✨</td><td style="padding:4px 0 4px 10px"><strong>500 lead credits</strong> to get started</td></tr>
              <tr><td style="padding:4px 0">🔬</td><td style="padding:4px 0 4px 10px">Early access to new features</td></tr>
              <tr><td style="padding:4px 0">💬</td><td style="padding:4px 0 4px 10px">Priority support from the founding team</td></tr>
            </table>
          </div>
          <p style="color:#6b7280;font-size:14px">You can check your application status anytime:</p>
          <p><a href="${APP_URL}/beta" style="display:inline-block;background:#f97316;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View Application Status →</a></p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">— The Leadash Team</p>
        </div>
      </div>
    `,
  });
}

export async function sendBetaAdminNotification(opts: {
  adminEmail: string;
  userName: string | null;
  userEmail: string;
  reason: string | null;
  enrollmentId: string;
}): Promise<void> {
  const name = opts.userName ?? opts.userEmail;
  await sendEmail({
    to: opts.adminEmail,
    subject: `[Beta] New application from ${name}`,
    text: [
      `New beta programme application`,
      ``,
      `Name: ${opts.userName ?? "(not provided)"}`,
      `Email: ${opts.userEmail}`,
      `Reason: ${opts.reason ?? "(not provided)"}`,
      ``,
      `Review: ${APP_URL}/admin/beta`,
    ].join("\n"),
    html: `
      <p>New beta programme application from <strong>${name}</strong> (${opts.userEmail})</p>
      ${opts.reason ? `<div style="background:#f9fafb;border-left:3px solid #f97316;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0;font-family:sans-serif;font-size:14px;color:#374151">${opts.reason.replace(/\n/g, "<br>")}</div>` : ""}
      <p><a href="${APP_URL}/admin/beta" style="display:inline-block;background:#f97316;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-family:sans-serif;font-size:14px">Review Application →</a></p>
    `,
  });
}

export async function sendBetaDecisionEmail(opts: {
  userEmail: string;
  userName: string | null;
  approved: boolean;
  reviewNote: string | null;
  needsSignup?: boolean;
}): Promise<void> {
  const name = opts.userName ?? "there";
  const signupUrl = `${APP_URL}/signup?email=${encodeURIComponent(opts.userEmail)}&beta=1`;

  if (opts.approved) {
    const ctaUrl  = opts.needsSignup ? signupUrl : `${APP_URL}/dashboard`;
    const ctaText = opts.needsSignup ? "Create Your Account →" : "Go to Dashboard →";
    const upgradeNote = opts.needsSignup
      ? "Once you create your account your Starter plan and 500 credits will be applied automatically."
      : "Your account has been upgraded to the Starter plan for 1 month and you've been credited 500 lead credits.";

    await sendEmail({
      to: opts.userEmail,
      subject: "You're in! Welcome to the Leadash Beta",
      text: [
        `Hi ${name},`,
        ``,
        `Great news — your Leadash Beta application has been approved!`,
        ``,
        upgradeNote,
        ``,
        opts.needsSignup ? `Create your account (use this email address):` : `Go to your dashboard to get started:`,
        ctaUrl,
        ``,
        `— The Leadash Team`,
      ].join("\n"),
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
          <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:32px 32px 24px;border-radius:16px 16px 0 0;text-align:center">
            <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:16px">
              <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</span>
              <span style="font-size:9px;font-weight:700;text-transform:uppercase;background:rgba(249,115,22,0.15);color:#fb923c;border:1px solid rgba(249,115,22,0.25);padding:2px 6px;border-radius:4px;letter-spacing:0.5px">Beta</span>
            </div>
            <div style="width:48px;height:48px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
              <span style="font-size:22px">🎉</span>
            </div>
            <p style="color:#4ade80;font-size:14px;font-weight:700;margin:0">You're approved!</p>
          </div>
          <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
            <p style="font-size:16px;margin-top:0">Hi ${name},</p>
            <p>Your Leadash Beta application has been <strong style="color:#16a34a">approved!</strong> Welcome aboard.</p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:24px 0">
              <p style="margin:0 0 12px;font-weight:600;color:#15803d;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">
                ${opts.needsSignup ? "What you get" : "Your account has been upgraded"}
              </p>
              <table style="font-size:14px;color:#374151;border-spacing:0">
                <tr><td style="padding:4px 0">✅</td><td style="padding:4px 0 4px 10px">Starter plan free for <strong>30 days</strong></td></tr>
                <tr><td style="padding:4px 0">💳</td><td style="padding:4px 0 4px 10px"><strong>500 lead credits</strong> on us</td></tr>
              </table>
            </div>
            ${opts.needsSignup ? `
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:#9a3412">
              <strong>Important:</strong> Sign up using <strong>${opts.userEmail}</strong> so your benefits are applied automatically.
            </div>` : ""}
            <p><a href="${ctaUrl}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${ctaText}</a></p>
            <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">— The Leadash Team</p>
          </div>
        </div>
      `,
    });
  } else {
    await sendEmail({
      to: opts.userEmail,
      subject: "Update on your Leadash Beta application",
      text: [
        `Hi ${name},`,
        ``,
        `Thanks for your interest in the Leadash Beta Programme.`,
        ``,
        `Unfortunately, we weren't able to accept your application at this time. We received more applications than expected and had to be selective.`,
        ``,
        opts.reviewNote ? `Note from our team: ${opts.reviewNote}` : `We hope to open more spots in future rounds.`,
        ``,
        `You can still use Leadash on the free plan:`,
        `${APP_URL}/dashboard`,
        ``,
        `— The Leadash Team`,
      ].join("\n"),
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
          <div style="background:#f9fafb;padding:32px;border-radius:16px 16px 0 0;text-align:center">
            <span style="font-size:22px;font-weight:800;color:#111;letter-spacing:-0.5px">Leadash</span>
          </div>
          <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
            <p style="font-size:16px;margin-top:0">Hi ${name},</p>
            <p>Thanks for applying to the Leadash Beta Programme. After reviewing your application, we weren't able to accept it for this round — we received more applications than expected and had to be selective.</p>
            ${opts.reviewNote ? `<div style="background:#fef2f2;border-left:3px solid #fca5a5;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0;font-size:14px;color:#7f1d1d">${opts.reviewNote}</div>` : `<p style="color:#6b7280">We hope to open more spots in future rounds.</p>`}
            <p>You can still use Leadash on the free plan:</p>
            <p><a href="${APP_URL}/dashboard" style="display:inline-block;background:#374151;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Go to Dashboard →</a></p>
            <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">— The Leadash Team</p>
          </div>
        </div>
      `,
    });
  }
}

// ─── Admin-created ticket notification (sent to the user) ─────────────────────

// If a dedicated inbound subdomain is configured (e.g. reply.leadash.com),
// reply-to addresses use that domain so Resend can receive the email.
// Falls back to the main support email domain if not set.
function buildReplyTo(supportEmail: string, ticketId: string): string {
  const inboundDomain = process.env.SUPPORT_INBOUND_DOMAIN;
  const base = inboundDomain && supportEmail.includes("@")
    ? supportEmail.replace(/@[^@]+$/, `@${inboundDomain}`)
    : supportEmail;
  return base.includes("@")
    ? base.replace(/^([^@]+)@/, `$1+ticket-${ticketId}@`)
    : base;
}

export async function sendAdminCreatedTicketNotification(opts: {
  userEmail: string;
  ticketNumber: number;
  subject: string;
  message: string;
  supportEmail: string;
  ticketId: string;
}): Promise<void> {
  const replyTo = buildReplyTo(opts.supportEmail, opts.ticketId);

  await sendEmail({
    to: opts.userEmail,
    replyTo,
    subject: `[Ticket #${opts.ticketNumber}] ${opts.subject}`,
    text: [
      `Hi,`,
      ``,
      `Our support team has opened a ticket on your behalf.`,
      ``,
      `Subject: ${opts.subject}`,
      ``,
      opts.message,
      ``,
      `You can reply to this email to respond, or view the full conversation at:`,
      `${APP_URL}/support`,
      ``,
      `— Leadash Support`,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <p style="color:#374151;font-size:15px">Hi,</p>
        <p style="color:#374151;font-size:15px">Our support team has opened a ticket on your behalf.</p>
        <p style="color:#9ca3af;font-size:13px;margin-top:-8px">Ticket #${opts.ticketNumber} — ${opts.subject}</p>
        <div style="background:#f3f4f6;border-left:3px solid #f97316;padding:14px 18px;margin:20px 0;border-radius:0 8px 8px 0;font-size:14px;color:#374151;line-height:1.6">
          ${opts.message.replace(/\n/g, "<br>")}
        </div>
        <p style="color:#6b7280;font-size:14px">You can <strong>reply to this email</strong> to respond, or view the full conversation online:</p>
        <p><a href="${APP_URL}/support" style="display:inline-block;background:#f97316;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View Ticket →</a></p>
        <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
          — Leadash Support Team · <a href="mailto:${opts.supportEmail}" style="color:#9ca3af">${opts.supportEmail}</a>
        </p>
      </div>
    `,
  });
}

export async function sendUserReplyNotification(opts: {
  userEmail: string;
  ticketNumber: number;
  subject: string;
  adminReply: string;
  supportEmail: string;
  ticketId?: string;
}): Promise<void> {
  const replyTo = opts.ticketId
    ? buildReplyTo(opts.supportEmail, opts.ticketId)
    : opts.supportEmail;

  await sendEmail({
    to: opts.userEmail,
    replyTo,
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

// ─── Inbox billing ────────────────────────────────────────────────────────────

export async function sendInboxPaymentSuccess(opts: {
  userEmail: string;
  domain: string;
  amountNgn: number;
  nextBillingDate: string;
}): Promise<void> {
  const { userEmail, domain, amountNgn, nextBillingDate } = opts;
  const formatted = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amountNgn);
  const nextDate  = new Date(nextBillingDate).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });

  await sendEmail({
    to: userEmail,
    subject: `Payment confirmed — ${domain} renewed`,
    text: [
      `Hi,`,
      ``,
      `Your monthly renewal for ${domain} was successful.`,
      ``,
      `Amount charged: ${formatted}`,
      `Next billing date: ${nextDate}`,
      ``,
      `Manage your inboxes at: ${APP_URL}/inboxes`,
      ``,
      `— The Leadash Team`,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
        <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center">
          <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</span>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
          <p style="font-size:16px;font-weight:600;color:#111;margin-top:0">✅ Payment confirmed</p>
          <p style="color:#6b7280;margin-bottom:24px">Your inbox domain <strong style="color:#111">${domain}</strong> has been renewed successfully.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:10px 0;color:#9ca3af">Domain</td>
              <td style="padding:10px 0;color:#111;font-weight:600;text-align:right">${domain}</td>
            </tr>
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:10px 0;color:#9ca3af">Amount charged</td>
              <td style="padding:10px 0;color:#111;font-weight:600;text-align:right">${formatted}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#9ca3af">Next billing date</td>
              <td style="padding:10px 0;color:#111;text-align:right">${nextDate}</td>
            </tr>
          </table>
          <p><a href="${APP_URL}/inboxes" style="display:inline-block;background:#f97316;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Manage Inboxes →</a></p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">— The Leadash Team</p>
        </div>
      </div>
    `,
  });
}

export async function sendInboxPaymentFailed(opts: {
  userEmail: string;
  domain: string;
  amountNgn: number;
  errorMessage: string;
}): Promise<void> {
  const { userEmail, domain, amountNgn, errorMessage } = opts;
  const formatted = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amountNgn);

  await sendEmail({
    to: userEmail,
    subject: `Action required — renewal failed for ${domain}`,
    text: [
      `Hi,`,
      ``,
      `We were unable to charge your card for the renewal of ${domain}.`,
      ``,
      `Amount: ${formatted}`,
      `Reason: ${errorMessage}`,
      ``,
      `Please update your payment method to avoid service interruption.`,
      ``,
      `${APP_URL}/inboxes`,
      ``,
      `— The Leadash Team`,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
        <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center">
          <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</span>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
          <p style="font-size:16px;font-weight:600;color:#111;margin-top:0">⚠️ Payment failed</p>
          <p style="color:#6b7280;margin-bottom:24px">We couldn't renew <strong style="color:#111">${domain}</strong>. Please update your payment details to avoid interruption.</p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin-bottom:24px;font-size:14px">
            <p style="margin:0 0 6px;color:#9ca3af">Amount due</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:#111">${formatted}</p>
            ${errorMessage ? `<p style="margin:12px 0 0;color:#ef4444;font-size:13px">${errorMessage}</p>` : ""}
          </div>
          <p><a href="${APP_URL}/inboxes" style="display:inline-block;background:#ef4444;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Update Payment →</a></p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">— The Leadash Team</p>
        </div>
      </div>
    `,
  });
}
