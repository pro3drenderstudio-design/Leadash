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
  const json = (await res.json()) as { success: boolean; errors: { message: string }[]; result: T };
  if (!json.success) {
    const msg = json.errors?.[0]?.message ?? `Cloudflare API error ${res.status}`;
    throw new Error(msg);
  }
  return json.result;
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

  const zones = await cfFetch<{ id: string; name: string }[]>("GET", `/zones?name=${apex}&status=active`);
  if (!zones?.length) throw new Error(`No active Cloudflare zone found for ${apex}`);
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
    await cfFetch("DELETE", `/zones/${zoneId}/dns_records/${rec.id}`);
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
 * Build the standard set of mail DNS records for a domain + SES DKIM tokens.
 * sesDkimTokens: array of 3 tokens returned by AWS SES verifyDomainDkim()
 */
export function buildMailDnsRecords(domain: string, sesDkimTokens: string[]): DnsRecord[] {
  const records: DnsRecord[] = [
    // SPF
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
    // MX — point to SES inbound (for reply detection via IMAP)
    {
      type:     "MX",
      name:     "@",
      value:    `inbound-smtp.${process.env.AWS_REGION ?? "us-east-1"}.amazonaws.com`,
      priority: 10,
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
