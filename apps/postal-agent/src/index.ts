/**
 * Postal Agent — runs on Contabo VPS alongside Postal.
 *
 * Exposes an authenticated HTTP API that lets the Leadash web app:
 *   - Register a sending domain in Postal (generates DKIM keypair, writes to DB)
 *   - Get the DNS records to publish (DKIM TXT, SPF, return-path)
 *   - Create per-mailbox SMTP credentials
 *   - Delete credentials
 *
 * Talks directly to Postal's MariaDB — no Rails dependency.
 *
 * Env vars (set in .env on the VPS):
 *   PORT              — HTTP port to listen on (default 3001)
 *   AGENT_SECRET      — Shared secret — must match POSTAL_AGENT_SECRET in web app
 *   DB_HOST           — Postal MariaDB host (default 127.0.0.1)
 *   DB_PORT           — Postal MariaDB port (default 3306)
 *   DB_USER           — Postal DB user (default postal)
 *   DB_PASSWORD       — Postal DB password
 *   DB_NAME           — Postal DB name (default postal)
 *   POSTAL_SERVER_ID  — The numeric ID of the Postal server to attach domains/creds to
 *   POSTAL_SMTP_HOST  — Public hostname of this Postal server (e.g. mail.yourdomain.com)
 */

import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import mysql from "mysql2/promise";
import { randomBytes, createPublicKey, createPrivateKey } from "crypto";
import { readFileSync } from "fs";

const app  = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);
app.use(express.json());

// ─── DB pool ─────────────────────────────────────────────────────────────────

const pool = mysql.createPool({
  host:               process.env.DB_HOST     ?? "127.0.0.1",
  port:               parseInt(process.env.DB_PORT ?? "3306", 10),
  user:               process.env.DB_USER     ?? "postal",
  password:           process.env.DB_PASSWORD ?? "",
  database:           process.env.DB_NAME     ?? "postal",
  waitForConnections: true,
  connectionLimit:    5,
});

function serverId(): number {
  const id = parseInt(process.env.POSTAL_SERVER_ID ?? "1", 10);
  if (isNaN(id)) throw new Error("POSTAL_SERVER_ID env var is not a valid number");
  return id;
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

function auth(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.AGENT_SECRET;
  if (!secret) { res.status(500).json({ error: "AGENT_SECRET not configured" }); return; }
  const provided = req.headers["x-agent-secret"] as string | undefined;
  if (provided !== secret) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genUuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [
    bytes.slice(0, 4).toString("hex"),
    bytes.slice(4, 6).toString("hex"),
    bytes.slice(6, 8).toString("hex"),
    bytes.slice(8, 10).toString("hex"),
    bytes.slice(10).toString("hex"),
  ].join("-");
}

function genKey(length = 24): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length);
  return Array.from(bytes).map(b => chars[b % chars.length]).join("");
}

// DKIM selector used for all domains — must match dkim_identifier_string in Postal DB
const DKIM_SELECTOR = "postal-1";

/**
 * Read the global Postal signing key and derive the public key from it.
 * All domains share this key so the same DNS TXT record works everywhere.
 * Path is configurable via SIGNING_KEY_PATH env var.
 */
function getSigningKeyPair(): { privateKey: string; publicKey: string } {
  const keyPath = process.env.SIGNING_KEY_PATH ?? "/opt/postal/config/signing.key";
  const privateKeyPem = readFileSync(keyPath, "utf8");
  const privObj = createPrivateKey({ key: privateKeyPem, format: "pem" });
  const pubPem  = createPublicKey(privObj).export({ type: "spki", format: "pem" }).toString();
  const publicKey = pubPem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\n/g, "");
  return { privateKey: privateKeyPem, publicKey };
}

// ─── Inbound relay (no auth — Postal doesn't know the agent secret) ──────────

/**
 * POST /inbound-relay
 * Postal calls this URL when an inbound message arrives for a domain whose
 * HTTP endpoint route points here (172.17.0.1:3001/inbound-relay from Docker).
 * We forward the raw JSON body to the Next.js app's /api/outreach/inbound.
 */
app.post("/inbound-relay", async (req: Request, res: Response) => {
  const appUrl = (process.env.APP_URL ?? process.env.POSTAL_SMTP_HOST?.replace(/^mail\./, "https://") ?? "").replace(/\/$/, "");
  if (!appUrl) {
    console.error("[inbound-relay] APP_URL not configured — cannot forward");
    res.status(500).json({ error: "APP_URL not configured" });
    return;
  }

  try {
    const forwardRes = await fetch(`${appUrl}/api/outreach/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Authenticate with the Leadash app using the shared agent secret
        "x-agent-secret": process.env.AGENT_SECRET ?? "",
        // Pass through Postal's own headers so the app can validate the source
        ...(req.headers["x-postal-signature"] ? { "x-postal-signature": req.headers["x-postal-signature"] as string } : {}),
      },
      body: JSON.stringify(req.body),
    });

    const responseText = await forwardRes.text();
    if (!forwardRes.ok) {
      console.error(`[inbound-relay] App returned ${forwardRes.status}: ${responseText}`);
      res.status(forwardRes.status).send(responseText);
      return;
    }

    console.log(`[inbound-relay] Forwarded to app — ${forwardRes.status}`);
    res.status(200).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[inbound-relay] Forward error:", msg);
    res.status(500).json({ error: msg });
  }
});

// Apply auth middleware to all routes below this point
app.use(auth);

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /domains
 * Register a domain in Postal — generates DKIM keypair, writes to DB.
 * Body: { domain: string }
 * Returns: { dkim_selector, dkim_public_key, dns_records }
 */
app.post("/domains", async (req: Request, res: Response) => {
  const { domain } = req.body as { domain: string };
  if (!domain) { res.status(400).json({ error: "domain is required" }); return; }

  try {
    const conn = await pool.getConnection();
    try {
      // Check if domain already exists for this server
      const [existing] = await conn.execute<mysql.RowDataPacket[]>(
        "SELECT id, dkim_private_key FROM domains WHERE server_id = ? AND name = ? LIMIT 1",
        [serverId(), domain],
      );

      const { privateKey, publicKey } = getSigningKeyPair();

      if (existing.length > 0) {
        // Already registered — ensure dkim_status and identifier_string are set correctly
        await conn.execute(
          "UPDATE domains SET dkim_status = 'OK', dkim_identifier_string = '1', dkim_private_key = ? WHERE server_id = ? AND name = ?",
          [privateKey, serverId(), domain],
        );
        res.json({ ok: true, already_exists: true, domain, dkim_selector: DKIM_SELECTOR, dkim_public_key: publicKey, smtp_host: process.env.POSTAL_SMTP_HOST ?? "mail.yourdomain.com" });
        return;
      }

      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      await conn.execute(
        `INSERT INTO domains
          (server_id, uuid, name, dkim_private_key, dkim_identifier_string, dkim_status,
           owner_type, owner_id, verified_at, outgoing, incoming, created_at, updated_at)
         VALUES (?, ?, ?, ?, '1', 'OK', 'Server', ?, ?, 1, 1, ?, ?)`,
        [serverId(), genUuid(), domain, privateKey, serverId(), now, now, now],
      );

      const smtpHost = process.env.POSTAL_SMTP_HOST ?? "mail.yourdomain.com";

      res.json({
        ok:               true,
        domain,
        dkim_selector:   DKIM_SELECTOR,
        dkim_public_key: publicKey,
        smtp_host:       smtpHost,
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /domains]", msg);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /domains/:domain
 * Returns the DKIM public key and status for a registered domain.
 */
app.get("/domains/:domain", async (req: Request, res: Response) => {
  const { domain } = req.params;
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(
        `SELECT dkim_private_key, dkim_status, spf_status
         FROM domains WHERE server_id = ? AND name = ? LIMIT 1`,
        [serverId(), domain],
      );
      if (!rows.length) { res.status(404).json({ error: "Domain not found" }); return; }

      const row = rows[0] as {
        dkim_private_key: string;
        dkim_status:      string | null;
        spf_status:       string | null;
      };

      // Derive public key from stored private key
      const { createPublicKey } = await import("crypto");
      const pubKeyObj = createPublicKey({ key: row.dkim_private_key, format: "pem" });
      const publicKey = pubKeyObj
        .export({ type: "spki", format: "pem" })
        .toString()
        .replace(/-----BEGIN PUBLIC KEY-----/, "")
        .replace(/-----END PUBLIC KEY-----/, "")
        .replace(/\n/g, "");

      res.json({
        domain,
        dkim_selector:   DKIM_SELECTOR,
        dkim_public_key: publicKey,
        dkim_status:     row.dkim_status,
        spf_status:      row.spf_status,
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /credentials
 * Create an SMTP credential for a mailbox.
 * Body: { name: string, server_id?: number }
 *   server_id defaults to POSTAL_SERVER_ID env var (shared server).
 *   Pass the dedicated Postal server ID for dedicated-IP customers.
 * Returns: { username, password }
 */
app.post("/credentials", async (req: Request, res: Response) => {
  const { name, server_id } = req.body as { name: string; server_id?: number };
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const sid = server_id ?? serverId();

  try {
    const conn = await pool.getConnection();
    try {
      const key = genKey(32);
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      await conn.execute(
        `INSERT INTO credentials (server_id, uuid, name, type, \`key\`, hold, created_at, updated_at)
         VALUES (?, ?, ?, 'SMTP', ?, 0, ?, ?)`,
        [sid, genUuid(), name, key, now, now],
      );

      res.json({
        ok:       true,
        username: key,
        password: key,
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /credentials]", msg);
    res.status(500).json({ error: msg });
  }
});

/**
 * DELETE /credentials
 * Remove an SMTP credential by name (email address).
 * Body: { name: string }
 */
app.delete("/credentials", async (req: Request, res: Response) => {
  const { name } = req.body as { name: string };
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute(
        "DELETE FROM credentials WHERE server_id = ? AND name = ?",
        [serverId(), name],
      );
      res.json({ ok: true });
    } finally {
      conn.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /routes
 * Create (or upsert) a catch-all HTTP endpoint route for a domain in Postal.
 * All mail arriving at *@domain is forwarded as JSON POST to webhook_url.
 * Body: { domain: string, webhook_url: string, server_id?: number }
 *   server_id defaults to POSTAL_SERVER_ID. Pass the dedicated server ID for
 *   dedicated-IP customers so the route lands on the right server.
 */
app.post("/routes", async (req: Request, res: Response) => {
  const { domain, webhook_url, server_id } = req.body as { domain: string; webhook_url: string; server_id?: number };
  if (!domain)      { res.status(400).json({ error: "domain is required" });      return; }
  if (!webhook_url) { res.status(400).json({ error: "webhook_url is required" }); return; }
  const sid = server_id ?? serverId();

  try {
    const conn = await pool.getConnection();
    try {
      // Find the domain row
      const [domainRows] = await conn.execute<mysql.RowDataPacket[]>(
        "SELECT id FROM domains WHERE server_id = ? AND name = ? LIMIT 1",
        [sid, domain],
      );
      if (!domainRows.length) {
        res.status(404).json({ error: `Domain '${domain}' not found in Postal` });
        return;
      }
      const domainId = (domainRows[0] as { id: number }).id;
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      // Check if an HTTP endpoint already exists for this domain
      const [epRows] = await conn.execute<mysql.RowDataPacket[]>(
        "SELECT id FROM http_endpoints WHERE server_id = ? AND url = ? LIMIT 1",
        [sid, webhook_url],
      );

      let endpointId: number;
      if (epRows.length) {
        endpointId = (epRows[0] as { id: number }).id;
      } else {
        const [result] = await conn.execute<mysql.OkPacket>(
          `INSERT INTO http_endpoints (server_id, uuid, name, url, format, strip_replies, include_attachments, timeout, created_at, updated_at)
           VALUES (?, ?, 'leadash-inbound', ?, 'Hash', 0, 1, 10, ?, ?)`,
          [sid, genUuid(), webhook_url, now, now],
        );
        endpointId = result.insertId;
      }

      // Upsert a route: domain → endpoint
      const [routeRows] = await conn.execute<mysql.RowDataPacket[]>(
        "SELECT id FROM routes WHERE server_id = ? AND domain_id = ? AND endpoint_type = 'HTTPEndpoint' AND endpoint_id = ? LIMIT 1",
        [sid, domainId, endpointId],
      );

      if (!routeRows.length) {
        await conn.execute(
          `INSERT INTO routes (server_id, uuid, token, domain_id, endpoint_type, endpoint_id, spam_mode, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'HTTPEndpoint', ?, 'Mark', ?, ?)`,
          [sid, genUuid(), genKey(8), domainId, endpointId, now, now],
        );
      }

      res.json({ ok: true });
    } finally {
      conn.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /routes]", msg);
    res.status(500).json({ error: msg });
  }
});

/**
 * DELETE /routes
 * Remove the inbound HTTP route for a domain.
 * Body: { domain: string, server_id?: number }
 */
app.delete("/routes", async (req: Request, res: Response) => {
  const { domain, server_id } = req.body as { domain: string; server_id?: number };
  if (!domain) { res.status(400).json({ error: "domain is required" }); return; }
  const sid = server_id ?? serverId();

  try {
    const conn = await pool.getConnection();
    try {
      const [domainRows] = await conn.execute<mysql.RowDataPacket[]>(
        "SELECT id FROM domains WHERE server_id = ? AND name = ? LIMIT 1",
        [sid, domain],
      );
      if (!domainRows.length) { res.json({ ok: true }); return; } // already gone
      const domainId = (domainRows[0] as { id: number }).id;

      await conn.execute(
        "DELETE FROM routes WHERE server_id = ? AND domain_id = ? AND endpoint_type = 'HTTPEndpoint'",
        [sid, domainId],
      );
      res.json({ ok: true });
    } finally {
      conn.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Dedicated IP pool management ────────────────────────────────────────────
//
// In Postal, IP pools are assigned at the *server* level, not per domain.
// So each dedicated-IP customer gets their own Postal server within the same
// organisation, with an IP pool containing just their IP address.
//
// Flow:
//   1. POST /ip-pools         → creates ip_pool + ip_address + a new server
//                                bound to that pool. Returns { pool_id, server_id }.
//   2. POST /ip-pools/:id/domains  → registers a domain to the dedicated server
//                                    (instead of the shared default server).
//   3. DELETE /ip-pools/:id/domains → removes a domain from the dedicated server.
//   4. GET /ip-pools           → lists all pools with their IP and server.
//
// The admin stores the returned server_id in dedicated_ip_subscriptions.postal_pool_id.
// When POST /domains is called, it accepts an optional server_id override so new
// domains for dedicated-IP customers land on their server, not the shared one.

/**
 * Helper — get the organisation ID from the shared/default server.
 * Cached after first call since it never changes.
 */
let cachedOrgId: number | null = null;
async function getOrgId(): Promise<number> {
  if (cachedOrgId !== null) return cachedOrgId;
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT organization_id FROM servers WHERE id = ? LIMIT 1",
      [serverId()],
    );
    if (!rows.length) throw new Error("Could not determine organization_id from default server");
    cachedOrgId = (rows[0] as { organization_id: number }).organization_id;
    return cachedOrgId!;
  } finally {
    conn.release();
  }
}

/**
 * POST /ip-pools
 * Create an IP pool with a dedicated IP address and a new Postal server
 * bound to that pool.
 * Body: { name: string, ip_address: string }
 * Returns: { pool_id, server_id, ip_address_id }
 */
app.post("/ip-pools", async (req: Request, res: Response) => {
  const { name, ip_address } = req.body as { name: string; ip_address: string };
  if (!name)       { res.status(400).json({ error: "name is required" });       return; }
  if (!ip_address) { res.status(400).json({ error: "ip_address is required" }); return; }

  const conn = await pool.getConnection();
  try {
    const now   = new Date().toISOString().slice(0, 19).replace("T", " ");
    const orgId = await getOrgId();

    // 1. Create IP pool
    const [poolResult] = await conn.execute<mysql.OkPacket>(
      "INSERT INTO ip_pools (name, `default`, created_at, updated_at) VALUES (?, 0, ?, ?)",
      [name, now, now],
    );
    const poolId = poolResult.insertId;

    // 2. Assign the IP address to the pool
    const [ipResult] = await conn.execute<mysql.OkPacket>(
      "INSERT INTO ip_addresses (ip_pool_id, address, hostname, created_at, updated_at) VALUES (?, ?, '', ?, ?)",
      [poolId, ip_address, now, now],
    );
    const ipAddressId = ipResult.insertId;

    // 3. Create a new Postal server for this customer, bound to the pool.
    //    The permalink must be unique — use a short random slug.
    const slug      = randomBytes(4).toString("hex"); // e.g. "a1b2c3d4"
    const permalink = `dedicated-${slug}`;
    const [serverResult] = await conn.execute<mysql.OkPacket>(
      `INSERT INTO servers
         (organization_id, uuid, name, permalink, ip_pool_id, mode, suspended,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'live', 0, ?, ?)`,
      [orgId, genUuid(), name, permalink, poolId, now, now],
    );
    const newServerId = serverResult.insertId;

    res.json({ ok: true, pool_id: poolId, server_id: newServerId, ip_address_id: ipAddressId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /ip-pools]", msg);
    res.status(500).json({ error: msg });
  } finally {
    conn.release();
  }
});

/**
 * GET /ip-pools
 * Lists all IP pools with their associated IP addresses and server IDs.
 */
app.get("/ip-pools", async (_req: Request, res: Response) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT
        p.id   AS pool_id,
        p.name AS pool_name,
        a.address,
        s.id   AS server_id
      FROM ip_pools p
      LEFT JOIN ip_addresses a ON a.ip_pool_id = p.id
      LEFT JOIN servers s      ON s.ip_pool_id = p.id
      ORDER BY p.id DESC
    `);
    res.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  } finally {
    conn.release();
  }
});

/**
 * POST /ip-pools/:id/domains
 * Register a domain to a dedicated server (routes all sending through the pool's IP).
 * Body: { domain: string, server_id: number }
 * Returns: { ok }
 */
app.post("/ip-pools/:id/domains", async (req: Request, res: Response) => {
  const poolId   = parseInt(req.params.id, 10);
  const { domain, server_id } = req.body as { domain: string; server_id: number };
  if (!domain)    { res.status(400).json({ error: "domain is required" });    return; }
  if (!server_id) { res.status(400).json({ error: "server_id is required" }); return; }
  if (isNaN(poolId)) { res.status(400).json({ error: "invalid pool id" });    return; }

  const conn = await pool.getConnection();
  try {
    // Verify the server belongs to the pool
    const [serverRows] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT id FROM servers WHERE id = ? AND ip_pool_id = ? LIMIT 1",
      [server_id, poolId],
    );
    if (!serverRows.length) {
      res.status(404).json({ error: "Server not found for this pool" });
      return;
    }

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const { privateKey, publicKey } = getSigningKeyPair();

    // Upsert domain on the dedicated server
    const [existing] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT id FROM domains WHERE server_id = ? AND name = ? LIMIT 1",
      [server_id, domain],
    );

    if (!existing.length) {
      await conn.execute(
        `INSERT INTO domains
           (server_id, uuid, name, dkim_private_key, dkim_identifier_string, dkim_status,
            owner_type, owner_id, verified_at, outgoing, incoming, created_at, updated_at)
         VALUES (?, ?, ?, ?, '1', 'OK', 'Server', ?, ?, 1, 1, ?, ?)`,
        [server_id, genUuid(), domain, privateKey, server_id, now, now, now],
      );
    }

    res.json({ ok: true, dkim_selector: DKIM_SELECTOR, dkim_public_key: publicKey });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /ip-pools/:id/domains]", msg);
    res.status(500).json({ error: msg });
  } finally {
    conn.release();
  }
});

/**
 * DELETE /ip-pools/:id/domains
 * Remove a domain from the dedicated server.
 * Body: { domain: string, server_id: number }
 */
app.delete("/ip-pools/:id/domains", async (req: Request, res: Response) => {
  const poolId   = parseInt(req.params.id, 10);
  const { domain, server_id } = req.body as { domain: string; server_id: number };
  if (!domain || !server_id) {
    res.status(400).json({ error: "domain and server_id are required" });
    return;
  }

  const conn = await pool.getConnection();
  try {
    // Verify server belongs to pool before deleting
    const [serverRows] = await conn.execute<mysql.RowDataPacket[]>(
      "SELECT id FROM servers WHERE id = ? AND ip_pool_id = ? LIMIT 1",
      [server_id, poolId],
    );
    if (!serverRows.length) {
      res.status(404).json({ error: "Server not found for this pool" });
      return;
    }

    await conn.execute(
      "DELETE FROM domains WHERE server_id = ? AND name = ?",
      [server_id, domain],
    );
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELETE /ip-pools/:id/domains]", msg);
    res.status(500).json({ error: msg });
  } finally {
    conn.release();
  }
});

/**
 * GET /smtp-settings
 * Returns the SMTP connection settings for this Postal server.
 */
app.get("/smtp-settings", (_req: Request, res: Response) => {
  res.json({
    host:      process.env.POSTAL_SMTP_HOST ?? "mail.yourdomain.com",
    port:      25,
    imap_host: null, // SES handles inbound — no IMAP needed
    imap_port: null,
  });
});

/**
 * GET /health
 */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[postal-agent] Listening on port ${PORT}`);
});
