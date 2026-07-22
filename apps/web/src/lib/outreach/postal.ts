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
 * Connection details for a specific Postal node. Omitted / null fields fall
 * back to the default env agent (node 1). A second node supplies its own agent
 * URL/secret + mail host so a domain provisioned there is managed on the right
 * Postal install. Load via loadNodeConn(db, postalNodeId).
 */
export interface PostalNodeConn {
  agentUrl?:    string | null;
  agentSecret?: string | null;
  smtpHost?:    string | null;
  serverId?:    number | null;
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
 * Pass postalServerId for dedicated-IP customers so the credential lands on
 * their dedicated server (not the shared one), ensuring mail routes via their IP.
 * Returns username + password to store in outreach_inboxes.
 */
export async function createSmtpCredential(
  _domain: string,
  login: string,
  conn?: PostalNodeConn,
): Promise<SmtpCredential> {
  return agentFetch<SmtpCredential>("POST", "/credentials", {
    name:      login,
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
    domain,
    webhook_url: webhookUrl,
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

// ── Dedicated IP pool management ─────────────────────────────────────────────

export interface IpPool {
  pool_id:    number;
  pool_name:  string;
  address:    string;
  server_id:  number;
}

/**
 * Create an IP pool in Postal with a dedicated server bound to it.
 * Returns the pool ID (used in URL params) and the server ID (used for
 * credentials and routes on dedicated-IP customers' domains).
 */
export async function createIpPool(
  name: string,
  ipAddress: string,
): Promise<{ poolId: number; serverId: number }> {
  const res = await agentFetch<{ pool_id: number; server_id: number }>(
    "POST", "/ip-pools", { name, ip_address: ipAddress },
  );
  return { poolId: res.pool_id, serverId: res.server_id };
}

/**
 * Register a domain on a dedicated Postal server (routes outbound mail via the
 * pool's IP). Returns the DKIM keys to use for this domain's DNS records.
 */
export async function assignDomainToPool(
  poolId: number | string,
  serverId: number,
  domain: string,
): Promise<{ dkimSelector: string; dkimPublicKey: string }> {
  const res = await agentFetch<{ ok: boolean; dkim_selector: string; dkim_public_key: string }>(
    "POST", `/ip-pools/${poolId}/domains`, { domain, server_id: serverId },
  );
  return { dkimSelector: res.dkim_selector, dkimPublicKey: res.dkim_public_key };
}

export async function removeDomainFromPool(
  poolId: number | string,
  serverId: number,
  domain: string,
): Promise<void> {
  await agentFetch<{ ok: boolean }>(
    "DELETE", `/ip-pools/${poolId}/domains`, { domain, server_id: serverId },
  );
}

export async function getIpPools(): Promise<IpPool[]> {
  return agentFetch<IpPool[]>("GET", "/ip-pools");
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

// ── Node resolution ──────────────────────────────────────────────────────────

type MinimalDb = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> };
    };
  };
};

/**
 * Resolve a domain's postal_node_id into a PostalNodeConn so credential/route
 * operations on that domain hit the SAME Postal node it was provisioned on.
 * Returns undefined for legacy domains (no node) or the default node with no
 * agent override — both correctly fall back to the env agent (node 1).
 */
export async function loadNodeConn(db: MinimalDb, postalNodeId: string | null | undefined): Promise<PostalNodeConn | undefined> {
  if (!postalNodeId) return undefined;
  const { data } = await db
    .from("postal_nodes")
    .select("ip_address, postal_server_id, agent_url, agent_secret, smtp_host")
    .eq("id", postalNodeId)
    .maybeSingle();
  if (!data) return undefined;
  // No agent override + no smtp host = the default node; env agent is correct.
  if (!data.agent_url && !data.smtp_host && !data.postal_server_id) return undefined;
  return {
    agentUrl:    (data.agent_url    as string | null) ?? null,
    agentSecret: (data.agent_secret as string | null) ?? null,
    smtpHost:    (data.smtp_host    as string | null) ?? null,
    serverId:    (data.postal_server_id as number | null) ?? null,
    ipAddress:   (data.ip_address   as string | null) ?? null,
  };
}
