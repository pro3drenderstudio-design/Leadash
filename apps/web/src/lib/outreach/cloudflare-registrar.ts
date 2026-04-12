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
 * Check availability via Cloudflare DNS-over-HTTPS (NXDOMAIN = available).
 * This is authoritative and requires no API key.
 */
async function isDomainAvailable(domain: string): Promise<boolean> {
  const res  = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`,
    { headers: { Accept: "application/dns-json" } },
  );
  const json = await res.json() as { Status: number };
  // Status 3 = NXDOMAIN — domain is not registered anywhere
  return json.Status === 3;
}

/**
 * Fetch the real Cloudflare at-cost price for a domain via the Registrar API.
 * The CF endpoint returns price info regardless of whether the domain is taken.
 * Throws if the price cannot be determined (unsupported TLD, auth error, etc.).
 */
async function getDomainPrice(domain: string): Promise<number> {
  const acctId = accountId();

  const result = await cfFetch<{
    price?:         number;
    fees?: {
      registration?: number;
      icann_fee?:    number;
    };
    supported_tld?: boolean;
  }>("GET", `/accounts/${acctId}/registrar/domains/${encodeURIComponent(domain)}`);

  const price = result.fees?.registration ?? result.price;

  if (!price) {
    const tld = domain.split(".").slice(1).join(".");
    throw new Error(`Cloudflare Registrar does not support .${tld} or returned no price`);
  }

  return price;
}

/**
 * Check availability and at-cost pricing for a list of domains.
 * Availability: Cloudflare DoH NXDOMAIN (no auth, always reliable).
 * Pricing: Cloudflare Registrar API (real ICANN wholesale price, no fallbacks).
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
