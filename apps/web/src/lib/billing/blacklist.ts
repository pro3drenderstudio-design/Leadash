/**
 * DNS-based IP blacklist checker.
 *
 * Uses DNS-over-HTTPS (Google DoH) so this works reliably from Vercel
 * serverless without depending on the Lambda's local DNS resolver.
 *
 * Checks Spamhaus, Barracuda, and SpamCop — the three most widely
 * respected blocklists for email deliverability.
 */

export interface BlacklistResult {
  blacklistsChecked: string[];
  blacklistsHit:     string[];
  isClean:           boolean;
  rawResults:        Record<string, { listed: boolean; returnCodes?: string[] }>;
}

const DNSBL_ZONES: Record<string, string> = {
  "Spamhaus ZEN": "zen.spamhaus.org",
  "Barracuda":    "b.barracudacentral.org",
  "SpamCop":      "bl.spamcop.net",
};

function reverseIp(ip: string): string {
  return ip.split(".").reverse().join(".");
}

async function checkDnsbl(reversedIp: string, zone: string): Promise<{ listed: boolean; returnCodes: string[] }> {
  const query = `${reversedIp}.${zone}`;
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(query)}&type=A`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return { listed: false, returnCodes: [] };
    const json = await res.json() as {
      Status: number;
      Answer?: Array<{ type: number; data: string }>;
    };
    // Status 0 + Answer with A records = listed
    if (json.Status !== 0 || !json.Answer?.length) return { listed: false, returnCodes: [] };
    const codes = json.Answer
      .filter(r => r.type === 1)
      .map(r => r.data);
    return { listed: codes.length > 0, returnCodes: codes };
  } catch {
    return { listed: false, returnCodes: [] };
  }
}

export async function checkIpBlacklists(ipAddress: string): Promise<BlacklistResult> {
  const reversed = reverseIp(ipAddress);
  const rawResults: Record<string, { listed: boolean; returnCodes?: string[] }> = {};

  await Promise.all(
    Object.entries(DNSBL_ZONES).map(async ([name, zone]) => {
      rawResults[name] = await checkDnsbl(reversed, zone);
    }),
  );

  const blacklistsHit = Object.entries(rawResults)
    .filter(([, r]) => r.listed)
    .map(([name]) => name);

  return {
    blacklistsChecked: Object.keys(DNSBL_ZONES),
    blacklistsHit,
    isClean:     blacklistsHit.length === 0,
    rawResults,
  };
}
