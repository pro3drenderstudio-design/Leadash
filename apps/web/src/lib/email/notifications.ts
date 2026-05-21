/**
 * Transactional notification emails for support tickets and beta programme.
 * Primary: Resend API (reliable from Vercel serverless).
 * Fallback: Postal HTTP API on VPS (if POSTAL_HOST + POSTAL_API_KEY are set).
 */
const FROM    = process.env.RESEND_FROM_EMAIL ?? process.env.POSTAL_FROM ?? "notifications@leadash.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";

// Always CC'd on admin-facing alerts (tickets, provisioning, domain purchase)
const OWNER_EMAIL = process.env.OWNER_ALERT_EMAIL ?? "leadash.official@gmail.com";

async function sendEmail(opts: {
  to: string;
  cc?: string[];
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
      signal:  AbortSignal.timeout(8000),
      body: JSON.stringify({
        from:     `Leadash <${FROM}>`,
        to:       [opts.to],
        cc:       opts.cc?.length ? opts.cc : undefined,
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
    if (opts.cc?.length) payload.cc = opts.cc;

    const res = await fetch(`https://${postalHost}/api/v1/send/message`, {
      method:  "POST",
      headers: { "X-Server-API-Key": postalApiKey, "Content-Type": "application/json" },
      signal:  AbortSignal.timeout(8000),
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
  // Always CC OWNER_EMAIL so every ticket reaches leadash.official@gmail.com
  const cc = opts.adminEmail !== OWNER_EMAIL ? [OWNER_EMAIL] : [];
  await sendEmail({
    to: opts.adminEmail,
    cc: cc.length ? cc : undefined,
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

// ─── Admin: manual domain purchase required ───────────────────────────────────

export async function sendAdminDomainPurchaseRequired(opts: {
  adminEmail: string;
  domain:     string;
  domainId:   string;
  priceUsd:   number;
  workspaceId: string;
}): Promise<void> {
  const adminUrl = `${APP_URL}/admin/domains?search=${encodeURIComponent(opts.domain)}`;
  const cc = opts.adminEmail !== OWNER_EMAIL ? [OWNER_EMAIL] : [];
  await sendEmail({
    to:      opts.adminEmail,
    cc:      cc.length ? cc : undefined,
    subject: `[Action Required] Manual domain purchase: ${opts.domain}`,
    text: [
      `A user paid for a domain that needs to be manually registered on Porkbun.`,
      ``,
      `Domain:    ${opts.domain}`,
      `Price:     $${opts.priceUsd}`,
      `Workspace: ${opts.workspaceId}`,
      ``,
      `Steps:`,
      `1. Register ${opts.domain} on porkbun.com`,
      `2. Go to ${adminUrl}`,
      `3. Click "Mark Purchased" — this will continue provisioning automatically`,
    ].join("\n"),
    html: `
      <p>A user paid for a domain that needs to be manually registered on Porkbun.</p>
      <table style="border-collapse:collapse;margin:16px 0;font-size:14px;font-family:sans-serif">
        <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Domain</td><td><strong>${opts.domain}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Price</td><td>$${opts.priceUsd}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Workspace</td><td>${opts.workspaceId}</td></tr>
      </table>
      <ol style="font-family:sans-serif;font-size:14px">
        <li>Register <strong>${opts.domain}</strong> on <a href="https://porkbun.com">porkbun.com</a></li>
        <li>Return to the <a href="${adminUrl}">admin domains page</a></li>
        <li>Click <strong>"Mark Purchased"</strong> — provisioning continues automatically</li>
      </ol>
      <p><a href="${adminUrl}" style="display:inline-block;background:#f97316;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-family:sans-serif;font-size:14px">Open Admin Panel →</a></p>
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

// ─── Subscription / billing lifecycle reminders ──────────────────────────────

export async function sendTrialExpiryReminder(opts: {
  userEmail: string;
  workspaceName: string;
  daysLeft: number;   // 3, 2, or 1
  trialEndsAt: string;
  isBeta: boolean;
}): Promise<void> {
  const { userEmail, workspaceName, daysLeft, trialEndsAt, isBeta } = opts;
  const endDate = new Date(trialEndsAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
  const label   = isBeta ? "beta access" : "free trial";
  const plural  = daysLeft === 1 ? "day" : "days";

  await sendEmail({
    to: userEmail,
    subject: `Your ${label} expires in ${daysLeft} ${plural} — upgrade to keep access`,
    text: [
      `Hi,`,
      ``,
      `Your ${label} for ${workspaceName} expires on ${endDate} (${daysLeft} ${plural} left).`,
      ``,
      `After expiry, campaigns and inbox warmup will be paused and you won't be able to discover new leads.`,
      ``,
      `Upgrade now to keep everything running:`,
      `${APP_URL}/settings?tab=billing`,
      ``,
      `— The Leadash Team`,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
        <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center">
          <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</span>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px 20px;margin-bottom:24px;display:flex;align-items:center;gap:12px">
            <span style="font-size:24px">⏰</span>
            <div>
              <p style="margin:0;font-weight:700;color:#9a3412;font-size:15px">${daysLeft} ${plural} left on your ${label}</p>
              <p style="margin:4px 0 0;color:#c2410c;font-size:13px">Expires ${endDate}</p>
            </div>
          </div>
          <p style="margin-top:0">Hi,</p>
          <p style="color:#6b7280">Your ${label} for <strong style="color:#111">${workspaceName}</strong> is ending soon. After expiry:</p>
          <ul style="color:#6b7280;font-size:14px;line-height:1.8;padding-left:20px">
            <li>Active campaigns will be <strong style="color:#374151">paused</strong></li>
            <li>Inbox warmup will <strong style="color:#374151">stop</strong></li>
            <li>Lead discovery will be <strong style="color:#374151">disabled</strong></li>
          </ul>
          <p style="color:#6b7280">Upgrade now to keep everything running without interruption.</p>
          <p><a href="${APP_URL}/settings?tab=billing" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Upgrade Plan →</a></p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">— The Leadash Team</p>
        </div>
      </div>
    `,
  });
}

export async function sendTrialExpiredEmail(opts: {
  userEmail: string;
  workspaceName: string;
  isBeta: boolean;
}): Promise<void> {
  const { userEmail, workspaceName, isBeta } = opts;
  const label = isBeta ? "beta access" : "free trial";

  await sendEmail({
    to: userEmail,
    subject: `Your ${label} has ended — upgrade to reactivate`,
    text: [
      `Hi,`,
      ``,
      `Your ${label} for ${workspaceName} has now expired.`,
      ``,
      `Your campaigns have been paused and warmup has stopped. Your data is safe and waiting.`,
      ``,
      `Upgrade to reactivate everything instantly:`,
      `${APP_URL}/settings?tab=billing`,
      ``,
      `— The Leadash Team`,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
        <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center">
          <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</span>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;margin-bottom:24px">
            <p style="margin:0;font-weight:700;color:#991b1b;font-size:15px">Your ${label} has ended</p>
            <p style="margin:4px 0 0;color:#b91c1c;font-size:13px">All campaigns and warmup have been paused</p>
          </div>
          <p style="margin-top:0">Hi,</p>
          <p style="color:#6b7280">Your ${label} for <strong style="color:#111">${workspaceName}</strong> has expired. Don't worry — your data is safe.</p>
          <p style="color:#6b7280">Upgrade to reactivate your campaigns, warmup, and lead discovery instantly.</p>
          <p><a href="${APP_URL}/settings?tab=billing" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Reactivate Now →</a></p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">— The Leadash Team</p>
        </div>
      </div>
    `,
  });
}

export async function sendSubscriptionRenewalReminder(opts: {
  userEmail: string;
  workspaceName: string;
  planName: string;
  daysLeft: number;
  renewsAt: string;
}): Promise<void> {
  const { userEmail, workspaceName, planName, daysLeft, renewsAt } = opts;
  const renewDate = new Date(renewsAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
  const plural    = daysLeft === 1 ? "day" : "days";

  await sendEmail({
    to: userEmail,
    subject: `Your ${planName} plan renews in ${daysLeft} ${plural}`,
    text: [
      `Hi,`,
      ``,
      `Just a heads-up — your ${planName} subscription for ${workspaceName} renews on ${renewDate}.`,
      ``,
      `No action needed if your payment method is up to date.`,
      ``,
      `Manage billing: ${APP_URL}/settings?tab=billing`,
      ``,
      `— The Leadash Team`,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
        <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center">
          <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</span>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
          <p style="font-size:16px;font-weight:600;color:#111;margin-top:0">Subscription renewing soon</p>
          <p style="color:#6b7280">Your <strong style="color:#111">${planName}</strong> plan for <strong style="color:#111">${workspaceName}</strong> will renew on <strong style="color:#111">${renewDate}</strong> (${daysLeft} ${plural} from now).</p>
          <p style="color:#6b7280;font-size:14px">No action is needed — we'll charge your saved payment method automatically.</p>
          <p><a href="${APP_URL}/settings?tab=billing" style="display:inline-block;background:#374151;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Manage Billing →</a></p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">— The Leadash Team</p>
        </div>
      </div>
    `,
  });
}

export async function sendGracePeriodWarning(opts: {
  userEmail: string;
  workspaceName: string;
  graceEndsAt: string;
}): Promise<void> {
  const { userEmail, workspaceName, graceEndsAt } = opts;
  const graceDate = new Date(graceEndsAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
  const msLeft    = new Date(graceEndsAt).getTime() - Date.now();
  const daysLeft  = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

  await sendEmail({
    to: userEmail,
    subject: `Action required — payment issue on your Leadash account`,
    text: [
      `Hi,`,
      ``,
      `We had trouble processing your latest payment for ${workspaceName}.`,
      ``,
      `Your account is in a grace period until ${graceDate} (${daysLeft} day${daysLeft !== 1 ? "s" : ""} left). After this date, your account will be downgraded to the free plan and all campaigns will be paused.`,
      ``,
      `Please update your payment method immediately:`,
      `${APP_URL}/settings?tab=billing`,
      ``,
      `— The Leadash Team`,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
        <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center">
          <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</span>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;margin-bottom:24px">
            <p style="margin:0;font-weight:700;color:#991b1b;font-size:15px">⚠️ Payment issue — action required</p>
            <p style="margin:4px 0 0;color:#b91c1c;font-size:13px">Grace period ends ${graceDate}</p>
          </div>
          <p style="margin-top:0">Hi,</p>
          <p style="color:#6b7280">We were unable to process a payment for <strong style="color:#111">${workspaceName}</strong>. Your account will be downgraded to the free plan if payment is not resolved by <strong style="color:#111">${graceDate}</strong>.</p>
          <ul style="color:#6b7280;font-size:14px;line-height:1.8;padding-left:20px">
            <li>All active campaigns will be <strong style="color:#374151">paused</strong></li>
            <li>Subscription credits will <strong style="color:#374151">expire</strong></li>
            <li>Inbox warmup will <strong style="color:#374151">stop</strong></li>
          </ul>
          <p><a href="${APP_URL}/settings?tab=billing" style="display:inline-block;background:#ef4444;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Update Payment Now →</a></p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">— The Leadash Team</p>
        </div>
      </div>
    `,
  });
}

export async function sendDowngradeNotification(opts: {
  userEmail: string;
  workspaceName: string;
  reason: "grace_period_expired" | "trial_expired";
}): Promise<void> {
  const { userEmail, workspaceName, reason } = opts;
  const isGrace = reason === "grace_period_expired";
  const subject = isGrace
    ? "Your Leadash account has been downgraded to Free"
    : "Your trial has ended — account downgraded to Free";

  await sendEmail({
    to: userEmail,
    subject,
    text: [
      `Hi,`,
      ``,
      isGrace
        ? `Your Leadash account (${workspaceName}) has been downgraded to the free plan because your grace period ended without a successful payment.`
        : `Your free trial for ${workspaceName} has ended and your account has been moved to the free plan.`,
      ``,
      `Your campaigns have been paused and subscription credits have expired. Your purchased credits and data are safe.`,
      ``,
      `Upgrade anytime to reactivate:`,
      `${APP_URL}/settings?tab=billing`,
      ``,
      `— The Leadash Team`,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
        <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center">
          <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</span>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
          <p style="font-size:16px;font-weight:600;color:#111;margin-top:0">Account downgraded to Free plan</p>
          <p style="color:#6b7280">
            ${isGrace
              ? `Your grace period ended without a successful payment, so <strong style="color:#111">${workspaceName}</strong> has been moved to the free plan.`
              : `Your trial for <strong style="color:#111">${workspaceName}</strong> has ended and your account is now on the free plan.`
            }
          </p>
          <ul style="color:#6b7280;font-size:14px;line-height:1.8;padding-left:20px">
            <li>Campaigns have been <strong style="color:#374151">paused</strong></li>
            <li>Subscription credits have <strong style="color:#374151">expired</strong></li>
            <li>Your data and purchased credits are <strong style="color:#16a34a">safe</strong></li>
          </ul>
          <p><a href="${APP_URL}/settings?tab=billing" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Upgrade to Reactivate →</a></p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">— The Leadash Team</p>
        </div>
      </div>
    `,
  });
}

// ─── Inbox billing ────────────────────────────────────────────────────────────

export async function sendInboxRenewalReminder(opts: {
  userEmail: string;
  domain: string;
  amountNgn: number;
  renewsAt: string;
  daysLeft: number;
}): Promise<void> {
  const { userEmail, domain, amountNgn, renewsAt, daysLeft } = opts;
  const formatted  = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amountNgn);
  const renewDate  = new Date(renewsAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
  const plural     = daysLeft === 1 ? "day" : "days";

  await sendEmail({
    to: userEmail,
    subject: `Your inbox domain ${domain} renews in ${daysLeft} ${plural}`,
    text: [
      `Hi,`,
      ``,
      `Just a heads-up — your inbox domain ${domain} renews on ${renewDate} (${daysLeft} ${plural}).`,
      ``,
      `Amount: ${formatted}`,
      ``,
      `Make sure your payment card is up to date to avoid service interruption:`,
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
          <p style="font-size:15px;font-weight:600;color:#111;margin-top:0">Inbox domain renewing in ${daysLeft} ${plural}</p>
          <p style="color:#6b7280">Your inbox domain <strong style="color:#111">${domain}</strong> renews on <strong style="color:#111">${renewDate}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin:20px 0">
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:10px 0;color:#9ca3af">Domain</td>
              <td style="padding:10px 0;color:#111;font-weight:600;text-align:right">${domain}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#9ca3af">Renewal amount</td>
              <td style="padding:10px 0;color:#111;font-weight:600;text-align:right">${formatted}</td>
            </tr>
          </table>
          <p style="color:#6b7280;font-size:14px">No action needed if your payment method is up to date.</p>
          <p><a href="${APP_URL}/inboxes" style="display:inline-block;background:#374151;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Manage Inboxes →</a></p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">— The Leadash Team</p>
        </div>
      </div>
    `,
  });
}

export async function sendInboxSuspendedEmail(opts: {
  userEmail: string;
  domain: string;
  amountNgn: number;
}): Promise<void> {
  const { userEmail, domain, amountNgn } = opts;
  const formatted = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amountNgn);

  await sendEmail({
    to: userEmail,
    subject: `Your inbox domain ${domain} has been suspended`,
    text: [
      `Hi,`,
      ``,
      `Your inbox domain ${domain} has been suspended after 3 failed payment attempts.`,
      ``,
      `Amount due: ${formatted}`,
      ``,
      `Please update your payment method to reactivate your domain and inboxes:`,
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
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;margin-bottom:24px">
            <p style="margin:0;font-weight:700;color:#991b1b;font-size:15px">⛔ Inbox domain suspended</p>
            <p style="margin:4px 0 0;color:#b91c1c;font-size:13px">3 consecutive payment failures</p>
          </div>
          <p style="margin-top:0">Hi,</p>
          <p style="color:#6b7280">Your inbox domain <strong style="color:#111">${domain}</strong> has been suspended after 3 failed payment attempts. Sending from inboxes on this domain is now paused.</p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin-bottom:24px;font-size:14px">
            <p style="margin:0 0 4px;color:#9ca3af">Amount due</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:#111">${formatted}</p>
          </div>
          <p><a href="${APP_URL}/inboxes" style="display:inline-block;background:#ef4444;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Update Payment to Reactivate →</a></p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">— The Leadash Team</p>
        </div>
      </div>
    `,
  });
}

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

export async function sendWelcomeEmail(opts: {
  userEmail: string;
  userName: string | null;
}): Promise<void> {
  const name = opts.userName ?? opts.userEmail.split("@")[0];

  await sendEmail({
    to: opts.userEmail,
    subject: "Welcome to Leadash — let's get you started",
    text: [
      `Hi ${name},`,
      ``,
      `Welcome to Leadash! Your account is active and ready to go.`,
      ``,
      `Here's what you can do right now:`,
      `• Discover leads — search our database of 700M+ people and companies`,
      `• Connect inboxes — add your email accounts for outreach`,
      `• Launch campaigns — build automated email sequences`,
      ``,
      `Get started: ${APP_URL}/dashboard`,
      ``,
      `If you have any questions, reply to this email or visit ${APP_URL}/support.`,
      ``,
      `— The Leadash Team`,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
        <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:32px 32px 24px;border-radius:16px 16px 0 0;text-align:center">
          <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</span>
          <p style="color:#f97316;font-size:13px;font-weight:600;margin:10px 0 0">Welcome aboard!</p>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
          <p style="font-size:16px;margin-top:0">Hi ${name},</p>
          <p style="color:#6b7280">Your Leadash account is live. Here's what you can do to hit the ground running:</p>
          <div style="margin:24px 0">
            <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">
              <div style="width:32px;height:32px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">🔍</div>
              <div><p style="margin:0;font-weight:600;color:#111;font-size:14px">Discover leads</p><p style="margin:4px 0 0;color:#6b7280;font-size:13px">Search 700M+ verified contacts and companies</p></div>
            </div>
            <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">
              <div style="width:32px;height:32px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">📬</div>
              <div><p style="margin:0;font-weight:600;color:#111;font-size:14px">Connect inboxes</p><p style="margin:4px 0 0;color:#6b7280;font-size:13px">Add Gmail, Outlook, or custom SMTP accounts</p></div>
            </div>
            <div style="display:flex;align-items:flex-start;gap:12px">
              <div style="width:32px;height:32px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">🚀</div>
              <div><p style="margin:0;font-weight:600;color:#111;font-size:14px">Launch campaigns</p><p style="margin:4px 0 0;color:#6b7280;font-size:13px">Build multi-step automated email sequences</p></div>
            </div>
          </div>
          <p><a href="${APP_URL}/dashboard" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Go to Dashboard →</a></p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">Questions? Reply to this email or visit <a href="${APP_URL}/support" style="color:#f97316">${APP_URL}/support</a> — The Leadash Team</p>
        </div>
      </div>
    `,
  });
}

export async function sendCancellationConfirmationEmail(opts: {
  userEmail: string;
  workspaceName: string;
  planName: string;
}): Promise<void> {
  const { userEmail, workspaceName, planName } = opts;

  await sendEmail({
    to: userEmail,
    subject: "Your Leadash subscription has been cancelled",
    text: [
      `Hi,`,
      ``,
      `We've confirmed the cancellation of your ${planName} subscription for ${workspaceName}.`,
      ``,
      `Your plan will remain active until the end of the current billing period. After that, your account will be moved to the free plan.`,
      ``,
      `Your data, contacts, and purchased credits are safe and will remain accessible on the free plan.`,
      ``,
      `If you change your mind, you can resubscribe anytime:`,
      `${APP_URL}/settings?tab=billing`,
      ``,
      `— The Leadash Team`,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
        <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center">
          <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</span>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
          <p style="font-size:16px;font-weight:600;color:#111;margin-top:0">Subscription cancelled</p>
          <p style="color:#6b7280">Your <strong style="color:#111">${planName}</strong> subscription for <strong style="color:#111">${workspaceName}</strong> has been cancelled.</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin:24px 0;font-size:14px;color:#6b7280">
            <p style="margin:0 0 8px;font-weight:600;color:#374151">What happens next</p>
            <ul style="margin:0;padding-left:20px;line-height:1.8">
              <li>Your plan stays active until the end of the current billing period</li>
              <li>After that, your account moves to the <strong style="color:#374151">free plan</strong></li>
              <li>Your data and purchased credits are <strong style="color:#16a34a">safe</strong></li>
            </ul>
          </div>
          <p style="color:#6b7280;font-size:14px">Changed your mind? You can resubscribe anytime — no setup required.</p>
          <p><a href="${APP_URL}/settings?tab=billing" style="display:inline-block;background:#374151;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Resubscribe →</a></p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">— The Leadash Team</p>
        </div>
      </div>
    `,
  });
}

// ─── Microsoft inbox provisioning ────────────────────────────────────────────

export async function sendMicrosoftProvisioningAlert(opts: {
  domain:         string;
  inboxCount:     number;
  inboxEmails:    string[];
  workspaceId:    string;
  workspaceEmail: string;
  orderedAt:      string;
}): Promise<void> {
  const vendorUrl  = `${APP_URL}/vendor`;
  const adminUrl   = `${APP_URL}/admin/domains?filter=ms_pending`;
  const ordered    = new Date(opts.orderedAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
  const inboxList  = opts.inboxEmails.map(e => `• ${e}`).join("\n");
  const inboxHtml  = opts.inboxEmails.map(e => `<li style="padding:2px 0">${e}</li>`).join("");

  await sendEmail({
    to:      OWNER_EMAIL,
    subject: `[Leadash] New Microsoft Inbox Order — ${opts.domain}`,
    text: [
      `New Microsoft 365 inbox order received.`,
      ``,
      `Domain:    ${opts.domain}`,
      `Inboxes:   ${opts.inboxCount}`,
      `Ordered:   ${ordered}`,
      `Workspace: ${opts.workspaceId} (${opts.workspaceEmail})`,
      ``,
      `Inbox addresses to provision:`,
      inboxList,
      ``,
      `Vendor portal: ${vendorUrl}`,
      `Admin panel:   ${adminUrl}`,
    ].join("\n"),
    html: `
      <p style="font-family:sans-serif">New Microsoft 365 inbox order received and awaiting vendor provisioning.</p>
      <table style="border-collapse:collapse;margin:16px 0;font-size:14px;font-family:sans-serif">
        <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Domain</td><td><strong>${opts.domain}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Inboxes</td><td>${opts.inboxCount}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Ordered</td><td>${ordered}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6b7280">Workspace</td><td>${opts.workspaceId}<br><span style="color:#9ca3af">${opts.workspaceEmail}</span></td></tr>
      </table>
      <p style="font-family:sans-serif;font-size:14px;font-weight:600;margin-bottom:6px">Inbox addresses to provision:</p>
      <ul style="font-family:sans-serif;font-size:14px;margin:0 0 16px;padding-left:20px;color:#374151">
        ${inboxHtml}
      </ul>
      <p>
        <a href="${vendorUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-family:sans-serif;font-size:14px;margin-right:8px">Open Vendor Portal →</a>
        <a href="${adminUrl}" style="display:inline-block;background:#374151;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-family:sans-serif;font-size:14px">Admin Panel →</a>
      </p>
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

export async function sendVendorCancellationAlert(opts: {
  domain:      string;
  inboxEmails: string[];
  reason:      string;
}) {
  const vendorEmail = process.env.VENDOR_ALERT_EMAIL ?? "vendor@example.com";
  const subject     = `[Leadash] Inbox Subscription Cancelled — ${opts.domain}`;
  const inboxList   = opts.inboxEmails.map(e => `<li style="font-family:monospace;font-size:13px">${e}</li>`).join("");
  const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
  <div style="background:#1c1917;padding:20px 28px;border-radius:12px 12px 0 0">
    <span style="font-size:18px;font-weight:800;color:#fff">Leadash</span>
    <p style="color:#9ca3af;font-size:12px;margin:4px 0 0">Vendor Notification</p>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px">
    <p style="font-size:15px;font-weight:700;margin:0 0 4px;color:#dc2626">Subscription Cancelled</p>
    <p style="color:#6b7280;font-size:14px;margin:0 0 16px">The following Microsoft 365 inboxes have been cancelled on <strong>${opts.domain}</strong>:</p>
    <ul style="margin:0 0 16px;padding-left:20px;line-height:2">${inboxList}</ul>
    <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;font-size:13px;color:#991b1b;margin:0 0 16px">
      Reason: ${opts.reason}
    </p>
    <p style="font-size:13px;color:#6b7280;margin:0">
      Please deactivate these mailboxes in your Microsoft 365 tenant. No further billing will occur for these inboxes.
    </p>
  </div>
</div>`;
  const text = [`Inbox Cancellation: ${opts.domain}`, `Reason: ${opts.reason}`, ``, ...opts.inboxEmails].join("\n");
  await sendEmail({ to: vendorEmail, subject, html, text });
}
