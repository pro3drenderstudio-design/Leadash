/**
 * Alert emails for admin infrastructure notifications.
 * Uses same transport (Postal HTTP API → Resend fallback) as notifications.ts.
 */
const FROM    = process.env.RESEND_FROM_EMAIL ?? process.env.POSTAL_FROM ?? "notifications@leadash.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";

async function sendEmail(opts: {
  to: string;
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
        from:    `Leadash <${FROM}>`,
        to:      [opts.to],
        subject: opts.subject,
        html:    opts.html,
        text:    opts.text,
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
    const res = await fetch(`https://${postalHost}/api/v1/send/message`, {
      method:  "POST",
      headers: { "X-Server-API-Key": postalApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:       `Leadash <${FROM}>`,
        to:         [opts.to],
        subject:    opts.subject,
        html_body:  opts.html,
        plain_body: opts.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Postal API error ${res.status}: ${body}`);
    }
    return;
  }

  throw new Error("No email transport configured: set RESEND_API_KEY or POSTAL_HOST + POSTAL_API_KEY");
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  warning:  "#f59e0b",
  info:     "#3b82f6",
};

const SEVERITY_BG: Record<string, string> = {
  critical: "#fef2f2",
  warning:  "#fffbeb",
  info:     "#eff6ff",
};

const SEVERITY_BORDER: Record<string, string> = {
  critical: "#fecaca",
  warning:  "#fde68a",
  info:     "#bfdbfe",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical Alert",
  warning:  "Warning",
  info:     "Info",
};

export async function sendAlertNotification(opts: {
  to: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body?: string;
  type: string;
  notificationId: string;
}): Promise<void> {
  const color  = SEVERITY_COLOR[opts.severity]  ?? "#6b7280";
  const bg     = SEVERITY_BG[opts.severity]     ?? "#f9fafb";
  const border = SEVERITY_BORDER[opts.severity] ?? "#e5e7eb";
  const label  = SEVERITY_LABEL[opts.severity]  ?? opts.severity;

  const typeLabel = opts.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  await sendEmail({
    to:      opts.to,
    subject: `[${label}] ${opts.title}`,
    text: [
      `${label}: ${opts.title}`,
      ``,
      `Type: ${typeLabel}`,
      ...(opts.body ? [``, opts.body] : []),
      ``,
      `View in admin: ${APP_URL}/admin/infrastructure`,
      `Manage alerts: ${APP_URL}/admin/notifications`,
    ].join("\n"),
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
        <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center">
          <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Leadash</span>
          <p style="color:${color};font-size:13px;font-weight:600;margin:8px 0 0;letter-spacing:0.5px;text-transform:uppercase">${label}</p>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:32px">
          <div style="background:${bg};border:1px solid ${border};border-left:4px solid ${color};border-radius:0 10px 10px 0;padding:16px 20px;margin-bottom:24px">
            <p style="margin:0 0 6px;font-weight:700;font-size:15px;color:#111">${opts.title}</p>
            ${opts.body ? `<p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6">${opts.body.replace(/\n/g, "<br>")}</p>` : ""}
          </div>
          <table style="font-size:13px;color:#6b7280;margin-bottom:24px;border-spacing:0">
            <tr>
              <td style="padding:3px 16px 3px 0;white-space:nowrap">Severity</td>
              <td style="padding:3px 0"><span style="background:${bg};border:1px solid ${border};color:${color};padding:2px 8px;border-radius:9999px;font-weight:600;font-size:12px">${opts.severity.toUpperCase()}</span></td>
            </tr>
            <tr>
              <td style="padding:3px 16px 3px 0;white-space:nowrap">Type</td>
              <td style="padding:3px 0">${typeLabel}</td>
            </tr>
          </table>
          <p>
            <a href="${APP_URL}/admin/infrastructure" style="display:inline-block;background:${color};color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin-right:10px">View Infrastructure →</a>
            <a href="${APP_URL}/admin/notifications" style="display:inline-block;background:#f3f4f6;color:#374151;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Manage Alerts</a>
          </p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
            — Leadash Infrastructure Monitor ·
            <a href="${APP_URL}/admin/notification-settings" style="color:#9ca3af">Manage settings</a>
          </p>
        </div>
      </div>
    `,
  });
}
