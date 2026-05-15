/**
 * Namecheap domain availability check and pricing for the web app.
 *
 * Availability: Cloudflare DNS-over-HTTPS (works from Vercel/localhost, no IP restrictions).
 * Pricing: Namecheap prices hardcoded — matches what the VPS worker charges at purchase time.
 *
 * Direct Namecheap API calls are only made from the VPS worker (whitelisted IP 209.145.55.138).
 */

export interface DomainCheckResult {
  domain:    string;
  available: boolean;
  price:     number;
}

// Namecheap registration prices (USD) for supported TLDs
const NAMECHEAP_PRICING: Record<string, number> = {
  com: 9.06,  net: 9.06,  org: 9.06,  io: 32.88,  co: 25.88,
  ai: 67.88,  app: 14.00, dev: 12.00, biz: 9.06,   info: 4.88,
  pro: 12.88, me: 16.88,  uk: 6.88,   us: 7.88,    xyz: 2.18,
  site: 3.88, online: 3.88, click: 3.88, website: 3.88,
  fun: 3.88,  space: 3.88, homes: 19.88,
};

/**
 * Check availability and Namecheap pricing for a list of domains.
 * Availability is determined via Cloudflare DNS-over-HTTPS (NXDOMAIN = available).
 */
export async function checkDomains(names: string[]): Promise<DomainCheckResult[]> {
  return Promise.all(
    names.map(async (domain): Promise<DomainCheckResult> => {
      const tld   = domain.split(".").slice(1).join(".");
      const price = NAMECHEAP_PRICING[tld] ?? 9.99;

      let available = false;
      try {
        const res  = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`,
          { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(5_000) },
        );
        const json = await res.json() as { Status: number };
        available  = json.Status === 3; // NXDOMAIN = not registered
      } catch {
        available = true; // assume available on DNS timeout
      }

      return { domain, available, price };
    }),
  );
}
