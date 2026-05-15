/**
 * Namecheap XML API wrapper.
 * Docs: https://www.namecheap.com/support/api/methods/
 *
 * Required env vars:
 *   NAMECHEAP_API_USER  — Namecheap account username
 *   NAMECHEAP_API_KEY   — Namecheap API key
 *   NAMECHEAP_CLIENT_IP — Whitelisted IP (uses VPS IP so Namecheap accepts calls from Vercel)
 */

export interface DomainCheckResult {
  domain:    string;
  available: boolean;
  price:     number;
}

function getConfig() {
  const apiUser  = process.env.NAMECHEAP_API_USER!;
  const apiKey   = process.env.NAMECHEAP_API_KEY!;
  const clientIp = process.env.NAMECHEAP_CLIENT_IP ?? "209.145.55.138";
  const base     = "https://api.namecheap.com/xml.response";
  return { apiUser, apiKey, clientIp, base };
}

async function callApi(command: string, extra: Record<string, string> = {}): Promise<string> {
  const { apiUser, apiKey, clientIp, base } = getConfig();
  const params = new URLSearchParams({
    ApiUser:  apiUser,
    ApiKey:   apiKey,
    UserName: apiUser,
    ClientIp: clientIp,
    Command:  command,
    ...extra,
  });
  const res = await fetch(`${base}?${params.toString()}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Namecheap HTTP ${res.status}`);
  return res.text();
}

function checkApiErrors(xml: string): void {
  const errMatch = xml.match(/<Error[^>]*Number="(\d+)"[^>]*>([^<]*)<\/Error>/i);
  if (errMatch) throw new Error(`Namecheap error ${errMatch[1]}: ${errMatch[2]}`);
  if (xml.includes('Status="ERROR"')) {
    const m = xml.match(/<Error[^>]*>([^<]+)<\/Error>/i);
    throw new Error(`Namecheap error: ${m?.[1] ?? "Unknown"}`);
  }
}

// Fallback pricing when API is unavailable
const FALLBACK_PRICING: Record<string, number> = {
  com: 9.06,  net: 9.06,  org: 9.06,  io: 32.88, co: 25.88,
  ai: 67.88,  app: 14.00, dev: 12.00, biz: 9.06,  info: 4.88,
  pro: 12.88, me: 16.88,  uk: 6.88,   us: 7.88,   xyz: 2.18,
  site: 3.88, online: 3.88, click: 3.88, website: 3.88,
  fun: 3.88,  space: 3.88, homes: 19.88,
};

let pricingCache: { data: Record<string, number>; ts: number } | null = null;

async function getLivePricing(): Promise<Record<string, number>> {
  if (pricingCache && Date.now() - pricingCache.ts < 3_600_000) {
    return pricingCache.data;
  }
  try {
    const xml = await callApi("namecheap.users.getPricing", {
      ProductType:  "DOMAIN",
      ActionName:   "REGISTER",
    });
    checkApiErrors(xml);

    const pricing: Record<string, number> = {};
    // Extract <Product Name="com"><Price ... YourPrice="9.06" .../></Product>
    const productRe = /<Product\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/Product>/gi;
    let pm: RegExpExecArray | null;
    while ((pm = productRe.exec(xml)) !== null) {
      const tld   = pm[1].toLowerCase();
      const inner = pm[2];
      const priceMatch = inner.match(/YourPrice="([^"]+)"/i);
      if (priceMatch) {
        const p = parseFloat(priceMatch[1]);
        if (!isNaN(p) && p > 0) pricing[tld] = p;
      }
    }

    if (Object.keys(pricing).length > 0) {
      pricingCache = { data: pricing, ts: Date.now() };
      return pricing;
    }
    throw new Error("No pricing data parsed from response");
  } catch (err) {
    console.warn("[namecheap] getLivePricing failed, using fallback:", err instanceof Error ? err.message : err);
    return { ...FALLBACK_PRICING, ...(pricingCache?.data ?? {}) };
  }
}

/**
 * Check availability and Namecheap pricing for a list of domains.
 */
export async function checkDomains(names: string[]): Promise<DomainCheckResult[]> {
  const [xml, pricing] = await Promise.all([
    callApi("namecheap.domains.check", { DomainList: names.join(",") }),
    getLivePricing(),
  ]);
  checkApiErrors(xml);

  const results: DomainCheckResult[] = [];
  const re = /<DomainCheckResult\s+Domain="([^"]+)"\s+Available="([^"]+)"[^/]*\/>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const domain    = m[1].toLowerCase();
    const available = m[2].toLowerCase() === "true";
    const tld       = domain.split(".").slice(1).join(".");
    const price     = pricing[tld] ?? FALLBACK_PRICING[tld] ?? 9.99;
    results.push({ domain, available, price });
  }

  // Preserve input order; fill in any missing entries as unavailable
  return names.map(n => results.find(r => r.domain === n.toLowerCase()) ?? { domain: n, available: false, price: 0 });
}
