import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export type NsProvider =
  | "cloudflare"
  | "route53"
  | "godaddy"
  | "namecheap"
  | "porkbun"
  | "google"
  | "squarespace"
  | "unknown";

async function detectNs(domain: string): Promise<{ provider: NsProvider; isCloudflare: boolean }> {
  try {
    const res  = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`,
      { headers: { Accept: "application/dns-json" } },
    );
    const data = (await res.json()) as { Answer?: Array<{ data: string }> };
    const ns   = (data.Answer ?? []).map(a => a.data.toLowerCase());

    let provider: NsProvider = "unknown";
    if (ns.some(n => n.includes(".ns.cloudflare.com") || n.endsWith(".cloudflare.com"))) provider = "cloudflare";
    else if (ns.some(n => n.includes("awsdns"))) provider = "route53";
    else if (ns.some(n => n.includes("domaincontrol") || n.includes("godaddy"))) provider = "godaddy";
    else if (ns.some(n => n.includes("registrar-servers") || n.includes("namecheap"))) provider = "namecheap";
    else if (ns.some(n => n.includes("porkbun"))) provider = "porkbun";
    else if (ns.some(n => n.includes("google"))) provider = "google";
    else if (ns.some(n => n.includes("squarespace"))) provider = "squarespace";

    return { provider, isCloudflare: provider === "cloudflare" };
  } catch {
    return { provider: "unknown", isCloudflare: false };
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const domain = req.nextUrl.searchParams.get("domain")?.trim().toLowerCase();
  if (!domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });

  const { provider, isCloudflare } = await detectNs(domain);

  // If on Cloudflare, check whether the zone is already in our account
  let inOurAccount = false;
  if (isCloudflare) {
    try {
      const { getZoneId } = await import("@/lib/outreach/cloudflare");
      await getZoneId(domain);
      inOurAccount = true;
    } catch {
      inOurAccount = false;
    }
  }

  return NextResponse.json({ provider, isCloudflare, inOurAccount });
}
