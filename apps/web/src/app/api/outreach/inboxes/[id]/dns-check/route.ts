import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { promises as dns } from "dns";

type CheckResult = { pass: boolean; record?: string; selector?: string; records?: string[]; detail: string };

function extractSpfMechanisms(spfValue: string): string[] {
  return spfValue.toLowerCase().split(/\s+/)
    .filter(m => m.startsWith("ip4:") || m.startsWith("ip6:") || m.startsWith("include:"));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { data: inbox } = await db
    .from("outreach_inboxes")
    .select("email_address")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!inbox) return NextResponse.json({ error: "Inbox not found" }, { status: 404 });

  const domain = (inbox.email_address as string).split("@")[1];
  if (!domain) return NextResponse.json({ error: "Invalid email address" }, { status: 400 });

  // Fetch expected DNS records stored when the domain was provisioned
  const { data: domainRecord } = await db
    .from("outreach_domains")
    .select("dns_records, domain_price_usd")
    .eq("domain", domain)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  // user_managed_dns:
  //   true  = user's own domain ($0), they control DNS at their provider → show copy panel
  //   false = Leadash-purchased domain (price > $0), we manage DNS in Cloudflare → show "contact support"
  //   null  = no domain record (custom imported SMTP) → show generic check
  const user_managed_dns: boolean | null = domainRecord
    ? (Number(domainRecord.domain_price_usd ?? 0) === 0)
    : null;

  const expected = (domainRecord?.dns_records ?? null) as
    Array<{ name: string; type: string; value: string; priority?: number }> | null;

  const checks: { spf: CheckResult; dmarc: CheckResult; dkim: CheckResult; mx: CheckResult } = {
    spf:   { pass: false, detail: "" },
    dmarc: { pass: false, detail: "" },
    dkim:  { pass: false, detail: "" },
    mx:    { pass: false, detail: "" },
  };

  if (expected?.length) {
    // Value-aware checks: validate each stored expected record against live DNS
    for (const rec of expected) {
      const fqdn = rec.name === "@" ? domain : `${rec.name}.${domain}`;

      if (rec.type === "MX") {
        try {
          const mx = await dns.resolveMx(domain);
          const exchanges = mx.sort((a, b) => a.priority - b.priority).map(r => r.exchange.toLowerCase().replace(/\.+$/, ""));
          const expectedExchange = rec.value.toLowerCase().replace(/\.+$/, "");
          const found = exchanges.some(e => e === expectedExchange || e.endsWith(`.${expectedExchange}`) || expectedExchange.endsWith(`.${e}`));
          checks.mx = found
            ? { pass: true, records: exchanges, detail: `MX → ${exchanges[0]}` }
            : { pass: false, detail: `MX must include ${rec.value} — currently: ${exchanges.join(", ") || "none"}` };
        } catch {
          checks.mx = { pass: false, detail: `No MX records configured for ${domain}` };
        }

      } else if (rec.type === "TXT") {
        const val = rec.value.toLowerCase();

        if (val.startsWith("v=spf1")) {
          try {
            const txt = await dns.resolveTxt(domain);
            const liveSPF = txt.flat().find(r => r.toLowerCase().startsWith("v=spf1")) ?? "";
            if (!liveSPF) {
              checks.spf = { pass: false, detail: `No SPF record on ${domain}` };
            } else {
              const required = extractSpfMechanisms(rec.value);
              const missing = required.filter(m => !liveSPF.toLowerCase().includes(m));
              checks.spf = missing.length === 0
                ? { pass: true, record: liveSPF, detail: "SPF authorizes Postal" }
                : { pass: false, detail: `SPF missing: ${missing.join(", ")}` };
            }
          } catch {
            checks.spf = { pass: false, detail: `Could not resolve TXT for ${domain}` };
          }

        } else if (rec.name.includes("_domainkey")) {
          // DKIM — check the specific selector stored in expected records
          try {
            const txt = await dns.resolveTxt(fqdn);
            const flat = txt.flat().join(" ").toLowerCase();
            const valid = flat.includes("v=dkim1") && flat.includes("p=");
            const selector = rec.name.split("._domainkey")[0];
            checks.dkim = valid
              ? { pass: true, selector, detail: `DKIM found (selector: ${selector})` }
              : { pass: false, detail: `DKIM record at ${fqdn} is present but appears invalid` };
          } catch {
            const selector = rec.name.split("._domainkey")[0];
            checks.dkim = { pass: false, detail: `DKIM selector "${selector}" not found — add TXT on ${rec.name}` };
          }

        } else if (rec.name === "_dmarc") {
          try {
            const txt = await dns.resolveTxt(`_dmarc.${domain}`);
            const dmarc = txt.flat().find(r => r.toLowerCase().startsWith("v=dmarc1"));
            checks.dmarc = dmarc
              ? { pass: true, record: dmarc, detail: "DMARC record found" }
              : { pass: false, detail: `No DMARC record at _dmarc.${domain}` };
          } catch {
            checks.dmarc = { pass: false, detail: `No DMARC record — add TXT on _dmarc.${domain}` };
          }
        }
      }
    }
  } else {
    // Fallback: generic existence checks when no expected records are stored (custom/imported inboxes)
    try {
      const txt = await dns.resolveTxt(domain);
      const spf = txt.flat().find(r => r.toLowerCase().startsWith("v=spf1"));
      checks.spf = spf
        ? { pass: true, record: spf, detail: "SPF record found" }
        : { pass: false, detail: `No SPF TXT record on ${domain}` };
    } catch {
      checks.spf = { pass: false, detail: `Could not resolve TXT records for ${domain}` };
    }

    try {
      const txt = await dns.resolveTxt(`_dmarc.${domain}`);
      const dmarc = txt.flat().find(r => r.toLowerCase().startsWith("v=dmarc1"));
      checks.dmarc = dmarc
        ? { pass: true, record: dmarc, detail: "DMARC record found" }
        : { pass: false, detail: `No DMARC record at _dmarc.${domain}` };
    } catch {
      checks.dmarc = { pass: false, detail: `No DMARC record. Add TXT on _dmarc.${domain}: v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}` };
    }

    const selectors = ["postal-1", "postal", "mail", "default", "google", "k1", "s1", "s2", "selector1", "selector2", "dkim"];
    let dkimFound = false;
    for (const selector of selectors) {
      try {
        const txt = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
        if (txt.flat().some(r => r.toLowerCase().includes("v=dkim1"))) {
          checks.dkim = { pass: true, selector, detail: `DKIM found (selector: ${selector})` };
          dkimFound = true;
          break;
        }
      } catch { /* selector not present */ }
    }
    if (!dkimFound) {
      checks.dkim = { pass: false, detail: "No DKIM record found on common selectors (postal-1, postal, mail, default, …)" };
    }

    try {
      const mx = await dns.resolveMx(domain);
      const exchanges = mx.sort((a, b) => a.priority - b.priority).map(r => r.exchange);
      checks.mx = mx.length > 0
        ? { pass: true, records: exchanges, detail: `MX → ${exchanges.slice(0, 2).join(", ")}` }
        : { pass: false, detail: "No MX records — inbound email will not work" };
    } catch {
      checks.mx = { pass: false, detail: `No MX records configured for ${domain}` };
    }
  }

  const score = Object.values(checks).filter(c => c.pass).length;
  return NextResponse.json({ domain, checks, score, max_score: 4, expected_records: expected, user_managed_dns });
}
