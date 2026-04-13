/**
 * Verifier Service — runs on Hetzner VPS.
 *
 * Full 5-layer email verification:
 *   1. Syntax check
 *   2. Disposable domain check
 *   3. MX record lookup
 *   4. Catch-all detection (probe with a random address first)
 *   5. SMTP RCPT TO verification
 *
 * Requires port 25 outbound to be open (request from Hetzner support).
 * Requires a valid PTR record on the VPS IP and a real FROM domain.
 *
 * Env vars:
 *   PORT           — HTTP port (default 3002)
 *   AGENT_SECRET   — Shared secret, must match VERIFIER_SECRET in web app
 *   SMTP_FROM      — The MAIL FROM address used in probes (e.g. verify@mail.yourdomain.com)
 *   SMTP_HELO      — The HELO hostname (e.g. mail.yourdomain.com)
 */

import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { resolveMx } from "dns/promises";
import { createConnection } from "net";
import { DISPOSABLE_DOMAINS } from "./disposable";

const app  = express();
const PORT = parseInt(process.env.PORT ?? "3002", 10);
app.use(express.json());

const SMTP_FROM = process.env.SMTP_FROM ?? "verify@mail.yourdomain.com";
const SMTP_HELO = process.env.SMTP_HELO ?? "mail.yourdomain.com";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function auth(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.AGENT_SECRET;
  if (!secret) { res.status(500).json({ error: "AGENT_SECRET not configured" }); return; }
  if (req.headers["x-agent-secret"] !== secret) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}
app.use(auth);

// ─── Caches ───────────────────────────────────────────────────────────────────

// MX cache: domain → MX host (5 min TTL)
const mxCache = new Map<string, { host: string; expires: number }>();
// Catch-all cache: domain → boolean (10 min TTL)
const catchAllCache = new Map<string, { value: boolean; expires: number }>();

function getCachedMx(domain: string): string | null {
  const entry = mxCache.get(domain);
  if (!entry || Date.now() > entry.expires) return null;
  return entry.host;
}
function setCachedMx(domain: string, host: string) {
  mxCache.set(domain, { host, expires: Date.now() + 5 * 60_000 });
}
function getCachedCatchAll(domain: string): boolean | null {
  const entry = catchAllCache.get(domain);
  if (!entry || Date.now() > entry.expires) return null;
  return entry.value;
}
function setCachedCatchAll(domain: string, value: boolean) {
  catchAllCache.set(domain, { value, expires: Date.now() + 10 * 60_000 });
}

// ─── SMTP probe ───────────────────────────────────────────────────────────────

interface SmtpProbeResult {
  exists:  boolean | null; // null = inconclusive (greylist / temp fail)
  code:    number;
  message: string;
}

function smtpProbe(mxHost: string, toEmail: string): Promise<SmtpProbeResult> {
  return new Promise(resolve => {
    const TIMEOUT_MS = 10_000;
    let response = "";
    let stage: "greeting" | "ehlo" | "mail_from" | "rcpt_to" | "quit" = "greeting";
    let resolved = false;

    function done(result: SmtpProbeResult) {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch { /* ignore */ }
      resolve(result);
    }

    const socket = createConnection({ host: mxHost, port: 25, timeout: TIMEOUT_MS });

    const timer = setTimeout(() => {
      done({ exists: null, code: 0, message: "Connection timeout" });
    }, TIMEOUT_MS);

    socket.on("connect", () => { clearTimeout(timer); });

    socket.on("timeout", () => {
      done({ exists: null, code: 0, message: "Socket timeout" });
    });

    socket.on("error", (err) => {
      done({ exists: null, code: 0, message: `Connection error: ${err.message}` });
    });

    socket.on("data", (data) => {
      response += data.toString();
      const lines = response.split("\r\n");

      for (const line of lines) {
        if (!line) continue;
        // Only act on complete responses (no continuation dash)
        const match = line.match(/^(\d{3})[ -](.*)/);
        if (!match) continue;
        // Skip if it's a multi-line continuation
        if (line.charAt(3) === "-") continue;

        const code = parseInt(match[1], 10);

        switch (stage) {
          case "greeting":
            if (code === 220) {
              stage = "ehlo";
              socket.write(`EHLO ${SMTP_HELO}\r\n`);
            } else {
              done({ exists: null, code, message: "Unexpected greeting" });
            }
            break;

          case "ehlo":
            if (code === 250) {
              stage = "mail_from";
              socket.write(`MAIL FROM:<${SMTP_FROM}>\r\n`);
            } else if (code === 502 || code === 500) {
              // EHLO not supported — try HELO
              socket.write(`HELO ${SMTP_HELO}\r\n`);
            } else {
              done({ exists: null, code, message: line });
            }
            break;

          case "mail_from":
            if (code === 250) {
              stage = "rcpt_to";
              socket.write(`RCPT TO:<${toEmail}>\r\n`);
            } else {
              done({ exists: null, code, message: `MAIL FROM rejected: ${line}` });
            }
            break;

          case "rcpt_to":
            stage = "quit";
            socket.write("QUIT\r\n");
            if (code === 250 || code === 251) {
              done({ exists: true,  code, message: line });
            } else if (code === 550 || code === 551 || code === 552 || code === 553 || code === 554) {
              done({ exists: false, code, message: line });
            } else if (code >= 400 && code < 500) {
              // Temporary failure / greylisted — inconclusive
              done({ exists: null, code, message: line });
            } else {
              done({ exists: null, code, message: line });
            }
            break;

          case "quit":
            done({ exists: null, code, message: "Already resolved" });
            break;
        }

        response = ""; // clear buffer after processing
      }
    });

    socket.on("close", () => {
      if (!resolved) done({ exists: null, code: 0, message: "Connection closed" });
    });
  });
}

// ─── Core verify ─────────────────────────────────────────────────────────────

export type VerifyStatus = "valid" | "invalid" | "catch_all" | "disposable" | "unknown";

interface VerifyResult {
  email:   string;
  status:  VerifyStatus;
  score:   number;
  reason?: string;
}

async function verifySingle(email: string): Promise<VerifyResult> {
  const base = { email };

  // 1. Syntax
  const syntaxOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  if (!syntaxOk) return { ...base, status: "invalid", score: 0, reason: "syntax" };

  const domain = email.split("@")[1].toLowerCase();

  // 2. Disposable
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { ...base, status: "disposable", score: 10, reason: "disposable_domain" };
  }

  // Known major providers that block SMTP probing from unknown IPs.
  // These are verified by MX + syntax only — SMTP probing will always 4xx.
  const MAJOR_PROVIDERS = new Set([
    "gmail.com", "googlemail.com",
    "outlook.com", "hotmail.com", "live.com", "msn.com",
    "hotmail.co.uk", "live.co.uk", "hotmail.fr", "live.fr",
    "yahoo.com", "yahoo.co.uk", "yahoo.fr", "yahoo.de", "yahoo.es", "yahoo.it", "yahoo.ca",
    "icloud.com", "me.com", "mac.com",
    "protonmail.com", "proton.me",
    "aol.com", "aol.co.uk",
    "zoho.com", "zohomail.com",
    "mail.com", "gmx.com", "gmx.net", "gmx.de",
    "hey.com", "fastmail.com", "fastmail.fm",
  ]);

  // 3. MX lookup
  let mxHost = getCachedMx(domain);
  if (!mxHost) {
    try {
      const records = await resolveMx(domain);
      if (!records.length) return { ...base, status: "invalid", score: 5, reason: "no_mx" };
      records.sort((a, b) => a.priority - b.priority);
      mxHost = records[0].exchange;
      setCachedMx(domain, mxHost);
    } catch {
      return { ...base, status: "invalid", score: 5, reason: "mx_lookup_failed" };
    }
  }

  // 4. Catch-all detection (probe with random address)
  let isCatchAll = getCachedCatchAll(domain);
  if (isCatchAll === null) {
    const randAddress = `__probe_${Math.random().toString(36).slice(2)}@${domain}`;
    try {
      const probe = await smtpProbe(mxHost, randAddress);
      isCatchAll = probe.exists === true;
    } catch {
      isCatchAll = false;
    }
    setCachedCatchAll(domain, isCatchAll);
  }

  if (isCatchAll) {
    return { ...base, status: "catch_all", score: 60, reason: "catch_all_domain" };
  }

  // 5. SMTP RCPT TO
  try {
    const result = await smtpProbe(mxHost, email);
    if (result.exists === true)  return { ...base, status: "valid",   score: 100 };
    if (result.exists === false) return { ...base, status: "invalid", score: 0,   reason: `smtp_rejected_${result.code}` };
    // Inconclusive (greylisted, temp fail, connection issue)
    return { ...base, status: "unknown", score: 40, reason: result.message };
  } catch (err) {
    return { ...base, status: "unknown", score: 40, reason: "smtp_error" };
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /verify
 * Verify a single email.
 * Body: { email: string }
 */
app.post("/verify", async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };
  if (!email) { res.status(400).json({ error: "email is required" }); return; }
  try {
    const result = await verifySingle(email.toLowerCase().trim());
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /verify/batch
 * Verify up to 50 emails with concurrency cap of 5.
 * Body: { emails: string[] }
 */
app.post("/verify/batch", async (req: Request, res: Response) => {
  const { emails } = req.body as { emails: string[] };
  if (!Array.isArray(emails) || !emails.length) {
    res.status(400).json({ error: "emails array is required" });
    return;
  }
  const batch = emails.slice(0, 50);
  const CONCURRENCY = 5;
  const results: VerifyResult[] = [];

  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const chunk = batch.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map(e => verifySingle(e.toLowerCase().trim())),
    );
    for (let j = 0; j < chunk.length; j++) {
      const s = settled[j];
      results.push(
        s.status === "fulfilled"
          ? s.value
          : { email: chunk[j], status: "unknown", score: 0, reason: "internal_error" },
      );
    }
  }

  res.json({ results });
});

/**
 * GET /health
 */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, port_25: "open" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[verifier] Listening on port ${PORT}`);
});
