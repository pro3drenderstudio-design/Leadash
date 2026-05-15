/**
 * Namecheap XML API wrapper for the VPS worker.
 * The VPS IP (209.145.55.138) must be whitelisted in the Namecheap API settings.
 *
 * Required env vars:
 *   NAMECHEAP_API_USER  — Namecheap account username
 *   NAMECHEAP_API_KEY   — Namecheap API key
 *
 * Optional registrant contact env vars (required by Namecheap for domain registration):
 *   NAMECHEAP_REG_FIRST    NAMECHEAP_REG_LAST
 *   NAMECHEAP_REG_ADDR     NAMECHEAP_REG_CITY
 *   NAMECHEAP_REG_STATE    NAMECHEAP_REG_ZIP
 *   NAMECHEAP_REG_COUNTRY  NAMECHEAP_REG_PHONE
 *   NAMECHEAP_REG_EMAIL
 */

const BASE = "https://api.namecheap.com/xml.response";

function getConfig() {
  const apiUser = process.env.NAMECHEAP_API_USER;
  const apiKey  = process.env.NAMECHEAP_API_KEY;
  if (!apiUser || !apiKey) throw new Error("NAMECHEAP_API_USER and NAMECHEAP_API_KEY must be set");
  const clientIp = process.env.NAMECHEAP_CLIENT_IP ?? "209.145.55.138";
  return { apiUser, apiKey, clientIp };
}

function getRegistrant() {
  return {
    FirstName:     process.env.NAMECHEAP_REG_FIRST   ?? "",
    LastName:      process.env.NAMECHEAP_REG_LAST    ?? "",
    Address1:      process.env.NAMECHEAP_REG_ADDR    ?? "",
    City:          process.env.NAMECHEAP_REG_CITY    ?? "",
    StateProvince: process.env.NAMECHEAP_REG_STATE   ?? "",
    PostalCode:    process.env.NAMECHEAP_REG_ZIP     ?? "",
    Country:       process.env.NAMECHEAP_REG_COUNTRY ?? "",
    Phone:         process.env.NAMECHEAP_REG_PHONE   ?? "",
    EmailAddress:  process.env.NAMECHEAP_REG_EMAIL   ?? process.env.ADMIN_EMAIL ?? "",
  };
}

async function callApi(command: string, extra: Record<string, string> = {}): Promise<string> {
  const { apiUser, apiKey, clientIp } = getConfig();
  const params = new URLSearchParams({
    ApiUser:  apiUser,
    ApiKey:   apiKey,
    UserName: apiUser,
    ClientIp: clientIp,
    Command:  command,
    ...extra,
  });
  const res = await fetch(`${BASE}?${params.toString()}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Namecheap HTTP ${res.status}`);
  return res.text();
}

function checkErrors(xml: string): void {
  const errMatch = xml.match(/<Error[^>]*Number="(\d+)"[^>]*>([^<]*)<\/Error>/i);
  if (errMatch) throw new Error(`Namecheap error ${errMatch[1]}: ${errMatch[2]}`);
  if (xml.includes('Status="ERROR"')) {
    const m = xml.match(/<Error[^>]*>([^<]+)<\/Error>/i);
    throw new Error(`Namecheap error: ${m?.[1] ?? "Unknown"}`);
  }
}

export async function purchaseDomain(domain: string): Promise<void> {
  const [sld, ...tldParts] = domain.split(".");
  const tld = tldParts.join(".");
  const reg = getRegistrant();

  const extra: Record<string, string> = {
    DomainName: domain,
    Years:      "1",
    SLD:        sld,
    TLD:        tld,
  };

  for (const prefix of ["Registrant", "Tech", "Admin", "AuxBilling"] as const) {
    for (const [key, val] of Object.entries(reg)) {
      extra[`${prefix}${key}`] = val;
    }
  }

  const xml = await callApi("namecheap.domains.create", extra);
  checkErrors(xml);
  console.log(`[namecheap] Registered ${domain}`);
}

export async function updateNameservers(domain: string, nameservers: string[]): Promise<void> {
  const [sld, ...tldParts] = domain.split(".");
  const tld = tldParts.join(".");
  const xml = await callApi("namecheap.domains.dns.setCustom", {
    SLD:         sld,
    TLD:         tld,
    Nameservers: nameservers.join(","),
  });
  checkErrors(xml);
  console.log(`[namecheap] Nameservers updated for ${domain}`);
}
