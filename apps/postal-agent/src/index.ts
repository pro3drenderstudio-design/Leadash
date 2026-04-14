/**
 * Postal Agent — runs on Hetzner VPS alongside Postal.
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
import { generateKeyPairSync, randomBytes } from "crypto";

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

app.use(auth);

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

function generateDkimPair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength:        2048,
    publicKeyEncoding:  { type: "spki",  format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  // Strip PEM headers and newlines for DNS TXT value
  const publicKeyStripped = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\n/g, "");
  return { privateKey, publicKey: publicKeyStripped };
}

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

      if (existing.length > 0) {
        // Already registered — return existing records
        const row = existing[0] as { id: number; dkim_private_key: string };
        const pubMatch = row.dkim_private_key.match(/-- already stored public: (.+)/);
        // If we stored public key in a comment trick, extract it — otherwise re-derive
        // For simplicity, just return success and let the caller re-fetch via GET /domains/:domain
        res.json({ ok: true, already_exists: true, domain });
        return;
      }

      const { privateKey, publicKey } = generateDkimPair();
      const selector = "postal";
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      await conn.execute(
        `INSERT INTO domains
          (server_id, uuid, name, dkim_private_key, dkim_identifier_string,
           owner_type, owner_id, verified_at, outgoing, incoming, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'postal', 'Server', ?, ?, 1, 1, ?, ?)`,
        [serverId(), genUuid(), domain, privateKey, serverId(), now, now, now],
      );

      const smtpHost = process.env.POSTAL_SMTP_HOST ?? "mail.yourdomain.com";

      res.json({
        ok:               true,
        domain,
        dkim_selector:   selector,
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
        dkim_selector:   "postal",
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
 * Body: { name: string }  — typically the full email address
 * Returns: { username, password }
 * In Postal SMTP: username = credential key, password = credential key
 */
app.post("/credentials", async (req: Request, res: Response) => {
  const { name } = req.body as { name: string };
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  try {
    const conn = await pool.getConnection();
    try {
      const key = genKey(32);
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

      await conn.execute(
        `INSERT INTO credentials (server_id, uuid, name, type, \`key\`, hold, created_at, updated_at)
         VALUES (?, ?, ?, 'SMTP', ?, 0, ?, ?)`,
        [serverId(), genUuid(), name, key, now, now],
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
 * GET /smtp-settings
 * Returns the SMTP connection settings for this Postal server.
 */
app.get("/smtp-settings", (_req: Request, res: Response) => {
  res.json({
    host:      process.env.POSTAL_SMTP_HOST ?? "mail.yourdomain.com",
    port:      587,
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
