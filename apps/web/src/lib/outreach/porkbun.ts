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

// Fallback pricing for common TLDs (used when Porkbun pricing API is unavailable)
const FALLBACK_PRICING: Record<string, TldPricing> = {
  com: { registration: "9.73" }, net: { registration: "11.98" }, org: { registration: "11.98" },
  io:  { registration: "39.99" }, co:  { registration: "28.88" }, ai:  { registration: "79.99" },
  app: { registration: "14.00" }, dev: { registration: "12.00" }, biz: { registration: "12.98" },
  info:{ registration: "4.99"  }, pro: { registration: "14.98" }, me:  { registration: "19.98" },
  uk:  { registration: "7.48"  }, us:  { registration: "8.98"  }, xyz: { registration: "2.48"  },
  site:{ registration: "4.98"  }, online: { registration: "4.98" }, click: { registration: "4.98" },
  website: { registration: "4.98" }, fun: { registration: "4.98" }, space: { registration: "4.98" },
  homes: { registration: "24.98" },
};

let pricingCache: { data: Record<string, TldPricing>; ts: number } | null = null;

/**
 * Fetch live TLD pricing from Porkbun, cached for 1 hour.
 * Falls back to hardcoded pricing if the API is unavailable.
 */
export async function getLivePricing(): Promise<Record<string, TldPricing>> {
  if (pricingCache && Date.now() - pricingCache.ts < 3_600_000) {
    return pricingCache.data;
  }

  try {
    const res = await fetch(`${BASE}/pricing/get`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({}),
      signal:  AbortSignal.timeout(8000),
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

    pricingCache = { data: data.pricing, ts: Date.now() };
    return data.pricing;
  } catch (err) {
    console.warn("[porkbun] getLivePricing failed, using fallback:", err instanceof Error ? err.message : err);
    return { ...FALLBACK_PRICING, ...(pricingCache?.data ?? {}) };
  }
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
async function isDomainInAccount(domain: string): Promise<boolean> {
  try {
    const data = await call<{ domains?: { domain: string }[] }>("/domain/listAll", { includeLabels: "yes" });
    return (data.domains ?? []).some(d => d.domain === domain);
  } catch {
    return false;
  }
}

export async function purchaseDomain(domain: string, _registrant?: RegistrantContact, priceUsdOverride?: number): Promise<void> {
  // Idempotent — skip purchase if domain is already in the Porkbun account
  if (await isDomainInAccount(domain)) return;

  let priceUsd: number;
  if (priceUsdOverride !== undefined && priceUsdOverride > 0) {
    priceUsd = priceUsdOverride;
  } else {
    const pricing = await getLivePricing();
    const tld     = domain.split(".").slice(1).join(".");
    const tldData = pricing[tld];
    if (!tldData) throw new Error(`TLD ".${tld}" is not supported by Porkbun`);
    priceUsd = parseFloat(tldData.registration);
  }

  const costPennies = Math.round(priceUsd * 100);

  const createArgs = {
    years:        1,
    autorenew:    0,
    privacy:      1,
    cost:         costPennies,
    agreeToTerms: "yes",
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await call(`/domain/create/${domain}`, createArgs);
      return;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const msg = raw.toLowerCase();
      console.error(`[porkbun] /domain/create/${domain} attempt ${attempt} error:`, raw);
      // Idempotency: domain already in our account
      if (msg.includes("already") || msg.includes("registered") || msg.includes("taken") || msg.includes("unable to register")) return;
      // Domain unavailable (taken by someone else, not orderable, or unsupported TLD)
      if (msg.includes("not available") || msg.includes("domain not available") || msg.includes("(002)")) {
        throw new Error(`The domain ${domain} is no longer available for registration. Please contact support for a refund. (Porkbun: ${raw})`);
      }
      // Rate limit: wait 12s and retry
      if (msg.includes("create attempts") || msg.includes("rate limit") || msg.includes("too many")) {
        if (attempt < 3) { await new Promise(r => setTimeout(r, 12_000)); continue; }
      }
      throw err;
    }
  }
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
