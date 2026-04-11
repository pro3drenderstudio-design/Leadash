/**
 * Namecheap XML API wrapper.
 *
 * Docs: https://www.namecheap.com/support/api/methods/
 *
 * Required env vars:
 *   NAMECHEAP_API_USER   — Namecheap account username
 *   NAMECHEAP_API_KEY    — Namecheap API key
 *   NAMECHEAP_CLIENT_IP  — Whitelisted IP for API calls (your server's egress IP)
 *   NAMECHEAP_SANDBOX    — "true" to hit the sandbox endpoint
 */

export interface DnsRecord {
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT";
  name: string;   // subdomain / "@" for root
  value: string;
  priority?: number; // MX only
  ttl?: number;
}

interface NamecheapDomainCheck {
  domain: string;
  available: boolean;
  price: number;
}

function getConfig() {
  const apiUser  = process.env.NAMECHEAP_API_USER!;
  const apiKey   = process.env.NAMECHEAP_API_KEY!;
  const clientIp = process.env.NAMECHEAP_CLIENT_IP ?? "127.0.0.1";
  const sandbox  = process.env.NAMECHEAP_SANDBOX === "true";
  const base     = sandbox
    ? "https://api.sandbox.namecheap.com/xml.response"
    : "https://api.namecheap.com/xml.response";
  return { apiUser, apiKey, clientIp, base };
}

function buildUrl(command: string, extra: Record<string, string> = {}): string {
  const { apiUser, apiKey, clientIp, base } = getConfig();
  const params = new URLSearchParams({
    ApiUser:   apiUser,
    ApiKey:    apiKey,
    UserName:  apiUser,
    ClientIp:  clientIp,
    Command:   command,
    ...extra,
  });
  return `${base}?${params.toString()}`;
}

async function callApi(command: string, extra: Record<string, string> = {}): Promise<string> {
  const url = buildUrl(command, extra);

  // If QUOTAGUARD_URL is set, route through the static proxy so Namecheap
  // sees a whitelisted IP even on Vercel serverless. Format:
  //   QUOTAGUARD_URL=http://user:pass@proxy.quotaguard.com:9293
  const proxyUrl = process.env.NAMECHEAP_PROXY_URL;
  const fetchOptions: RequestInit = {};
  if (proxyUrl) {
    // Node 18+ supports the undici dispatcher for proxying; use a simple
    // approach via HTTPS_PROXY env var that Next.js/Node respects natively.
    // If undici ProxyAgent is available, use it; otherwise fall back to env var.
    try {
      const { ProxyAgent, setGlobalDispatcher } = await import("undici");
      setGlobalDispatcher(new ProxyAgent(proxyUrl));
    } catch {
      // undici not available — set env var as fallback (works in most Node runtimes)
      process.env.HTTPS_PROXY = proxyUrl;
      process.env.HTTP_PROXY  = proxyUrl;
    }
  }

  const res = await fetch(url, fetchOptions);
  if (!res.ok) throw new Error(`Namecheap HTTP error ${res.status}`);
  return res.text();
}

function extractText(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  return match ? match[1] : null;
}

function checkApiErrors(xml: string): void {
  const errorMatch = xml.match(/<Error[^>]*Number="(\d+)"[^>]*>([^<]*)<\/Error>/i);
  if (errorMatch) throw new Error(`Namecheap API error ${errorMatch[1]}: ${errorMatch[2]}`);
  if (xml.includes('Status="ERROR"')) {
    const msg = extractText(xml, "Error") ?? "Unknown Namecheap error";
    throw new Error(`Namecheap error: ${msg}`);
  }
}

/**
 * Check availability and pricing for one or more domains.
 */
export async function checkDomains(names: string[]): Promise<NamecheapDomainCheck[]> {
  const xml = await callApi("namecheap.domains.check", {
    DomainList: names.join(","),
  });
  checkApiErrors(xml);

  const results: NamecheapDomainCheck[] = [];
  const regex = /<DomainCheckResult\s+Domain="([^"]+)"\s+Available="([^"]+)"[^>]*PremiumRegistrationPrice="([^"]*)"[^>]*\/>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml)) !== null) {
    results.push({
      domain:    m[1],
      available: m[2].toLowerCase() === "true",
      price:     parseFloat(m[3]) || 10.98, // fallback price if not in response
    });
  }
  return results;
}

/**
 * Register a domain. Uses Namecheap's registrant contact info from the API
 * account's default registrant, so no separate contact fields are needed here.
 */
export async function purchaseDomain(domain: string): Promise<void> {
  const [sld, ...tldParts] = domain.split(".");
  const tld = tldParts.join(".");

  // Namecheap requires registrant contact fields. We use placeholder values
  // that must be pre-configured in the account, or passed here.
  const xml = await callApi("namecheap.domains.create", {
    DomainName:           domain,
    Years:                "1",
    AuxBillingFirstName:  process.env.NAMECHEAP_REGISTRANT_FIRST ?? "Admin",
    AuxBillingLastName:   process.env.NAMECHEAP_REGISTRANT_LAST  ?? "User",
    AuxBillingAddress1:   process.env.NAMECHEAP_REGISTRANT_ADDR  ?? "123 Main St",
    AuxBillingCity:       process.env.NAMECHEAP_REGISTRANT_CITY  ?? "New York",
    AuxBillingStateProvince: process.env.NAMECHEAP_REGISTRANT_STATE ?? "NY",
    AuxBillingPostalCode: process.env.NAMECHEAP_REGISTRANT_ZIP   ?? "10001",
    AuxBillingCountry:    process.env.NAMECHEAP_REGISTRANT_COUNTRY ?? "US",
    AuxBillingPhone:      process.env.NAMECHEAP_REGISTRANT_PHONE ?? "+1.2125551234",
    AuxBillingEmailAddress: process.env.NAMECHEAP_REGISTRANT_EMAIL ?? "admin@leadash.io",
    // Copy aux billing to all contact fields
    RegistrantFirstName:  process.env.NAMECHEAP_REGISTRANT_FIRST ?? "Admin",
    RegistrantLastName:   process.env.NAMECHEAP_REGISTRANT_LAST  ?? "User",
    RegistrantAddress1:   process.env.NAMECHEAP_REGISTRANT_ADDR  ?? "123 Main St",
    RegistrantCity:       process.env.NAMECHEAP_REGISTRANT_CITY  ?? "New York",
    RegistrantStateProvince: process.env.NAMECHEAP_REGISTRANT_STATE ?? "NY",
    RegistrantPostalCode: process.env.NAMECHEAP_REGISTRANT_ZIP   ?? "10001",
    RegistrantCountry:    process.env.NAMECHEAP_REGISTRANT_COUNTRY ?? "US",
    RegistrantPhone:      process.env.NAMECHEAP_REGISTRANT_PHONE ?? "+1.2125551234",
    RegistrantEmailAddress: process.env.NAMECHEAP_REGISTRANT_EMAIL ?? "admin@leadash.io",
    TechFirstName:        process.env.NAMECHEAP_REGISTRANT_FIRST ?? "Admin",
    TechLastName:         process.env.NAMECHEAP_REGISTRANT_LAST  ?? "User",
    TechAddress1:         process.env.NAMECHEAP_REGISTRANT_ADDR  ?? "123 Main St",
    TechCity:             process.env.NAMECHEAP_REGISTRANT_CITY  ?? "New York",
    TechStateProvince:    process.env.NAMECHEAP_REGISTRANT_STATE ?? "NY",
    TechPostalCode:       process.env.NAMECHEAP_REGISTRANT_ZIP   ?? "10001",
    TechCountry:          process.env.NAMECHEAP_REGISTRANT_COUNTRY ?? "US",
    TechPhone:            process.env.NAMECHEAP_REGISTRANT_PHONE ?? "+1.2125551234",
    TechEmailAddress:     process.env.NAMECHEAP_REGISTRANT_EMAIL ?? "admin@leadash.io",
    AdminFirstName:       process.env.NAMECHEAP_REGISTRANT_FIRST ?? "Admin",
    AdminLastName:        process.env.NAMECHEAP_REGISTRANT_LAST  ?? "User",
    AdminAddress1:        process.env.NAMECHEAP_REGISTRANT_ADDR  ?? "123 Main St",
    AdminCity:            process.env.NAMECHEAP_REGISTRANT_CITY  ?? "New York",
    AdminStateProvince:   process.env.NAMECHEAP_REGISTRANT_STATE ?? "NY",
    AdminPostalCode:      process.env.NAMECHEAP_REGISTRANT_ZIP   ?? "10001",
    AdminCountry:         process.env.NAMECHEAP_REGISTRANT_COUNTRY ?? "US",
    AdminPhone:           process.env.NAMECHEAP_REGISTRANT_PHONE ?? "+1.2125551234",
    AdminEmailAddress:    process.env.NAMECHEAP_REGISTRANT_EMAIL ?? "admin@leadash.io",
    // Suppress unused params lint
    _sld: sld,
    _tld: tld,
  });
  checkApiErrors(xml);
}

/**
 * Set DNS host records for a domain, replacing all existing records.
 * Used to publish SPF, DKIM, DMARC, and MX records after Mailgun setup.
 */
export async function setDnsHosts(domain: string, records: DnsRecord[]): Promise<void> {
  const [sld, ...tldParts] = domain.split(".");
  const tld = tldParts.join(".");

  const extra: Record<string, string> = { SLD: sld, TLD: tld };

  records.forEach((rec, i) => {
    const n = i + 1;
    extra[`HostName${n}`]    = rec.name;
    extra[`RecordType${n}`]  = rec.type;
    extra[`Address${n}`]     = rec.value;
    extra[`TTL${n}`]         = String(rec.ttl ?? 1800);
    if (rec.priority !== undefined) extra[`MXPref${n}`] = String(rec.priority);
  });

  const xml = await callApi("namecheap.domains.dns.setHosts", extra);
  checkApiErrors(xml);
}
