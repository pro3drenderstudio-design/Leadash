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
 * Check availability and at-cost pricing for a list of domains.
 * Uses Cloudflare's bulk domain check endpoint.
 */
export async function checkDomains(names: string[]): Promise<DomainCheckResult[]> {
  const acctId = accountId();

  // Cloudflare checks one domain at a time via registrar
  const results = await Promise.all(
    names.map(async (domain): Promise<DomainCheckResult> => {
      try {
        const result = await cfFetch<{
          name:      string;
          available: boolean;
          price?:    number;
          fees?:     { icann_fee?: number; registration?: number };
        }>("GET", `/accounts/${acctId}/registrar/domains/${encodeURIComponent(domain)}`);

        const price =
          result.fees?.registration ??
          result.price ??
          0;

        return { domain, available: result.available ?? false, price };
      } catch {
        // If domain lookup fails (e.g. already registered), mark as unavailable
        return { domain, available: false, price: 0 };
      }
    }),
  );

  return results;
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
