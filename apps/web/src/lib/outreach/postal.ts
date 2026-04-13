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

function agentUrl(): string {
  const url = process.env.POSTAL_AGENT_URL;
  if (!url) throw new Error("POSTAL_AGENT_URL is not configured");
  return url.replace(/\/$/, "");
}

function agentSecret(): string {
  const s = process.env.POSTAL_AGENT_SECRET;
  if (!s) throw new Error("POSTAL_AGENT_SECRET is not configured");
  return s;
}

async function agentFetch<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${agentUrl()}${path}`, {
    method,
    headers: {
      "Content-Type":   "application/json",
      "x-agent-secret": agentSecret(),
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
export async function registerDomain(domain: string): Promise<RegisterDomainResult> {
  const res = await agentFetch<RegisterDomainResult & { already_exists?: boolean }>(
    "POST", "/domains", { domain },
  );
  if (res.already_exists) {
    // Already registered — fetch current config
    return await agentFetch<RegisterDomainResult>("GET", `/domains/${domain}`);
  }
  return res;
}

/**
 * Check if the DKIM record for a domain has been published and propagated.
 * We verify by resolving the DKIM TXT record from DNS.
 */
export async function isDomainVerified(domain: string): Promise<boolean> {
  try {
    const { resolveTxt } = await import("dns/promises");
    const selector = "postal";
    const records = await resolveTxt(`${selector}._domainkey.${domain}`);
    // Check if any TXT record contains a DKIM key fragment
    return records.some(r => r.join("").includes("v=DKIM1"));
  } catch {
    return false;
  }
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
): Promise<SmtpCredential> {
  // The credential name is the full email address — makes it easy to trace in Postal's UI
  return agentFetch<SmtpCredential>("POST", "/credentials", { name: login });
}

/**
 * Remove an SMTP credential (e.g. when an inbox is deleted).
 */
export async function deleteSmtpCredential(login: string): Promise<void> {
  await agentFetch<{ ok: boolean }>("DELETE", "/credentials", { name: login });
}

interface SmtpSettings {
  host:      string;
  port:      number;
  imap_host: string | null;
  imap_port: number | null;
}

/**
 * Returns SMTP connection settings for inboxes provisioned via Postal.
 * IMAP is null — reply detection is handled by SES inbound (unchanged).
 */
export function getSmtpSettings(): SmtpSettings {
  return {
    host:      process.env.POSTAL_SMTP_HOST ?? "mail.yourdomain.com",
    port:      587,
    imap_host: null,
    imap_port: null,
  };
}
