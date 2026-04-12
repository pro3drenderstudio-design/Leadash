/**
 * SES Inbound via S3.
 *
 * AWS SES Receipt Rules store raw emails as S3 objects.
 * This module lists new objects, downloads them, and parses them into RawMessage records
 * that the reply-runner can ingest.
 *
 * Required env vars:
 *   SES_INBOUND_BUCKET   — S3 bucket name (e.g. "leadash-inbound-email")
 *   SES_INBOUND_PREFIX   — key prefix set in the receipt rule (default: "inbound/")
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION
 */

import { createHmac, createHash } from "crypto";

// ── AWS Signature V4 for S3 ───────────────────────────────────────────────────

function cfg() {
  return {
    key:    process.env.AWS_ACCESS_KEY_ID!,
    secret: process.env.AWS_SECRET_ACCESS_KEY!,
    region: process.env.AWS_REGION ?? "us-east-1",
    bucket: process.env.SES_INBOUND_BUCKET ?? "",
    prefix: process.env.SES_INBOUND_PREFIX ?? "inbound/",
  };
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}
function sha256hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

interface S3RequestOpts {
  method:  "GET";
  path:    string;  // e.g. "/"
  query?:  Record<string, string>;
  region:  string;
  bucket:  string;
  key:     string;
  secret:  string;
}

async function s3Fetch(opts: S3RequestOpts): Promise<Response> {
  const { method, path, query = {}, region, bucket, key, secret } = opts;
  const host    = `${bucket}.s3.${region}.amazonaws.com`;
  const now     = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateSt  = amzDate.slice(0, 8);

  const sortedQuery = Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const payloadHash      = sha256hex("");
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders    = "host;x-amz-content-sha256;x-amz-date";

  const canonicalReq = [
    method,
    path,
    sortedQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope       = `${dateSt}/${region}/s3/aws4_request`;
  const strToSign   = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256hex(canonicalReq)}`;
  const signingKey  = hmac(hmac(hmac(hmac("AWS4" + secret, dateSt), region), "s3"), "aws4_request");
  const signature   = hmac(signingKey, strToSign).toString("hex");
  const authHeader  = `AWS4-HMAC-SHA256 Credential=${key}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}${path}${sortedQuery ? "?" + sortedQuery : ""}`;
  return fetch(url, {
    method,
    headers: {
      Host:                   host,
      "X-Amz-Date":           amzDate,
      "X-Amz-Content-SHA256": payloadHash,
      Authorization:           authHeader,
    },
  });
}

// ── XML helpers ───────────────────────────────────────────────────────────────

function xmlValues(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

// ── S3 list + download ────────────────────────────────────────────────────────

interface S3Object {
  key:          string;
  lastModified: Date;
  size:         number;
}

export async function listInboundObjects(since: Date): Promise<S3Object[]> {
  const c = cfg();
  if (!c.bucket) return [];

  const objects: S3Object[] = [];
  let continuationToken: string | undefined;

  do {
    const query: Record<string, string> = {
      "list-type": "2",
      prefix:      c.prefix,
      "max-keys":  "1000",
    };
    if (continuationToken) query["continuation-token"] = continuationToken;

    const res = await s3Fetch({ method: "GET", path: "/", query, region: c.region, bucket: c.bucket, key: c.key, secret: c.secret });
    const xml = await res.text();

    if (!res.ok) {
      console.error("[ses-inbound] S3 list error:", xml.slice(0, 300));
      break;
    }

    const keys  = xmlValues(xml, "Key");
    const dates = xmlValues(xml, "LastModified");
    const sizes = xmlValues(xml, "Size");

    for (let i = 0; i < keys.length; i++) {
      const lastMod = new Date(dates[i] ?? 0);
      if (lastMod < since) continue;
      objects.push({ key: keys[i], lastModified: lastMod, size: Number(sizes[i] ?? 0) });
    }

    const isTruncated = xmlValues(xml, "IsTruncated")[0] === "true";
    continuationToken = isTruncated ? (xmlValues(xml, "NextContinuationToken")[0] ?? undefined) : undefined;
  } while (continuationToken);

  return objects;
}

export async function downloadObject(key: string): Promise<string | null> {
  const c = cfg();
  if (!c.bucket) return null;
  const encodedKey = "/" + key.split("/").map(encodeURIComponent).join("/");
  const res = await s3Fetch({ method: "GET", path: encodedKey, region: c.region, bucket: c.bucket, key: c.key, secret: c.secret });
  if (!res.ok) {
    console.warn("[ses-inbound] S3 download failed for", key, res.status);
    return null;
  }
  return res.text();
}

// ── Raw email parser ──────────────────────────────────────────────────────────

export interface ParsedInboundEmail {
  messageId:  string;
  inReplyTo:  string | null;
  fromEmail:  string;
  fromName:   string | null;
  toEmail:    string;   // which of our inboxes this was sent to
  subject:    string | null;
  bodyText:   string | null;
  receivedAt: string;
  warmupId:   string | null;
  rawSource:  string;
}

function headerVal(headers: string, name: string): string | null {
  // Unfold multi-line headers first
  const unfolded = headers.replace(/\r?\n([ \t])/g, " $1");
  const re = new RegExp(`^${name}:\\s*(.+)`, "im");
  const m  = unfolded.match(re);
  return m ? m[1].trim() : null;
}

function decodeRfc2047(s: string): string {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, _cs, enc, text) => {
    try {
      if (enc.toUpperCase() === "B") return Buffer.from(text, "base64").toString("utf8");
      return text.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_: string, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/_/g, " ");
    } catch { return text; }
  });
}

/** Parse "Display Name <email@domain.com>" or bare email */
function parseAddress(val: string): { email: string; name: string | null } {
  const decoded = decodeRfc2047(val);
  const angleM  = decoded.match(/<([^>]+)>/);
  if (angleM) {
    const email = angleM[1].trim().toLowerCase();
    const name  = decoded.replace(/<[^>]+>/, "").replace(/^"|"$/g, "").trim() || null;
    return { email, name };
  }
  return { email: decoded.trim().toLowerCase(), name: null };
}

function extractPlainText(raw: string): string | null {
  // Try text/plain first
  const plainM = raw.match(/content-type:\s*text\/plain[^\n]*\n(?:.*\n)*?\n([\s\S]*?)(?=\n--|\n\r?\nContent-Type:|$)/i);
  if (plainM?.[1]?.trim()) {
    return plainM[1]
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .trim();
  }
  // Fall back to html → strip tags
  const htmlM = raw.match(/content-type:\s*text\/html[^\n]*\n(?:.*\n)*?\n([\s\S]*?)(?=\n--|\n\r?\nContent-Type:|$)/i);
  if (htmlM?.[1]) {
    return htmlM[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/\s+/g, " ").trim() || null;
  }
  return null;
}

function stripQuotedReply(text: string): string {
  return text.split(/\n[-_]{3,}\n|\nOn .+wrote:\n|^>.*$/m)[0].trim();
}

export function parseRawEmail(raw: string): ParsedInboundEmail | null {
  const blankLine = raw.search(/\r?\n\r?\n/);
  if (blankLine === -1) return null;

  const headerBlock = raw.slice(0, blankLine);

  const messageIdRaw = headerVal(headerBlock, "message-id");
  const messageId    = (messageIdRaw ?? "").replace(/^<|>$/g, "").trim();
  const inReplyToRaw = headerVal(headerBlock, "in-reply-to");
  const inReplyTo    = inReplyToRaw ? inReplyToRaw.replace(/^<|>$/g, "").trim() : null;
  const subjectRaw   = headerVal(headerBlock, "subject");
  const subject      = subjectRaw ? decodeRfc2047(subjectRaw) : null;
  const fromRaw      = headerVal(headerBlock, "from");
  const toRaw        = headerVal(headerBlock, "to");
  const dateRaw      = headerVal(headerBlock, "date");
  const warmupM      = headerBlock.match(/x-ld-ref:\s*(.+)/i);

  if (!fromRaw || !toRaw) return null;

  const { email: fromEmail, name: fromName } = parseAddress(fromRaw);
  const { email: toEmail }                   = parseAddress(toRaw);

  let receivedAt: string;
  try { receivedAt = new Date(dateRaw ?? "").toISOString(); }
  catch { receivedAt = new Date().toISOString(); }

  const bodyFull = extractPlainText(raw);
  const bodyText = bodyFull ? stripQuotedReply(bodyFull) : null;

  return {
    messageId,
    inReplyTo,
    fromEmail,
    fromName,
    toEmail,
    subject,
    bodyText,
    receivedAt,
    warmupId:  warmupM?.[1]?.trim() ?? null,
    rawSource: raw,
  };
}
