/**
 * Namecheap XML API wrapper for the VPS worker.
 * The VPS IP (209.145.55.138) must be whitelisted in the Namecheap API settings.
 *
 * Required env vars:
 *   NAMECHEAP_API_USER  — Namecheap account username
 *   NAMECHEAP_API_KEY   — Namecheap API key
 */

const BASE = "https://api.namecheap.com/xml.response";

export interface RegistrantContact {
  first_name:  string;
  last_name:   string;
  email:       string;
  phone:       string;
  address:     string;
  city:        string;
  state:       string;
  zip:         string;
  country:     string;
}

function getConfig() {
  const apiUser = process.env.NAMECHEAP_API_USER;
  const apiKey  = process.env.NAMECHEAP_API_KEY;
  if (!apiUser || !apiKey) throw new Error("NAMECHEAP_API_USER and NAMECHEAP_API_KEY must be set");
  const clientIp = process.env.NAMECHEAP_CLIENT_IP ?? "209.145.55.138";
  return { apiUser, apiKey, clientIp };
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

export async function purchaseDomain(domain: string, registrant: RegistrantContact): Promise<void> {
  const [sld, ...tldParts] = domain.split(".");
  const tld = tldParts.join(".");

  const contact = {
    FirstName:     registrant.first_name,
    LastName:      registrant.last_name,
    EmailAddress:  registrant.email,
    Phone:         registrant.phone,
    Address1:      registrant.address,
    City:          registrant.city,
    StateProvince: registrant.state,
    PostalCode:    registrant.zip,
    Country:       registrant.country,
  };

  const extra: Record<string, string> = {
    DomainName: domain,
    Years:      "1",
    SLD:        sld,
    TLD:        tld,
  };

  for (const prefix of ["Registrant", "Tech", "Admin", "AuxBilling"] as const) {
    for (const [key, val] of Object.entries(contact)) {
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
