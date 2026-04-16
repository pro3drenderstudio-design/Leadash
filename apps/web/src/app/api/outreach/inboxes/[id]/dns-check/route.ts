import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { promises as dns } from "dns";

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

  type CheckResult = { pass: boolean; record?: string; selector?: string; records?: string[]; detail: string };

  const checks: { spf: CheckResult; dmarc: CheckResult; dkim: CheckResult; mx: CheckResult } = {
    spf:   { pass: false, detail: "" },
    dmarc: { pass: false, detail: "" },
    dkim:  { pass: false, detail: "" },
    mx:    { pass: false, detail: "" },
  };

  // SPF
  try {
    const txt = await dns.resolveTxt(domain);
    const spf = txt.flat().find(r => r.startsWith("v=spf1"));
    checks.spf = spf
      ? { pass: true, record: spf, detail: "SPF record found" }
      : { pass: false, detail: `No SPF TXT record on ${domain}` };
  } catch {
    checks.spf = { pass: false, detail: `Could not resolve TXT records for ${domain}` };
  }

  // DMARC
  try {
    const txt = await dns.resolveTxt(`_dmarc.${domain}`);
    const dmarc = txt.flat().find(r => r.startsWith("v=DMARC1"));
    checks.dmarc = dmarc
      ? { pass: true, record: dmarc, detail: "DMARC record found" }
      : { pass: false, detail: `No DMARC record at _dmarc.${domain}` };
  } catch {
    checks.dmarc = { pass: false, detail: `No DMARC record. Add TXT on _dmarc.${domain}: v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}` };
  }

  // DKIM — try common selectors
  const selectors = ["postal", "mail", "default", "google", "k1", "s1", "s2", "selector1", "selector2", "dkim"];
  let dkimFound = false;
  for (const selector of selectors) {
    try {
      const txt = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
      if (txt.flat().some(r => r.includes("v=DKIM1") || r.includes("k=rsa") || r.includes("p="))) {
        checks.dkim = { pass: true, selector, detail: `DKIM found (selector: ${selector})` };
        dkimFound = true;
        break;
      }
    } catch { /* selector not present */ }
  }
  if (!dkimFound) {
    checks.dkim = { pass: false, detail: "No DKIM record found on common selectors (postal, mail, default, …)" };
  }

  // MX
  try {
    const mx = await dns.resolveMx(domain);
    const exchanges = mx.sort((a, b) => a.priority - b.priority).map(r => r.exchange);
    checks.mx = mx.length > 0
      ? { pass: true, records: exchanges, detail: `MX → ${exchanges.slice(0, 2).join(", ")}` }
      : { pass: false, detail: "No MX records — inbound email will not work" };
  } catch {
    checks.mx = { pass: false, detail: `No MX records configured for ${domain}` };
  }

  const score = Object.values(checks).filter(c => c.pass).length;
  return NextResponse.json({ domain, checks, score, max_score: 4 });
}
