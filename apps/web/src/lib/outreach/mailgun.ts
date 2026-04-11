/**
 * Mailgun REST API wrapper (plain fetch — no SDK).
 *
 * Docs: https://documentation.mailgun.com/docs/mailgun/api-reference/
 *
 * Required env vars:
 *   MAILGUN_API_KEY   — Mailgun private API key (key-...)
 *   MAILGUN_REGION    — "us" (default) or "eu"
 */

import type { DnsRecord } from "./porkbun";

function getBase(): string {
  return process.env.MAILGUN_REGION === "eu"
    ? "https://api.eu.mailgun.net"
    : "https://api.mailgun.net";
}

function authHeader(): string {
  const key = process.env.MAILGUN_API_KEY!;
  return "Basic " + Buffer.from(`api:${key}`).toString("base64");
}

async function mgFetch(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: URLSearchParams | Record<string, string>,
): Promise<unknown> {
  const url = `${getBase()}${path}`;
  const headers: Record<string, string> = { Authorization: authHeader() };

  let fetchBody: BodyInit | undefined;
  if (body instanceof URLSearchParams) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    fetchBody = body.toString();
  } else if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    fetchBody = new URLSearchParams(body).toString();
  }

  const res = await fetch(url, { method, headers, body: fetchBody });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { message?: string }).message ?? `Mailgun error ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MailgunDnsRecord {
  name:     string;
  type:     string;
  value:    string;
  valid:    string;
  priority?: string;
}

interface AddDomainResponse {
  domain: { name: string };
  sending_dns_records:   MailgunDnsRecord[];
  receiving_dns_records: MailgunDnsRecord[];
}

interface VerifyDomainResponse {
  domain: { state: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLeadashRecord(r: MailgunDnsRecord): DnsRecord {
  const type = r.type.toUpperCase() as DnsRecord["type"];
  return {
    type,
    name:     r.name,
    value:    r.value,
    priority: r.priority ? parseInt(r.priority, 10) : undefined,
    ttl:      1800,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register a new sending domain with Mailgun.
 * Returns the DNS records that need to be published to make it work.
 */
export async function addDomain(domain: string): Promise<{
  sendingRecords:   DnsRecord[];
  receivingRecords: DnsRecord[];
}> {
  const data = await mgFetch("POST", "/v3/domains", {
    name:           domain,
    smtp_password:  generatePassword(24), // Mailgun domain-level SMTP password (not per-mailbox)
    spam_action:    "disabled",
    wildcard:       "false",
    force_dkim_authority: "true",
    dkim_key_size:  "2048",
  }) as AddDomainResponse;

  return {
    sendingRecords:   (data.sending_dns_records   ?? []).map(toLeadashRecord),
    receivingRecords: (data.receiving_dns_records ?? []).map(toLeadashRecord),
  };
}

/**
 * Ask Mailgun to re-verify DNS records for a domain.
 * Returns true when the domain is active/verified.
 */
export async function verifyDomain(domain: string): Promise<{ valid: boolean }> {
  const data = await mgFetch("PUT", `/v3/domains/${domain}/verify`) as VerifyDomainResponse;
  return { valid: data.domain?.state === "active" };
}

/**
 * Create an SMTP credential (mailbox) for a domain.
 * login should be the local part only (e.g. "outreach1"), NOT the full address.
 */
export async function createSmtpCredential(
  domain: string,
  login: string,
  password: string,
): Promise<void> {
  await mgFetch("POST", `/v3/domains/${domain}/credentials`, {
    login,
    password,
  });
}

/**
 * Returns the SMTP settings for sending through Mailgun.
 */
export function getSmtpSettings(): { host: string; port: number; imapHost: string; imapPort: number } {
  return {
    host:     "smtp.mailgun.org",
    port:     587,
    imapHost: "imap.mailgun.org",
    imapPort: 993,
  };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

export function generatePassword(length = 24): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  const { randomBytes } = require("crypto") as typeof import("crypto");
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map(b => chars[b % chars.length])
    .join("");
}
