import { createHmac } from "crypto";
import type { OutreachLead, OutreachSend } from "@/types/outreach";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://proplanstudio.com";
const UNSUB_SECRET = process.env.OUTREACH_ENCRYPTION_KEY ?? "fallback-secret";

// ─── Variable Interpolation ───────────────────────────────────────────────────

/**
 * Replaces {{variable}} tokens in a template string with lead data.
 * Supported: {{first_name}}, {{last_name}}, {{email}}, {{company}}, {{title}},
 *            {{website}}, {{custom:field_name}}
 */
export function interpolate(template: string, lead: OutreachLead): string {
  return template
    .replace(/\{\{first_name\}\}/gi, lead.first_name ?? "")
    .replace(/\{\{last_name\}\}/gi, lead.last_name ?? "")
    .replace(/\{\{email\}\}/gi, lead.email)
    .replace(/\{\{company\}\}/gi, lead.company ?? "")
    .replace(/\{\{title\}\}/gi, lead.title ?? "")
    .replace(/\{\{website\}\}/gi, lead.website ?? "")
    .replace(/\{\{full_name\}\}/gi, [lead.first_name, lead.last_name].filter(Boolean).join(" "))
    .replace(/\{\{custom:([^}]+)\}\}/gi, (_, key) => lead.custom_fields?.[key] ?? "");
}

// ─── Unsubscribe Link ─────────────────────────────────────────────────────────

export function generateUnsubscribeToken(email: string): string {
  return createHmac("sha256", UNSUB_SECRET).update(email.toLowerCase()).digest("hex").slice(0, 32);
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = generateUnsubscribeToken(email);
  // Timing-safe compare
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}

function buildUnsubscribeUrl(email: string): string {
  const token = generateUnsubscribeToken(email);
  return `${APP_URL}/api/outreach/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

// ─── Open Tracking Pixel ──────────────────────────────────────────────────────

function buildTrackingPixel(sendId: string): string {
  return `<img src="${APP_URL}/api/track/open/${sendId}" width="1" height="1" style="display:none" alt="" />`;
}

// ─── Click Tracking ───────────────────────────────────────────────────────────

/**
 * Replaces all <a href="..."> links in the HTML body with tracked redirect URLs.
 * Returns the modified body and a list of { link_index, original_url } for storage.
 */
export function wrapLinks(
  html: string,
  sendId: string,
): { body: string; trackedLinks: { link_index: number; original_url: string }[] } {
  const trackedLinks: { link_index: number; original_url: string }[] = [];
  let index = 0;

  const body = html.replace(/href="(https?:\/\/[^"]+)"/gi, (_, url: string) => {
    // Skip unsubscribe links — don't double-wrap
    if (url.includes("/api/outreach/unsubscribe")) return `href="${url}"`;
    trackedLinks.push({ link_index: index, original_url: url });
    const tracked = `${APP_URL}/api/track/click/${sendId}/${index}`;
    index++;
    return `href="${tracked}"`;
  });

  return { body, trackedLinks };
}

// ─── Full Email Builder ───────────────────────────────────────────────────────

export interface RenderedEmail {
  subject: string;
  /** HTML body with pixel + tracked links + unsubscribe footer already injected */
  body: string;
  /** Plain-text version (stripped HTML) */
  textBody: string;
  trackedLinks: { link_index: number; original_url: string }[];
}

export function renderEmail(opts: {
  subjectTemplate: string;
  bodyTemplate: string;
  lead: OutreachLead;
  sendId: string;
  signature?: string | null;
  trackOpens: boolean;
  trackClicks: boolean;
  physicalAddress?: string;
  footerEnabled?: boolean;
  footerText?: string;
}): RenderedEmail {
  const { subjectTemplate, bodyTemplate, lead, sendId, signature, trackOpens, trackClicks, physicalAddress, footerEnabled = true, footerText } = opts;

  const subject = interpolate(subjectTemplate, lead);
  let body = interpolate(bodyTemplate, lead);

  // Append signature if present
  if (signature) {
    body += `\n\n<br/><br/>${signature}`;
  }

  // Wrap plain-text line breaks as HTML paragraphs if no HTML tags found
  if (!/<[a-z][\s\S]*>/i.test(body)) {
    body = body
      .split(/\n\n+/)
      .map((p) => `<p style="margin:0 0 14px 0">${p.replace(/\n/g, "<br/>")}</p>`)
      .join("\n");
  }

  // Unsubscribe footer (CAN-SPAM required — always include unsubscribe link)
  const unsubUrl = buildUnsubscribeUrl(lead.email);
  const address = physicalAddress ?? "123 Main Street, New York, NY 10001";
  const footerBodyText = footerText ?? "You received this email because you or your company expressed interest in our services.";
  if (footerEnabled !== false) {
    body += `
<br/><br/>
<p style="font-size:11px;color:#999;margin:24px 0 0 0;border-top:1px solid #eee;padding-top:12px">
  ${footerBodyText}<br/>
  <a href="${unsubUrl}" style="color:#999">Unsubscribe</a> &nbsp;|&nbsp; ${address}
</p>`;
  } else {
    // Even when footer is disabled, keep a minimal unsubscribe link for CAN-SPAM compliance
    body += `<br/><p style="font-size:10px;color:#bbb;margin:16px 0 0 0"><a href="${unsubUrl}" style="color:#bbb">Unsubscribe</a></p>`;
  }

  // Click tracking
  let trackedLinks: { link_index: number; original_url: string }[] = [];
  if (trackClicks) {
    const result = wrapLinks(body, sendId);
    body = result.body;
    trackedLinks = result.trackedLinks;
  }

  // Open pixel (appended last so it doesn't interfere with link indices)
  if (trackOpens) {
    body += buildTrackingPixel(sendId);
  }

  // Plain text (strip HTML tags)
  const textBody = body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();

  return { subject, body, textBody, trackedLinks };
}
