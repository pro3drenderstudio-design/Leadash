/**
 * Namecheap domain availability check and pricing for the web app.
 *
 * Availability: Namecheap domains.check API (requires NAMECHEAP_API_USER + NAMECHEAP_API_KEY).
 * Falls back to Cloudflare DNS-over-HTTPS if the API key is missing or the call fails
 * (e.g. Vercel production where the source IP isn't whitelisted).
 *
 * Pricing: Namecheap prices hardcoded — matches what the VPS worker charges at purchase time.
 *
 * Direct Namecheap API calls from the web server only work when the server's IP
 * is whitelisted in Namecheap's API Access settings (currently: 209.145.55.138).
 */

export interface DomainCheckResult {
  domain:    string;
  available: boolean;
  price:     number;
}

const BASE = "https://api.namecheap.com/xml.response";

// Namecheap registration prices (USD) for supported TLDs
const NAMECHEAP_PRICING: Record<string, number> = {
  com: 9.06,  net: 9.06,  org: 9.06,  io: 32.88,  co: 25.88,
  ai: 67.88,  app: 14.00, dev: 12.00, biz: 9.06,   info: 4.88,
  pro: 12.88, me: 16.88,  uk: 6.88,   us: 7.88,    xyz: 2.18,
  site: 3.88, online: 3.88, click: 3.88, website: 3.88,
  fun: 3.88,  space: 3.88, homes: 19.88,
};

/**
 * Check availability via Namecheap domains.check API.
 * Falls back to Cloudflare DoH on error (IP not whitelisted, timeout, etc).
 */
export async function checkDomains(names: string[]): Promise<DomainCheckResult[]> {
  const apiUser  = process.env.NAMECHEAP_API_USER;
  const apiKey   = process.env.NAMECHEAP_API_KEY;
  const clientIp = process.env.NAMECHEAP_CLIENT_IP ?? "209.145.55.138";

  if (apiUser && apiKey) {
    try {
      const params = new URLSearchParams({
        ApiUser:    apiUser,
        ApiKey:     apiKey,
        UserName:   apiUser,
        ClientIp:   clientIp,
        Command:    "namecheap.domains.check",
        DomainList: names.join(","),
      });

      const res = await fetch(`${BASE}?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
      const xml = await res.text();

      // Surface API errors so the caller can handle them
      const errMatch = xml.match(/<Error[^>]*Number="(\d+)"[^>]*>([^<]*)<\/Error>/i);
      if (errMatch) throw new Error(`Namecheap error ${errMatch[1]}: ${errMatch[2]}`);
      if (xml.includes('Status="ERROR"')) {
        const m = xml.match(/<Error[^>]*>([^<]+)<\/Error>/i);
        throw new Error(`Namecheap error: ${m?.[1] ?? "Unknown"}`);
      }

      return names.map(domain => {
        const tld   = domain.split(".").slice(1).join(".");
        const price = NAMECHEAP_PRICING[tld] ?? 9.99;
        // <DomainCheckResult Domain="example.com" Available="true" ... />
        const match = xml.match(
          new RegExp(`DomainCheckResult[^>]+Domain="${domain.replace(/\./g, "\\.")}"[^>]+Available="(true|false)"`, "i"),
        );
        const available = match?.[1]?.toLowerCase() === "true";
        return { domain, available, price };
      });
    } catch (err) {
      // IP not whitelisted (1011102) or other API error — fall through to Cloudflare DoH
      console.warn("[namecheap] domain check fell back to DoH:", (err as Error).message);
    }
  }

  // No credentials — fall back to Cloudflare DNS-over-HTTPS
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
        available = true;
      }

      return { domain, available, price };
    }),
  );
}
