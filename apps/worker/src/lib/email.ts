const FROM    = process.env.RESEND_FROM_EMAIL ?? process.env.POSTAL_FROM ?? "notifications@leadash.com";
const APP_URL = process.env.APP_URL ?? "https://leadash.com";

async function sendEmail(opts: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      signal:  AbortSignal.timeout(8000),
      body: JSON.stringify({ from: `Leadash <${FROM}>`, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return;
  }
  const postalHost = process.env.POSTAL_HOST;
  const postalKey  = process.env.POSTAL_API_KEY;
  if (postalHost && postalKey) {
    const res = await fetch(`https://${postalHost}/api/v1/send/message`, {
      method:  "POST",
      headers: { "X-Server-API-Key": postalKey, "Content-Type": "application/json" },
      signal:  AbortSignal.timeout(8000),
      body: JSON.stringify({ from: `Leadash <${FROM}>`, to: [opts.to], subject: opts.subject, html_body: opts.html, plain_body: opts.text }),
    });
    if (!res.ok) throw new Error(`Postal ${res.status}: ${await res.text()}`);
    return;
  }
  console.error("[email] No transport configured (RESEND_API_KEY or POSTAL_HOST+POSTAL_API_KEY)");
}

export async function notifyAdminDomainPurchaseRequired(opts: {
  domain:     string;
  domainId:   string;
  priceUsd:   number;
  workspaceId: string;
}): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.warn("[provision] ADMIN_EMAIL not set — skipping admin notification for", opts.domain);
    return;
  }
  const adminUrl = `${APP_URL}/admin/domains?search=${encodeURIComponent(opts.domain)}`;
  await sendEmail({
    to:      adminEmail,
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
      `3. Click "Mark Purchased" — provisioning continues automatically`,
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
