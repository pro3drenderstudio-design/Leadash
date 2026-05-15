/**
 * Namecheap domain availability check and pricing for the web app.
 *
 * Priority:
 *   1. VPS proxy (WORKER_API_URL + WORKER_API_SECRET) — calls Namecheap from the
 *      whitelisted VPS IP. Works from both Vercel and localhost.
 *   2. Direct Namecheap API (NAMECHEAP_API_USER + NAMECHEAP_API_KEY) — only works
 *      when the caller's IP is whitelisted (local dev with whitelisted IP).
 *   3. Cloudflare DNS-over-HTTPS fallback — limited TLD support for newer TLDs.
 *
 * Pricing: hardcoded Namecheap prices — matches what the VPS worker charges.
 */

export interface DomainCheckResult {
  domain:    string;
  available: boolean;
  price:     number;
}

const BASE = "https://api.namecheap.com/xml.response";

const NAMECHEAP_PRICING: Record<string, number> = {
  com: 9.06,  net: 9.06,  org: 9.06,  io: 32.88,  co: 25.88,
  ai: 67.88,  app: 14.00, dev: 12.00, biz: 9.06,   info: 4.88,
  pro: 12.88, me: 16.88,  uk: 6.88,   us: 7.88,    xyz: 2.18,
  site: 3.88, online: 3.88, click: 3.88, website: 3.88,
  fun: 3.88,  space: 3.88, homes: 19.88,
};

export async function checkDomains(names: string[]): Promise<DomainCheckResult[]> {
  // ── 1. VPS proxy ─────────────────────────────────────────────────────────────
  const workerUrl    = process.env.WORKER_API_URL;
  const workerSecret = process.env.WORKER_API_SECRET;

  if (workerUrl && workerSecret) {
    try {
      const res = await fetch(
        `${workerUrl}/domains/check?domains=${encodeURIComponent(names.join(","))}`,
        {
          headers: { Authorization: `Bearer ${workerSecret}` },
          signal:  AbortSignal.timeout(12_000),
        },
      );
      if (res.ok) return res.json() as Promise<DomainCheckResult[]>;
    } catch {
      // VPS unreachable — fall through
    }
  }

  // ── 2. Direct Namecheap API (whitelisted IP only) ─────────────────────────
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
      const errMatch = xml.match(/<Error[^>]*Number="(\d+)"[^>]*>([^<]*)<\/Error>/i);
      if (errMatch) throw new Error(`Namecheap error ${errMatch[1]}: ${errMatch[2]}`);
      if (!xml.includes('Status="ERROR"')) {
        return names.map(domain => {
          const tld   = domain.split(".").slice(1).join(".");
          const price = NAMECHEAP_PRICING[tld] ?? 9.99;
          const match = xml.match(
            new RegExp(`DomainCheckResult[^>]+Domain="${domain.replace(/\./g, "\\.")}"[^>]+Available="(true|false)"`, "i"),
          );
          return { domain, available: match?.[1]?.toLowerCase() === "true", price };
        });
      }
    } catch {
      // IP not whitelisted or API error — fall through to DoH
    }
  }

  // ── 3. Cloudflare DNS-over-HTTPS fallback ─────────────────────────────────
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
        available  = json.Status === 3;
      } catch {
        available = true;
      }
      return { domain, available, price };
    }),
  );
}
