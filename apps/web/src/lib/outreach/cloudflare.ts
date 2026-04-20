/**
 * Cloudflare DNS API wrapper.
 *
 * Used to publish SPF, DKIM, DMARC, and MX records for purchased domains.
 * Docs: https://developers.cloudflare.com/api/
 *
 * Required env vars:
 *   CLOUDFLARE_API_TOKEN  — API token with Zone:DNS:Edit permission
 *   CLOUDFLARE_ZONE_ID    — Zone ID for the domain (found in Cloudflare dashboard)
 *
 * NOTE: This assumes domains are registered via Namecheap but their nameservers
 * are pointed to Cloudflare (or Namecheap DNS is used directly).
 * For Namecheap DNS, use the namecheap.ts setDnsHosts() instead.
 * This module is used when Cloudflare manages the DNS zone.
 */

export interface DnsRecord {
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT";
  name: string;   // subdomain or "@" for root
  value: string;
  priority?: number; // MX only
  ttl?: number;
}

const CF_BASE = "https://api.cloudflare.com/client/v4";

function authHeaders(): Record<string, string> {
  return {
    Authorization:  `Bearer ${process.env.CLOUDFLARE_API_TOKEN!}`,
    "Content-Type": "application/json",
  };
}

async function cfFetch<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${CF_BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as { success: boolean; errors: { message: string; code?: number }[]; result: T };
  if (!json.success) {
    const err = json.errors?.[0];
    throw new Error(`CF ${method} ${path}: ${err?.message ?? "Unknown error"}${err?.code ? ` (code ${err.code})` : ""}`);
  }
  return json.result;
}

/**
 * Add a domain as a new zone in Cloudflare.
 * Requires CLOUDFLARE_ACCOUNT_ID env var.
 * Returns the zone ID and the Cloudflare nameservers to set at the registrar.
 */
export async function addZone(domain: string): Promise<{ zoneId: string; nameservers: string[] }> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID is not configured");

  // Always try to look up existing zone first to avoid duplicate zone errors
  const existingZones = await cfFetch<{ id: string; name_servers: string[] }[]>(
    "GET", `/zones?name=${encodeURIComponent(domain)}&account.id=${accountId}`,
  ).catch(() => null);

  if (existingZones?.length) {
    return { zoneId: existingZones[0].id, nameservers: existingZones[0].name_servers };
  }

  try {
    const result = await cfFetch<{ id: string; name_servers: string[] }>("POST", "/zones", {
      name:       domain,
      account:    { id: accountId },
      jump_start: false,
      type:       "full",
    });
    return { zoneId: result.id, nameservers: result.name_servers };
  } catch (err) {
    // Zone already exists under this or another account — fetch existing
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("already exists") || msg.includes("1061") || msg.includes("already been taken")) {
      // Try without account filter in case zone is registered under a different account
      const zones = await cfFetch<{ id: string; name_servers: string[] }[]>(
        "GET", `/zones?name=${encodeURIComponent(domain)}&account.id=${accountId}`,
      ).catch(() => [] as { id: string; name_servers: string[] }[]);
      if (zones?.length) {
        return { zoneId: zones[0].id, nameservers: zones[0].name_servers };
      }
    }
    throw err;
  }
}

/**
 * Get the Cloudflare Zone ID for a domain.
 * If CLOUDFLARE_ZONE_ID is set, uses that directly.
 * Otherwise looks up by domain name.
 */
export async function getZoneId(domain: string): Promise<string> {
  if (process.env.CLOUDFLARE_ZONE_ID) return process.env.CLOUDFLARE_ZONE_ID;

  // Extract apex domain (e.g. "sub.example.com" -> "example.com")
  const parts = domain.split(".");
  const apex  = parts.slice(-2).join(".");

  // Don't filter by status=active — newly created zones start as "pending"
  const zones = await cfFetch<{ id: string; name: string }[]>("GET", `/zones?name=${apex}`);
  if (!zones?.length) throw new Error(`No Cloudflare zone found for ${apex}`);
  return zones[0].id;
}

/**
 * Delete all existing DNS records of the given types for a domain,
 * then create the new records. This ensures a clean slate.
 */
export async function publishDnsRecords(domain: string, records: DnsRecord[]): Promise<void> {
  const zoneId = await getZoneId(domain);

  // Fetch existing records to avoid duplicates
  const existing = await cfFetch<{ id: string; type: string; name: string }[]>(
    "GET",
    `/zones/${zoneId}/dns_records?per_page=100`,
  );

  const typesToManage = new Set(records.map(r => r.type));
  const apexName = domain + ".";

  // Delete existing records of same types that belong to this domain
  for (const rec of existing ?? []) {
    if (!typesToManage.has(rec.type as DnsRecord["type"])) continue;
    const recName = rec.name.endsWith(".") ? rec.name : rec.name + ".";
    if (recName !== apexName && !recName.endsWith("." + apexName)) continue;
    await cfFetch("DELETE", `/zones/${zoneId}/dns_records/${rec.id}`).catch(() => {});
  }

  // Create new records
  for (const rec of records) {
    const name = rec.name === "@" ? domain : `${rec.name}.${domain}`;
    await cfFetch("POST", `/zones/${zoneId}/dns_records`, {
      type:     rec.type,
      name,
      content:  rec.value,
      ttl:      rec.ttl ?? 1,   // 1 = automatic in Cloudflare
      priority: rec.priority,
      proxied:  false,           // DNS-only — mail records must NOT be proxied
    });
  }
}

/**
 * Set up a permanent 301 redirect for all traffic on the domain's root.
 * Adds a proxied A record (required for Cloudflare to intercept HTTP requests)
 * and creates/replaces a Redirect Rule in the zone's ruleset.
 *
 * redirectUrl example: "https://mycompany.com"
 */
export async function setWebRedirect(domain: string, redirectUrl: string): Promise<void> {
  const zoneId = await getZoneId(domain);

  // 1. Ensure there's a proxied A record for @ so Cloudflare can intercept web traffic.
  //    192.0.2.1 is a documentation/dummy IP — Cloudflare proxies it before it reaches any real server.
  const existing = await cfFetch<{ id: string; type: string; name: string; proxied?: boolean }[]>(
    "GET",
    `/zones/${zoneId}/dns_records?type=A&per_page=100`,
  );
  const apexA = (existing ?? []).find(r => r.name === domain || r.name === `${domain}.`);
  if (!apexA) {
    await cfFetch("POST", `/zones/${zoneId}/dns_records`, {
      type:    "A",
      name:    domain,
      content: "192.0.2.1",
      ttl:     1,
      proxied: true,
    });
  } else if (!apexA.proxied) {
    await cfFetch("PUT", `/zones/${zoneId}/dns_records/${apexA.id}`, {
      type:    "A",
      name:    domain,
      content: "192.0.2.1",
      ttl:     1,
      proxied: true,
    });
  }

  // 2. Create/replace redirect ruleset for the zone.
  //    Uses the http_request_dynamic_redirect phase (replaces deprecated Page Rules).
  await cfFetch("PUT", `/zones/${zoneId}/rulesets/phases/http_request_dynamic_redirect/entrypoint`, {
    rules: [
      {
        description: `Redirect ${domain} to ${redirectUrl}`,
        expression:  "true",
        action:      "redirect",
        action_parameters: {
          from_value: {
            status_code:           301,
            target_url:            { value: redirectUrl },
            preserve_query_string: true,
          },
        },
        enabled: true,
      },
    ],
  });
}

/**
 * Configure Cloudflare Email Routing to forward all email on the domain
 * to the specified address. Cloudflare will send a one-time verification
 * email to the destination address if it hasn't been verified before.
 *
 * This replaces the SES inbound MX record with Cloudflare's email routing MX records.
 * Outbound email continues to use SES SMTP — only inbound routing changes.
 */
export async function setEmailForwarding(domain: string, forwardTo: string): Promise<void> {
  const zoneId = await getZoneId(domain);

  // Enable email routing on the zone (idempotent)
  await cfFetch("POST", `/zones/${zoneId}/email/routing/enable`, {}).catch(() => {
    // Already enabled — ignore "already enabled" errors
  });

  // Add the destination address (Cloudflare will email them a verification link)
  await cfFetch("POST", `/zones/${zoneId}/email/routing/addresses`, {
    email: forwardTo,
  }).catch(() => {
    // Ignore "already exists" errors — destination may already be verified
  });

  // Replace the existing catch-all rule (or create one)
  const existingRules = await cfFetch<{ id?: string; matchers: { type: string }[] }[]>(
    "GET",
    `/zones/${zoneId}/email/routing/rules`,
  ).catch(() => [] as { id?: string; matchers: { type: string }[] }[]);

  const catchAll = (existingRules ?? []).find(r => r.matchers?.some(m => m.type === "all"));

  const ruleBody = {
    name:     "Forward all replies",
    enabled:  true,
    matchers: [{ type: "all" }],
    actions:  [{ type: "forward", value: [forwardTo] }],
  };

  if (catchAll?.id) {
    await cfFetch("PUT", `/zones/${zoneId}/email/routing/rules/${catchAll.id}`, ruleBody);
  } else {
    await cfFetch("POST", `/zones/${zoneId}/email/routing/rules`, ruleBody);
  }

  // Update MX records to point to Cloudflare Email Routing instead of SES inbound.
  // SES outbound (SMTP) is unaffected — only inbound routing changes.
  const allRecords = await cfFetch<{ id: string; type: string }[]>(
    "GET",
    `/zones/${zoneId}/dns_records?type=MX&per_page=100`,
  );
  for (const r of allRecords ?? []) {
    await cfFetch("DELETE", `/zones/${zoneId}/dns_records/${r.id}`);
  }

  const cfEmailMx = [
    { name: "route1.mx.cloudflare.net", priority: 16 },
    { name: "route2.mx.cloudflare.net", priority: 20 },
    { name: "route3.mx.cloudflare.net", priority: 23 },
  ];
  for (const mx of cfEmailMx) {
    await cfFetch("POST", `/zones/${zoneId}/dns_records`, {
      type:     "MX",
      name:     domain,
      content:  mx.name,
      priority: mx.priority,
      ttl:      1,
      proxied:  false,
    });
  }
}

/**
 * Build mail DNS records for a domain provisioned via Postal (self-hosted SMTP + inbound).
 * - SPF: authorises the Postal VPS IP
 * - DKIM: single TXT record with Postal-generated public key (selector "postal-1")
 * - DMARC: quarantine policy
 * - MX: points to Postal server for inbound reply detection
 *
 * postalIp: the public IPv4 of the Postal VPS (used in SPF)
 * dkimPublicKey: base64 RSA public key returned by postal-agent
 */
export function buildPostalMailDnsRecords(
  domain: string,
  postalIp: string,
  dkimPublicKey: string,
): DnsRecord[] {
  // MX hostname: use POSTAL_MX_HOST if set, otherwise fall back to POSTAL_SMTP_HOST, then the IP directly
  const mxHost = process.env.POSTAL_MX_HOST ?? process.env.POSTAL_SMTP_HOST ?? postalIp;
  return [
    // SPF — authorise Postal VPS IP
    {
      type:  "TXT",
      name:  "@",
      value: `v=spf1 ip4:${postalIp} ~all`,
    },
    // DKIM — Postal signing key, selector "postal-1"
    {
      type:  "TXT",
      name:  "postal-1._domainkey",
      value: `v=DKIM1; k=rsa; p=${dkimPublicKey}`,
    },
    // DMARC
    {
      type:  "TXT",
      name:  "_dmarc",
      value: `v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain}; pct=100`,
    },
    // MX — Postal handles inbound replies
    {
      type:     "MX",
      name:     "@",
      value:    mxHost,
      priority: 10,
    },
  ];
}

/**
 * Build the standard set of mail DNS records for a domain + SES DKIM tokens.
 * sesDkimTokens: array of 3 tokens returned by AWS SES verifyDomainDkim()
 */
export function buildMailDnsRecords(domain: string, sesDkimTokens: string[]): DnsRecord[] {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const records: DnsRecord[] = [
    // SPF on root
    {
      type:  "TXT",
      name:  "@",
      value: "v=spf1 include:amazonses.com ~all",
    },
    // DMARC
    {
      type:  "TXT",
      name:  "_dmarc",
      value: `v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain}; pct=100`,
    },
    // MX — SES inbound for reply detection
    {
      type:     "MX",
      name:     "@",
      value:    `inbound-smtp.${region}.amazonaws.com`,
      priority: 10,
    },
    // Custom MAIL FROM subdomain — required for SPF DMARC alignment
    // SES uses mail.{domain} as the envelope sender (Return-Path)
    {
      type:     "MX",
      name:     "mail",
      value:    `feedback-smtp.${region}.amazonses.com`,
      priority: 10,
    },
    {
      type:  "TXT",
      name:  "mail",
      value: "v=spf1 include:amazonses.com ~all",
    },
  ];

  // DKIM CNAME records (SES gives 3 tokens)
  for (const token of sesDkimTokens) {
    records.push({
      type:  "CNAME",
      name:  `${token}._domainkey`,
      value: `${token}.dkim.amazonses.com`,
    });
  }

  return records;
}
