/**
 * Porkbun REST API wrapper.
 *
 * Docs: https://porkbun.com/api/json/v3/documentation
 *
 * Required env vars:
 *   PORKBUN_API_KEY     — API key  (starts with pk1_...)
 *   PORKBUN_SECRET_KEY  — Secret key (starts with sk1_...)
 *
 * No IP whitelisting, no deposit, free WHOIS privacy on all domains.
 */

const BASE = "https://api.porkbun.com/api/json/v3";

export interface DnsRecord {
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT";
  name: string;   // subdomain / "" for root
  value: string;
  priority?: number;
  ttl?: number;
}

export interface DomainCheckResult {
  domain:    string;
  available: boolean;
  price:     number;
}

// Kept for interface compatibility with provision routes and settings.
// Porkbun uses the account's contact info + auto-enables free WHOIS privacy,
// so these fields are accepted but not forwarded to the API.
export interface RegistrantContact {
  firstName: string;
  lastName:  string;
  address:   string;
  city:      string;
  state:     string;
  zip:       string;
  country:   string;
  phone:     string;
  email:     string;
}

function auth() {
  return {
    apikey:       process.env.PORKBUN_API_KEY!,
    secretapikey: process.env.PORKBUN_SECRET_KEY!,
  };
}

async function call<T = unknown>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ ...auth(), ...body }),
  });

  const data = await res.json() as { status: string; message?: string } & T;
  if (data.status !== "SUCCESS") {
    throw new Error(`Porkbun error: ${data.message ?? data.status}`);
  }
  return data;
}

/**
 * Fetch Porkbun's TLD pricing table (cached per process lifetime).
 */
let _pricingCache: Record<string, { registration: string }> | null = null;

async function getPricing(): Promise<Record<string, { registration: string }>> {
  if (_pricingCache) return _pricingCache;
  const data = await call<{ pricing: Record<string, { registration: string }> }>("/domain/pricing/get");
  _pricingCache = data.pricing;
  return _pricingCache;
}

/**
 * Check availability and pricing for a list of domains.
 * Availability is determined via Cloudflare DNS-over-HTTPS (NXDOMAIN = available).
 */
export async function checkDomains(names: string[]): Promise<DomainCheckResult[]> {
  const pricing = await getPricing();

  const results = await Promise.all(
    names.map(async (domain): Promise<DomainCheckResult> => {
      const tld = domain.split(".").slice(1).join(".");
      const tldPrice = pricing[tld]?.registration;
      const price = tldPrice ? parseFloat(tldPrice) : 12.00;

      // Cloudflare DoH: Status 3 = NXDOMAIN = domain not registered = available
      let available = false;
      try {
        const doh = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`,
          { headers: { Accept: "application/dns-json" } },
        );
        const json = await doh.json() as { Status: number };
        available = json.Status === 3;
      } catch {
        available = true; // assume available on DNS error
      }

      return { domain, available, price };
    }),
  );

  return results;
}

/**
 * Register a domain for 1 year.
 * Porkbun uses the account's contact info and enables free WHOIS privacy automatically.
 * The registrant parameter is accepted for interface compatibility but not forwarded.
 */
export async function purchaseDomain(domain: string, _registrant?: RegistrantContact): Promise<void> {
  await call(`/domain/create/${domain}`, {
    years:     1,
    autorenew: 0,
    privacy:   1, // enable free WHOIS privacy
  });
}

/**
 * Replace all DNS records for a domain.
 * Deletes existing records of the same types, then creates the new ones.
 * Note: Our primary DNS management uses Cloudflare (cloudflare.ts).
 * This method is provided as a fallback for domains using Porkbun's nameservers.
 */
export async function setDnsHosts(domain: string, records: DnsRecord[]): Promise<void> {
  // Delete all existing records first
  const existing = await call<{ records?: Array<{ id: string }> }>(`/dns/retrieve/${domain}`);
  if (existing.records?.length) {
    await Promise.all(
      existing.records.map(r => call(`/dns/delete/${domain}/${r.id}`).catch(() => {})),
    );
  }

  // Create new records
  for (const rec of records) {
    await call(`/dns/create/${domain}`, {
      type:    rec.type,
      name:    rec.name === "@" ? "" : rec.name,
      content: rec.value,
      ttl:     String(rec.ttl ?? 600),
      ...(rec.priority !== undefined ? { prio: String(rec.priority) } : {}),
    });
  }
}
