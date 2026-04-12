/**
 * Cloudflare Registrar API wrapper.
 *
 * Registers domains at ICANN wholesale cost — no registrar markup.
 * Domains are instantly available in Cloudflare DNS after registration;
 * no addZone() or nameserver update needed.
 *
 * Docs: https://developers.cloudflare.com/registrar/account-options/api-commands/
 *
 * Required env vars:
 *   CLOUDFLARE_API_TOKEN   — token with Account:Registrar:Edit + Zone:DNS:Edit + Account:Zone:Edit
 *   CLOUDFLARE_ACCOUNT_ID  — found in Cloudflare dashboard sidebar
 *   PORKBUN_API_KEY / PORKBUN_SECRET_KEY — used for live TLD pricing only
 */

const CF_BASE = "https://api.cloudflare.com/client/v4";

export interface DomainCheckResult {
  domain:    string;
  available: boolean;
  price:     number; // USD, registration year 1
}

function authHeaders() {
  return {
    Authorization:  `Bearer ${process.env.CLOUDFLARE_API_TOKEN!}`,
    "Content-Type": "application/json",
  };
}

function accountId() {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!id) throw new Error("CLOUDFLARE_ACCOUNT_ID is not configured");
  return id;
}

async function cfFetch<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${CF_BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json() as { success: boolean; errors: { message: string; code?: number }[]; result: T };

  if (!json.success) {
    const err = json.errors?.[0];
    throw new Error(`Cloudflare error: ${err?.message ?? "Unknown error"}${err?.code ? ` (${err.code})` : ""}`);
  }

  return json.result;
}

/**
 * Fetch live TLD pricing from Porkbun.
 * Used only for price display — domain purchase goes through CF Registrar.
 */
async function getLivePricing(): Promise<Record<string, number>> {
  const res = await fetch("https://api.porkbun.com/api/json/v3/pricing/get", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      apikey:       process.env.PORKBUN_API_KEY!,
      secretapikey: process.env.PORKBUN_SECRET_KEY!,
    }),
  });

  const data = await res.json() as {
    status:  string;
    pricing: Record<string, { registration: string }>;
  };

  if (data.status !== "SUCCESS") throw new Error("Failed to fetch live TLD pricing");

  // Build tld → price map
  const map: Record<string, number> = {};
  for (const [tld, info] of Object.entries(data.pricing ?? {})) {
    const price = parseFloat(info.registration);
    if (!isNaN(price)) map[tld] = price;
  }
  return map;
}

/**
 * Check availability via Cloudflare DNS-over-HTTPS (NXDOMAIN = available).
 * Authoritative, no API key required.
 */
async function isDomainAvailable(domain: string): Promise<boolean> {
  const res  = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`,
    { headers: { Accept: "application/dns-json" } },
  );
  const json = await res.json() as { Status: number };
  return json.Status === 3; // NXDOMAIN = not registered
}

/**
 * Check availability and live pricing for a list of domains.
 * Availability: Cloudflare DoH NXDOMAIN (no auth needed, always reliable).
 * Pricing: live from Porkbun /pricing/get (no fallbacks).
 */
export async function checkDomains(names: string[]): Promise<DomainCheckResult[]> {
  // Fetch pricing once for all domains in parallel with availability checks
  const [pricing] = await Promise.all([getLivePricing()]);

  return Promise.all(
    names.map(async (domain): Promise<DomainCheckResult> => {
      const tld       = domain.split(".").slice(1).join(".");
      const price     = pricing[tld];
      if (price === undefined) throw new Error(`TLD ".${tld}" is not supported`);

      const available = await isDomainAvailable(domain);
      return { domain, available, price };
    }),
  );
}

/**
 * Register a domain for 1 year via Cloudflare Registrar.
 * The domain is instantly added to Cloudflare DNS — no addZone() needed.
 * Requires a valid payment method on the Cloudflare account.
 */
export async function purchaseDomain(domain: string): Promise<void> {
  const acctId = accountId();

  await cfFetch("POST", `/accounts/${acctId}/registrar/domains`, {
    name:              domain,
    years:             1,
    type:              "new",
    auto_renew:        false,
    privacy_protected: true,
  });
}
