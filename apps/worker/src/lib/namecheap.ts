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

/**
 * Normalise a phone number to Namecheap's required format: +CC.LocalNumber
 * e.g. "+234 801 234 5678" → "+234.8012345678"
 *      "08012345678" (NG)  → "+234.8012345678"
 */
function formatPhone(raw: string, country: string): string {
  if (!raw) return "";
  const stripped = raw.replace(/[\s\-\(\)\.]/g, "");

  // Already in correct format
  if (/^\+\d{1,3}\.\d{4,}$/.test(stripped)) return stripped;

  const hasPlus = stripped.startsWith("+");
  const digits  = stripped.replace(/^\+/, "");

  if (hasPlus) {
    // Identify country-code length by matching known prefixes (longest first)
    const known3 = ["234","233","254","256","260","263","265","267","268","269",
                    "290","291","297","298","299","350","370","371","372","375",
                    "376","377","378","380","381","382","385","386","387","389",
                    "420","421","423","500","501","502","503","504","505","506",
                    "507","508","509","590","591","592","593","594","595","596",
                    "597","598","599","670","672","673","674","675","676","677",
                    "678","679","680","681","682","683","685","686","687","688",
                    "689","690","691","692","850","852","853","855","856","880",
                    "886","960","961","962","963","964","965","966","967","968",
                    "970","971","972","973","974","975","976","977","992","993",
                    "994","995","996","998"];
    const known2 = ["20","27","30","31","32","33","34","36","39","40","41","43",
                    "44","45","46","47","48","49","51","52","53","54","55","56",
                    "57","58","60","61","62","63","64","65","66","81","82","84",
                    "86","90","91","92","93","94","95","98"];

    if (known3.includes(digits.slice(0, 3))) return `+${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (known2.includes(digits.slice(0, 2))) return `+${digits.slice(0, 2)}.${digits.slice(2)}`;
    return `+${digits.slice(0, 1)}.${digits.slice(1)}`; // 1-digit CC (US/CA)
  }

  // No + prefix — derive CC from country field
  const ccMap: Record<string, string> = {
    US: "1", CA: "1", GB: "44", AU: "61", NG: "234", GH: "233",
    KE: "254", ZA: "27", IN: "91", DE: "49", FR: "33", CN: "86",
    BR: "55", MX: "52", JP: "81", KR: "82", SG: "65", ZW: "263",
    UG: "256", TZ: "255", ET: "251", SN: "221", CI: "225", CM: "237",
  };
  const cc = ccMap[country.toUpperCase()] ?? "1";
  return `+${cc}.${digits}`;
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
    Phone:         formatPhone(registrant.phone, registrant.country),
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
