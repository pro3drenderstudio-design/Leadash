/**
 * Postal client — talks to the postal-agent service running on Hetzner.
 *
 * Replaces ses.ts for domain provisioning and SMTP credential management.
 * SES is still used for inbound email receiving (no changes there).
 *
 * Required env vars:
 *   POSTAL_AGENT_URL     — e.g. https://mail.yourdomain.com:3001
 *   POSTAL_AGENT_SECRET  — shared secret, must match AGENT_SECRET on the VPS
 *   POSTAL_SMTP_HOST     — Postal SMTP hostname (e.g. mail.yourdomain.com)
 */

import type { DnsRecord } from "./cloudflare";

/**
 * Connection details for a specific Postal node. When omitted (or its fields
 * are null), calls fall back to the default env agent — i.e. node 1. A second
 * node (separate VPS + IP) supplies its own agent URL/secret and mail host so
 * provisioning talks to the right Postal install.
 */
export interface PostalNodeConn {
  agentUrl?:    string | null;
  agentSecret?: string | null;
  smtpHost?:    string | null;
  serverId?:    number | null;  // postal_server_id within that node's Postal
  ipAddress?:   string | null;
}

function agentUrl(conn?: PostalNodeConn): string {
  const url = conn?.agentUrl ?? process.env.POSTAL_AGENT_URL;
  if (!url) throw new Error("POSTAL_AGENT_URL is not configured");
  return url.replace(/\/$/, "");
}

function agentSecret(conn?: PostalNodeConn): string {
  const s = conn?.agentSecret ?? process.env.POSTAL_AGENT_SECRET;
  if (!s) throw new Error("POSTAL_AGENT_SECRET is not configured");
  return s;
}

async function agentFetch<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  conn?: PostalNodeConn,
): Promise<T> {
  const res = await fetch(`${agentUrl(conn)}${path}`, {
    method,
    headers: {
      "Content-Type":   "application/json",
      "x-agent-secret": agentSecret(conn),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) ?? `Postal agent error ${res.status}`);
  return json as T;
}

// ─── Public API ───────────────────────────────────────────────────────────────

interface RegisterDomainResult {
  dkim_selector:   string;
  dkim_public_key: string;
  smtp_host:       string;
}

/**
 * Register a sending domain in Postal.
 * Generates a 2048-bit DKIM keypair and writes it to Postal's MariaDB.
 * Returns the DKIM public key (to be published as a TXT record in DNS).
 */
export async function registerDomain(domain: string, conn?: PostalNodeConn): Promise<RegisterDomainResult> {
  const res = await agentFetch<RegisterDomainResult & { already_exists?: boolean }>(
    "POST", "/domains", { domain }, conn,
  );
  if (res.already_exists) {
    // Already registered — fetch current config
    return await agentFetch<RegisterDomainResult>("GET", `/domains/${domain}`, undefined, conn);
  }
  return res;
}

/**
 * Check if the DKIM record for a domain has been published and propagated.
 * Uses Google DNS-over-HTTPS so the check works reliably from any Vercel region
 * without depending on the Lambda's local DNS resolver.
 */
export async function isDomainVerified(domain: string): Promise<boolean> {
  // Check both selector variants — "postal-1" is what buildPostalMailDnsRecords generates,
  // "postal" is the legacy selector used by some older Postal installs.
  const selectors = ["postal-1", "postal"];
  for (const selector of selectors) {
    try {
      const name = `${selector}._domainkey.${domain}`;
      const res  = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!res.ok) continue;
      const json = await res.json() as {
        Status: number;
        Answer?: Array<{ type: number; data: string }>;
      };
      if (json.Status !== 0 || !json.Answer) continue;
      if (json.Answer.some(r => r.type === 16 && r.data.includes("v=DKIM1"))) return true;
    } catch {
      continue;
    }
  }
  return false;
}

interface SmtpCredential {
  username: string;
  password: string;
}

/**
 * Create a per-mailbox SMTP credential in Postal.
 * Returns username + password to store in outreach_inboxes.
 */
export async function createSmtpCredential(
  _domain: string,
  login: string,
  conn?: PostalNodeConn,
): Promise<SmtpCredential> {
  // The credential name is the full email address — makes it easy to trace in Postal's UI
  return agentFetch<SmtpCredential>("POST", "/credentials", {
    name: login,
    ...(conn?.serverId ? { server_id: conn.serverId } : {}),
  }, conn);
}

/**
 * Remove an SMTP credential (e.g. when an inbox is deleted).
 */
export async function deleteSmtpCredential(login: string, conn?: PostalNodeConn): Promise<void> {
  await agentFetch<{ ok: boolean }>("DELETE", "/credentials", {
    name: login,
    ...(conn?.serverId ? { server_id: conn.serverId } : {}),
  }, conn);
}

/**
 * Create a catch-all inbound HTTP route for a domain in Postal.
 * All mail arriving at *@domain will be forwarded as JSON POST to webhookUrl.
 *
 * Agent endpoint to implement:
 *   POST /routes
 *   Body: { domain: string, webhook_url: string }
 *   Action: create (or upsert) a Postal HTTP endpoint route for the domain
 *           that forwards every inbound message to webhook_url with JSON:
 *           {
 *             to, from, from_name, subject,
 *             text, html, message_id,
 *             in_reply_to, references, x_ld_ref,
 *             received_at
 *           }
 *   Response: { ok: true }
 */
export async function createInboundRoute(domain: string, webhookUrl: string, conn?: PostalNodeConn): Promise<void> {
  await agentFetch<{ ok: boolean }>("POST", "/routes", {
    domain, webhook_url: webhookUrl,
    ...(conn?.serverId ? { server_id: conn.serverId } : {}),
  }, conn);
}

/**
 * Remove the inbound HTTP route for a domain (e.g. when the domain is deleted).
 *
 * Agent endpoint to implement:
 *   DELETE /routes
 *   Body: { domain: string }
 *   Action: remove the Postal HTTP endpoint route for the domain
 *   Response: { ok: true }
 */
export async function deleteInboundRoute(domain: string, conn?: PostalNodeConn): Promise<void> {
  await agentFetch<{ ok: boolean }>("DELETE", "/routes", {
    domain,
    ...(conn?.serverId ? { server_id: conn.serverId } : {}),
  }, conn);
}

interface SmtpSettings {
  host:      string;
  port:      number;
  imap_host: string | null;
  imap_port: number | null;
}

/**
 * Returns SMTP + IMAP connection settings for inboxes provisioned via Postal.
 * Postal handles both outbound (SMTP) and inbound (IMAP) mail.
 * Set POSTAL_IMAP_HOST to override; defaults to POSTAL_SMTP_HOST.
 */
export function getSmtpSettings(conn?: PostalNodeConn): SmtpSettings {
  const smtpHost = conn?.smtpHost ?? process.env.POSTAL_SMTP_HOST ?? "mail.yourdomain.com";
  const imapHost = process.env.POSTAL_IMAP_HOST ?? smtpHost;
  return {
    host:      smtpHost,
    port:      587,
    imap_host: imapHost,
    imap_port: 993,
  };
}
