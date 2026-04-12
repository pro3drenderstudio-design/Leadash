/**
 * Porkbun REST API v3 wrapper.
 * Docs: https://porkbun.com/api/json/v3/documentation
 *
 * Required env vars:
 *   PORKBUN_API_KEY     — API key  (starts with pk1_...)
 *   PORKBUN_SECRET_KEY  — Secret key (starts with sk1_...)
 */

const BASE = "https://api.porkbun.com/api/json/v3";

export interface DnsRecord {
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT";
  name: string;
  value: string;
  priority?: number;
  ttl?: number;
}

export interface DomainCheckResult {
  domain:    string;
  available: boolean;
  price:     number;
}

// Kept for interface compatibility — Porkbun uses account contact info automatically.
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

  let data: { status: string; message?: string } & T;
  try {
    data = await res.json() as { status: string; message?: string } & T;
  } catch {
    throw new Error(`Porkbun API returned non-JSON response (HTTP ${res.status})`);
  }

  if (data.status !== "SUCCESS") {
    throw new Error(`Porkbun error: ${data.message ?? data.status}`);
  }
  return data;
}

interface TldPricing {
  registration: string;
  renew?:       string;
  transfer?:    string;
}

/**
 * Fetch live TLD pricing from Porkbun.
 * Throws if the API call fails — no fallbacks, so the UI always shows accurate prices.
 */
export async function getLivePricing(): Promise<Record<string, TldPricing>> {
  // Pricing is public — no auth required
  const res = await fetch(`${BASE}/pricing/get`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({}),
  });

  let data: { status: string; message?: string; pricing: Record<string, TldPricing> };
  try {
    data = await res.json();
  } catch {
    throw new Error(`Porkbun pricing API returned non-JSON response (HTTP ${res.status})`);
  }

  if (data.status !== "SUCCESS") {
    throw new Error(`Porkbun pricing error: ${data.message ?? data.status}`);
  }

  return data.pricing;
}

/**
 * Check availability and current Porkbun registration price for a list of domains.
 * Availability is determined via Cloudflare DNS-over-HTTPS (NXDOMAIN = available).
 * Throws if pricing cannot be fetched — callers must handle this error.
 */
export async function checkDomains(names: string[]): Promise<DomainCheckResult[]> {
  const pricing = await getLivePricing();

  return Promise.all(
    names.map(async (domain): Promise<DomainCheckResult> => {
      const tld      = domain.split(".").slice(1).join(".");
      const tldData  = pricing[tld];
      if (!tldData) throw new Error(`TLD ".${tld}" is not supported by Porkbun`);

      // registration price already includes all fees (ICANN, etc.)
      const price = parseFloat(tldData.registration);
      if (isNaN(price)) throw new Error(`Invalid price for .${tld}`);

      // Cloudflare DoH: Status 3 = NXDOMAIN = not registered = available
      let available = false;
      try {
        const doh  = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`,
          { headers: { Accept: "application/dns-json" } },
        );
        const json = await doh.json() as { Status: number };
        available  = json.Status === 3;
      } catch {
        available = true;
      }

      return { domain, available, price };
    }),
  );
}

/**
 * Register a domain for 1 year.
 * Fetches the live price from Porkbun and passes it as `cost` (in pennies) — required by the API.
 * Requirements: account email/phone verified, sufficient credit, at least one prior registration.
 */
export async function purchaseDomain(domain: string, _registrant?: RegistrantContact): Promise<void> {
  const pricing = await getLivePricing();
  const tld     = domain.split(".").slice(1).join(".");
  const tldData = pricing[tld];
  if (!tldData) throw new Error(`TLD ".${tld}" is not supported by Porkbun`);

  const priceUsd  = parseFloat(tldData.registration);
  const costPennies = Math.round(priceUsd * 100);

  await call(`/domain/create/${domain}`, {
    years:        1,
    autorenew:    0,
    privacy:      1,
    cost:         costPennies,
    agreeToTerms: "yes",
  });
}

/**
 * Update the nameservers for a domain registered on Porkbun.
 * Use this to point the domain to Cloudflare after registration.
 */
export async function updateNameservers(domain: string, nameservers: string[]): Promise<void> {
  // Porkbun API v3 expects nameservers as an array under "ns"
  await call(`/domain/updateNs/${domain}`, { ns: nameservers });
}

/**
 * Replace all DNS records for a domain (Porkbun-managed DNS fallback).
 */
export async function setDnsHosts(domain: string, records: DnsRecord[]): Promise<void> {
  const existing = await call<{ records?: Array<{ id: string }> }>(`/dns/retrieve/${domain}`);
  if (existing.records?.length) {
    await Promise.all(
      existing.records.map(r => call(`/dns/delete/${domain}/${r.id}`).catch(() => {})),
    );
  }

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
