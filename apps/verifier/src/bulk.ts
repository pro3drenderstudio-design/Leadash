/**
 * Domain-grouped bulk email verification.
 *
 * Groups emails by domain and verifies all addresses for a domain in a
 * single SMTP session — far more efficient than one connection per email.
 * Processes up to DOMAIN_CONCURRENCY domains in parallel.
 *
 * Output status values match Reoon's vocabulary so the worker's mapping
 * logic works unchanged: "safe", "invalid", "catch_all", "disposable", "unknown".
 */

import { resolveMx } from "dns/promises";
import { createConnection } from "net";
import { DISPOSABLE_DOMAINS } from "./disposable.js";

const SMTP_FROM = process.env.SMTP_FROM ?? "verify@leadash.com";
const SMTP_HELO = process.env.SMTP_HELO ?? "leadash.com";
const DOMAIN_CONCURRENCY = 150; // parallel domain workers
const SMTP_TIMEOUT_MS    = 20_000; // per-domain SMTP session

// Large consumer providers block SMTP probing from unknown IPs — skip directly
// to MX-verified status for these.
const MAJOR_PROVIDERS = new Set([
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "hotmail.co.uk", "live.co.uk", "hotmail.fr", "live.fr",
  "yahoo.com", "yahoo.co.uk", "yahoo.fr", "yahoo.de",
  "yahoo.es", "yahoo.it", "yahoo.ca", "yahoo.co.in",
  "icloud.com", "me.com", "mac.com",
  "protonmail.com", "proton.me", "pm.me",
  "aol.com", "aol.co.uk",
  "zoho.com", "zohomail.com",
  "mail.com", "gmx.com", "gmx.net", "gmx.de",
  "hey.com", "fastmail.com", "fastmail.fm",
  "yandex.com", "yandex.ru", "mail.ru", "inbox.ru",
]);

// Detect custom domains hosted by major providers via their MX host suffix.
// e.g. malik@proplan-studio.com → MX aspmx.l.google.com → Google Workspace → "safe"
function isMajorProviderMx(mxHost: string): boolean {
  const h = mxHost.toLowerCase();
  return (
    h === "aspmx.l.google.com"              ||  // Google Workspace primary
    h.endsWith(".aspmx.l.google.com")       ||  // Google Workspace alt MX
    h.endsWith(".googlemail.com")           ||  // older Google hosted
    h.endsWith(".mail.protection.outlook.com") || // Microsoft 365 / Exchange Online
    h.endsWith(".yahoodns.net")             ||  // Yahoo Business
    h.endsWith(".zoho.com")                 ||  // Zoho Mail (mx.zoho.com, mx2.zoho.com)
    h.endsWith(".zoho.eu")                  ||  // Zoho Mail EU
    h.endsWith(".zoho.in")                  ||  // Zoho Mail India
    h.endsWith(".mimecast.com")             ||  // Mimecast (blocks SMTP probing)
    h.endsWith(".pphosted.com")             ||  // Proofpoint (blocks SMTP probing)
    h.endsWith(".ppe-hosted.com")              // Proofpoint enterprise
  );
}

export type BulkResultMap = Record<string, { status: string; overall_score: number }>;

// ─── SMTP multi-RCPT probe ────────────────────────────────────────────────────

// Tests multiple email addresses in a single SMTP session.
// Returns a map from email → response code (0 = timeout / connection error).
function smtpProbeMulti(mxHost: string, emails: string[]): Promise<Map<string, number>> {
  return new Promise(resolve => {
    const codes = new Map<string, number>();
    const queue = [...emails];
    let current: string | null = null;
    let buf     = "";
    let state: "banner" | "ehlo" | "mail_from" | "rcpt_to" | "quit" = "banner";
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      // Remaining unprocessed emails → code 0
      if (current) codes.set(current, 0);
      for (const e of queue) codes.set(e, 0);
      clearTimeout(timer);
      try { socket.destroy(); } catch { /* */ }
      resolve(codes);
    }

    const timer = setTimeout(finish, SMTP_TIMEOUT_MS);

    const socket = createConnection({ host: mxHost, port: 25, timeout: 10_000 });

    function write(line: string) {
      if (!finished) socket.write(line + "\r\n");
    }

    function nextRcpt() {
      current = queue.shift() ?? null;
      if (!current) {
        write("QUIT");
        state = "quit";
        setTimeout(finish, 2_000);
        return;
      }
      write(`RCPT TO:<${current}>`);
      state = "rcpt_to";
    }

    function onCode(code: number) {
      switch (state) {
        case "banner":
          if (code >= 400) { finish(); return; }
          write(`EHLO ${SMTP_HELO}`);
          state = "ehlo";
          break;

        case "ehlo":
          if (code === 250) {
            write(`MAIL FROM:<${SMTP_FROM}>`);
            state = "mail_from";
          } else if (code === 500 || code === 502) {
            // EHLO not supported — fall back to HELO
            write(`HELO ${SMTP_HELO}`);
          } else {
            finish();
          }
          break;

        case "mail_from":
          if (code === 250) {
            nextRcpt();
          } else {
            finish();
          }
          break;

        case "rcpt_to":
          if (current) codes.set(current, code);
          nextRcpt();
          break;

        case "quit":
          finish();
          break;
      }
    }

    socket.on("data", chunk => {
      buf += chunk.toString();
      const lines = buf.split("\r\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        // Only final lines of multi-line responses (e.g. "250 OK" not "250-ENHANCEDSTATUSCODES")
        if (/^\d{3} /.test(line)) onCode(parseInt(line.slice(0, 3)));
      }
    });

    socket.on("error", finish);
    socket.on("close", finish);
    socket.on("timeout", finish);
  });
}

// ─── Per-domain verification ──────────────────────────────────────────────────

async function verifyDomainGroup(
  domain: string,
  emails: string[],
): Promise<Array<{ email: string; status: string; overall_score: number }>> {

  // Disposable check
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return emails.map(e => ({ email: e, status: "disposable", overall_score: 5 }));
  }

  // MX lookup
  let mxHost: string;
  try {
    const records = await resolveMx(domain);
    if (!records.length) {
      return emails.map(e => ({ email: e, status: "invalid", overall_score: 5 }));
    }
    records.sort((a, b) => a.priority - b.priority);
    mxHost = records[0].exchange;
  } catch {
    return emails.map(e => ({ email: e, status: "invalid", overall_score: 5 }));
  }

  // Direct domain match (e.g. @gmail.com, @outlook.com)
  if (MAJOR_PROVIDERS.has(domain)) {
    return emails.map(e => ({ email: e, status: "safe", overall_score: 88 }));
  }

  // Custom domain hosted by a major provider (Google Workspace, Microsoft 365, etc.)
  // SMTP probing these always fails from unknown IPs — detect via MX host instead.
  if (isMajorProviderMx(mxHost)) {
    return emails.map(e => ({ email: e, status: "safe", overall_score: 88 }));
  }

  // Include a random dummy address to detect catch-all servers
  const DUMMY = `__probe_${Math.random().toString(36).slice(2, 10)}@${domain}`;
  const codeMap = await smtpProbeMulti(mxHost, [...emails, DUMMY]);

  const dummyCode = codeMap.get(DUMMY) ?? 0;
  const isCatchAll = dummyCode >= 200 && dummyCode < 300;

  return emails.map(email => {
    const code = codeMap.get(email) ?? 0;

    if (code === 0) return { email, status: "unknown",  overall_score: 25 };
    if (code >= 500) return { email, status: "invalid",  overall_score: 5  };
    if (code >= 400) return { email, status: "unknown",  overall_score: 30 };
    // 2xx accepted
    if (isCatchAll)  return { email, status: "catch_all", overall_score: 55 };
    return { email, status: "safe", overall_score: 95 };
  });
}

// ─── Public bulk entry point ──────────────────────────────────────────────────

export async function verifyBulk(
  emails: string[],
  onProgress?: (checked: number) => void,
): Promise<BulkResultMap> {

  // Group by domain
  const domainMap = new Map<string, string[]>();
  const results: BulkResultMap = {};

  for (const rawEmail of emails) {
    const email = rawEmail.trim().toLowerCase();
    const at = email.lastIndexOf("@");
    if (at < 1 || at === email.length - 1) {
      results[rawEmail] = { status: "invalid", overall_score: 0 };
      continue;
    }
    const domain = email.slice(at + 1);
    if (!domainMap.has(domain)) domainMap.set(domain, []);
    domainMap.get(domain)!.push(rawEmail);
  }

  let checked = Object.keys(results).length; // syntax-invalid ones already counted

  const domainEntries = Array.from(domainMap.entries());

  // Process in waves of DOMAIN_CONCURRENCY
  for (let i = 0; i < domainEntries.length; i += DOMAIN_CONCURRENCY) {
    const wave = domainEntries.slice(i, i + DOMAIN_CONCURRENCY);
    const waveResults = await Promise.all(
      wave.map(([domain, domainEmails]) => verifyDomainGroup(domain, domainEmails)),
    );
    for (const batch of waveResults) {
      for (const r of batch) {
        results[r.email] = { status: r.status, overall_score: r.overall_score };
        checked++;
      }
    }
    onProgress?.(checked);
  }

  return results;
}
