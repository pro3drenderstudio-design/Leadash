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
 */

const CF_BASE = "https://api.cloudflare.com/client/v4";

export interface DomainCheckResult {
  domain:    string;
  available: boolean;
  price:     number; // USD, registration year 1
}

// Cloudflare at-cost prices (USD) for common TLDs.
// These are ICANN wholesale — no markup. Updated periodically.
const FALLBACK_PRICES: Record<string, number> = {
  com:   9.15,
  net:   10.99,
  org:   9.93,
  io:    32.00,
  co:    24.99,
  ai:    79.00,
  app:   14.00,
  dev:   12.00,
  homes: 29.99,
  info:  9.99,
  biz:   12.99,
  us:    9.99,
  me:    19.99,
};

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
 * Check if a domain is available using Cloudflare DNS-over-HTTPS.
 * Status 3 = NXDOMAIN = not registered anywhere = available.
 */
async function isDomainAvailable(domain: string): Promise<boolean> {
  try {
    const res  = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`,
      { headers: { Accept: "application/dns-json" } },
    );
    const json = await res.json() as { Status: number };
    return json.Status === 3; // NXDOMAIN
  } catch {
    // If DoH fails, assume available (better than blocking the user)
    return true;
  }
}

/**
 * Get the Cloudflare at-cost price for a domain.
 * Uses hardcoded ICANN wholesale prices — the CF Registrar API only returns
 * pricing for domains already registered in the account, not for availability checks.
 */
function getDomainPrice(domain: string): number {
  const tld = domain.split(".").slice(1).join(".");
  return FALLBACK_PRICES[tld] ?? 0;
}

/**
 * Check availability and at-cost pricing for a list of domains.
 * Availability: Cloudflare DoH NXDOMAIN check (reliable, no auth needed).
 * Pricing: Cloudflare Registrar API with hardcoded fallback.
 */
export async function checkDomains(names: string[]): Promise<DomainCheckResult[]> {
  return Promise.all(
    names.map(async (domain): Promise<DomainCheckResult> => {
      const [available, price] = await Promise.all([
        isDomainAvailable(domain),
        getDomainPrice(domain),
      ]);
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
