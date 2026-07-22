import { adminClient } from "../lib/supabase";
import { publishDnsRecords } from "../lib/cloudflare";

type DnsRecord = { name: string; type: string; value: string; priority?: number };

async function dohLookup(name: string, type: string): Promise<string[]> {
  try {
    const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const json = await res.json() as { Answer?: { data: string }[] };
    return (json.Answer ?? []).map(a => a.data.trim().replace(/\.+$/, "").toLowerCase());
  } catch {
    return [];
  }
}

async function checkDomainDns(domain: string, expected: DnsRecord[]): Promise<{ ok: boolean; failures: string[]; warnings: string[] }> {
  const failures: string[] = [];
  const warnings: string[] = [];

  for (const rec of expected) {
    const fqdn = rec.name === "@" ? domain : `${rec.name}.${domain}`;

    if (rec.type === "MX") {
      const answers = await dohLookup(fqdn, "MX");
      const expectedHost = rec.value.toLowerCase().replace(/\.+$/, "");
      const found = answers.some(v => v.includes(expectedHost));
      if (!found) failures.push(`MX missing — expected ${rec.value} (got: ${answers.join(", ") || "none"})`);

    } else if (rec.type === "TXT") {
      const answers = await dohLookup(fqdn, "TXT");
      const expectedVal = rec.value.toLowerCase();

      if (expectedVal.startsWith("v=spf1")) {
        const liveSPF = answers.find(v => v.replace(/"/g, "").includes("v=spf1")) ?? "";
        if (!liveSPF) {
          failures.push(`SPF TXT missing on ${fqdn} (got: ${answers.join(", ") || "none"})`);
        } else {
          // Verify all required mechanisms (ip4:/ip6:/include:) from expected are in live SPF
          const required = rec.value.toLowerCase().split(/\s+/)
            .filter(m => m.startsWith("ip4:") || m.startsWith("ip6:") || m.startsWith("include:"));
          const missing = required.filter(m => !liveSPF.includes(m));
          if (missing.length > 0) {
            failures.push(`SPF missing required mechanisms: ${missing.join(", ")} (live: ${liveSPF})`);
          }
        }

      } else if (rec.name === "_dmarc") {
        // DMARC: existence is a hard failure; rua mismatch is advisory only
        const dmarcAnswers = await dohLookup(`_dmarc.${domain}`, "TXT");
        const liveDmarc = dmarcAnswers.find(v => v.replace(/"/g, "").includes("v=dmarc1"));
        if (!liveDmarc) {
          failures.push(`DMARC TXT missing on _dmarc.${domain} — add: v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`);
        } else {
          const clean = liveDmarc.replace(/"/g, "");
          const expectedRua = (rec.value.match(/rua=([^\s;"]+)/i)?.[1] ?? "").toLowerCase();
          const liveRua     = (clean.match(/rua=([^\s;"]+)/i)?.[1] ?? "").toLowerCase();
          if (expectedRua && liveRua && expectedRua !== liveRua) {
            warnings.push(`DMARC rua mismatch — reports are going to ${liveRua} instead of ${expectedRua}. Update your DMARC record's rua= to receive reports at the correct address.`);
          }
        }

      } else if (expectedVal.startsWith("v=dkim1") || rec.name.includes("_domainkey")) {
        const hasDKIM = answers.some(v => v.replace(/"/g, "").includes("v=dkim1"));
        if (!hasDKIM) failures.push(`DKIM TXT missing on ${fqdn}`);

      } else {
        const found = answers.some(v => v.includes(expectedVal));
        if (!found) failures.push(`TXT record missing on ${fqdn}`);
      }
    }
    // CNAME/A records are informational — not checked for alert purposes
  }

  return { ok: failures.length === 0, failures, warnings };
}

async function getWorkspaceEmail(db: ReturnType<typeof adminClient>, workspaceId: string): Promise<string | null> {
  const { data: ws } = await db
    .from("workspaces")
    .select("billing_email, owner_id, name")
    .eq("id", workspaceId)
    .single();

  if (ws?.billing_email) return ws.billing_email;

  if (ws?.owner_id) {
    const { data: { user } } = await db.auth.admin.getUserById(ws.owner_id);
    return user?.email ?? null;
  }

  return null;
}

export async function runInboxDnsHealth(): Promise<void> {
  const db = adminClient();

  const { data: domains, error } = await db
    .from("outreach_domains")
    .select("id, domain, workspace_id, dns_records, dns_ok, last_dns_alert_at, domain_source")
    .eq("status", "active")
    .not("dns_records", "is", null);

  if (error || !domains?.length) {
    if (error) console.error("[dns-health] fetch error:", error.message);
    return;
  }

  let checked = 0, alerted = 0, recovered = 0;

  for (const row of domains) {
    const expected = row.dns_records as DnsRecord[] | null;
    if (!expected?.length) continue;

    checked++;
    const { ok, failures, warnings } = await checkDomainDns(row.domain, expected);
    const wasBad = row.dns_ok === false;

    if (!ok) {
      const lastAlert = row.last_dns_alert_at ? new Date(row.last_dns_alert_at) : null;
      const shouldAlert = !lastAlert || lastAlert < new Date(Date.now() - 24 * 60 * 60 * 1000);

      // ── Leadash-MANAGED domain: WE own the DNS (Cloudflare zone). Never tell
      //    the customer to fix it and never pause their inboxes over our own
      //    infra. Auto-republish the stored records to Cloudflare (self-heal)
      //    and alert ops instead. Recovers silently on the next check.
      if (row.domain_source === "leadash") {
        // Distinguish the real failure mode. When the registrar (Namecheap)
        // suspends a domain for unverified WHOIS, it swaps the nameservers to
        // its verification-hold servers and EVERY record disappears at once.
        // Republishing to Cloudflare can't help — the domain isn't on our
        // nameservers anymore. Detect it so ops gets the correct action.
        const ns = await dohLookup(row.domain, "NS");
        const whoisHold = ns.some(h => /whois|verify-contact|registrar-hold|suspend/i.test(h));

        let republished = false;
        if (whoisHold) {
          console.error(`[dns-health] MANAGED ${row.domain} — REGISTRAR WHOIS HOLD (ns=${ns.join(",")}) — verify registrant email in Namecheap`);
        } else {
          try {
            await publishDnsRecords(row.domain, expected as Parameters<typeof publishDnsRecords>[1]);
            republished = true;
            console.log(`[dns-health] MANAGED ${row.domain} — republished DNS to Cloudflare`);
          } catch (e) {
            console.error(`[dns-health] MANAGED ${row.domain} — republish FAILED:`, e instanceof Error ? e.message : e);
          }
        }
        // Track drift internally; leave inboxes running (records re-propagating).
        await db.from("outreach_domains")
          .update({ dns_ok: false, ...(shouldAlert ? { last_dns_alert_at: new Date().toISOString() } : {}) })
          .eq("id", row.id);
        // Clear any stale customer-facing DNS error left on inboxes by older runs.
        await db.from("outreach_inboxes")
          .update({ status: "active", last_error: null })
          .eq("workspace_id", row.workspace_id)
          .ilike("email_address", `%@${row.domain}`)
          .eq("status", "error");
        if (shouldAlert) {
          alerted++;
          const { sendManagedDnsOpsAlert } = await import("../../../web/src/lib/email/notifications");
          await sendManagedDnsOpsAlert({
            domain: row.domain, workspaceId: row.workspace_id, failures, republished,
            cause: whoisHold
              ? `REGISTRAR WHOIS HOLD — Namecheap suspended the domain for unverified registrant email and moved its nameservers to ${ns.join(", ")}. Republishing DNS can't fix this. Action: verify the registrant email (leadash.official@gmail.com) via the Namecheap account, then the nameservers + records restore automatically.`
              : undefined,
          }).catch(e => console.error(`[dns-health] ops alert failed for ${row.domain}:`, e));
        }
        continue;
      }

      await db
        .from("outreach_domains")
        .update({
          dns_ok: false,
          ...(shouldAlert ? { last_dns_alert_at: new Date().toISOString() } : {}),
        })
        .eq("id", row.id);

      // Set error banner on all inboxes for this domain
      await db
        .from("outreach_inboxes")
        .update({
          status: "error",
          last_error: `DNS misconfiguration detected on ${row.domain}. Check your MX and SPF/DKIM records.`,
        })
        .eq("workspace_id", row.workspace_id)
        .ilike("email_address", `%@${row.domain}`)
        .in("status", ["active", "paused"]);

      if (shouldAlert) {
        alerted++;
        const toEmail = await getWorkspaceEmail(db, row.workspace_id);
        if (toEmail) {
          const { sendInboxDnsAlertEmail } = await import("../../../web/src/lib/email/notifications");
          await sendInboxDnsAlertEmail({ to: toEmail, domain: row.domain, failures, warnings })
            .catch(e => console.error(`[dns-health] alert email failed for ${row.domain}:`, e));
        }

        // Mobile push — deep-links to the first affected inbox
        const { data: firstInbox } = await db
          .from("outreach_inboxes")
          .select("id")
          .eq("workspace_id", row.workspace_id)
          .ilike("email_address", `%@${row.domain}`)
          .limit(1)
          .maybeSingle();
        const { enqueuePush } = await import("../../../web/src/lib/queue");
        await enqueuePush({
          type:         "health",
          workspace_id: row.workspace_id,
          inbox_id:     firstInbox?.id,
          title:        "Inbox needs attention",
          body:         `${row.domain} — ${failures[0] ?? "DNS check failing"}`.slice(0, 140),
        });

        console.log(`[dns-health] ALERT ${row.domain}: ${failures.join("; ")}`);
      }

    } else if (warnings.length > 0) {
      // DNS is valid but has advisory issues (e.g. DMARC rua mismatch) — don't error inboxes
      const lastAlert = row.last_dns_alert_at ? new Date(row.last_dns_alert_at) : null;
      // Throttle advisory emails to once per 7 days
      const shouldWarn = !lastAlert || lastAlert < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (shouldWarn) {
        await db.from("outreach_domains")
          .update({ last_dns_alert_at: new Date().toISOString() })
          .eq("id", row.id);
        const toEmail = await getWorkspaceEmail(db, row.workspace_id);
        if (toEmail) {
          const { sendInboxDnsAdvisoryEmail } = await import("../../../web/src/lib/email/notifications");
          await sendInboxDnsAdvisoryEmail({ to: toEmail, domain: row.domain, warnings })
            .catch(e => console.error(`[dns-health] advisory email failed for ${row.domain}:`, e));
        }
        console.log(`[dns-health] ADVISORY ${row.domain}: ${warnings.join("; ")}`);
      }

    } else if (wasBad) {
      // DNS has recovered — clear error state
      recovered++;

      await db
        .from("outreach_domains")
        .update({ dns_ok: true, last_dns_alert_at: null })
        .eq("id", row.id);

      await db
        .from("outreach_inboxes")
        .update({ status: "active", last_error: null })
        .eq("workspace_id", row.workspace_id)
        .ilike("email_address", `%@${row.domain}`)
        .eq("status", "error");

      // Managed domains recover silently — the customer was never alerted, so a
      // "recovered" email/push would only confuse them.
      if (row.domain_source === "leadash") {
        console.log(`[dns-health] MANAGED ${row.domain} — recovered silently`);
        continue;
      }

      const toEmail = await getWorkspaceEmail(db, row.workspace_id);
      if (toEmail) {
        const { sendInboxDnsRecoveryEmail } = await import("../../../web/src/lib/email/notifications");
        await sendInboxDnsRecoveryEmail({ to: toEmail, domain: row.domain })
          .catch(e => console.error(`[dns-health] recovery email failed for ${row.domain}:`, e));
      }

      // Mobile push — good news is worth a banner too
      const { data: recoveredInbox } = await db
        .from("outreach_inboxes")
        .select("id")
        .eq("workspace_id", row.workspace_id)
        .ilike("email_address", `%@${row.domain}`)
        .limit(1)
        .maybeSingle();
      const { enqueuePush } = await import("../../../web/src/lib/queue");
      await enqueuePush({
        type:         "health",
        workspace_id: row.workspace_id,
        inbox_id:     recoveredInbox?.id,
        title:        "Inbox recovered",
        body:         `${row.domain} — DNS records are passing again. Sending resumed.`,
      });

      console.log(`[dns-health] RECOVERED ${row.domain}`);
    }
  }

  console.log(`[dns-health] checked=${checked} alerted=${alerted} recovered=${recovered}`);
}
