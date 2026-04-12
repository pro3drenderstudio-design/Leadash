/**
 * AWS SES (Simple Email Service) wrapper.
 *
 * Handles:
 *   - Registering a sending domain + getting DKIM tokens for DNS
 *   - Verifying a domain is ready to send
 *   - Generating per-mailbox SMTP credentials via IAM
 *   - SMTP connection settings
 *
 * Docs: https://docs.aws.amazon.com/ses/latest/dg/
 *
 * Required env vars:
 *   AWS_ACCESS_KEY_ID      — IAM user with SESFullAccess + IAMUserSMTPCredentials
 *   AWS_SECRET_ACCESS_KEY  — IAM secret key
 *   AWS_REGION             — e.g. "us-east-1" (SES supported regions)
 *
 * No AWS SDK needed — uses SES HTTP Query API + IAM API directly via fetch + AWS Signature V4.
 */

import { createHmac, createHash } from "crypto";

// ─── AWS Signature V4 ─────────────────────────────────────────────────────────

function getConfig() {
  return {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    region:          process.env.AWS_REGION ?? "us-east-1",
  };
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function hash(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function getSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate    = hmac("AWS4" + secretKey, dateStamp);
  const kRegion  = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function signedFetch(
  service: string,
  host: string,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string>,
): Promise<string> {
  const { accessKeyId, secretAccessKey, region } = getConfig();
  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);

  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders    = "host;x-amz-date";
  const payloadHash      = hash(method === "POST" ? sortedParams : "");

  const canonicalRequest = [
    method,
    path,
    method === "GET" ? sortedParams : "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign    = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${hash(canonicalRequest)}`;
  const signingKey      = getSigningKey(secretAccessKey, dateStamp, region, service);
  const signature       = hmac(signingKey, stringToSign).toString("hex");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = method === "GET"
    ? `https://${host}${path}?${sortedParams}`
    : `https://${host}${path}`;

  return fetch(url, {
    method,
    headers: {
      Host:            host,
      "X-Amz-Date":   amzDate,
      Authorization:   authHeader,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? sortedParams : undefined,
  }).then(r => r.text());
}

function sesHost(region: string) {
  return `email.${region}.amazonaws.com`;
}

function extractXmlValue(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`));
  return m ? m[1].trim() : null;
}

function extractXmlValues(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}

function checkSesError(xml: string): void {
  if (xml.includes("<Error>") || xml.includes("ErrorResponse")) {
    const code    = extractXmlValue(xml, "Code")    ?? "Unknown";
    const message = extractXmlValue(xml, "Message") ?? xml;
    throw new Error(`SES error ${code}: ${message}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register a domain with SES v1 and start DKIM verification.
 * Returns 3 DKIM tokens that must be published as CNAME records in DNS.
 */
export async function registerDomain(domain: string): Promise<{ dkimTokens: string[] }> {
  const { region } = getConfig();
  const host = sesHost(region);

  // Verify domain identity
  const verifyXml = await signedFetch("email", host, "POST", "/", {
    Action:     "VerifyDomainIdentity",
    Domain:     domain,
    Version:    "2010-12-01",
  });
  checkSesError(verifyXml);

  // Request DKIM tokens
  const dkimXml = await signedFetch("email", host, "POST", "/", {
    Action:  "VerifyDomainDkim",
    Domain:  domain,
    Version: "2010-12-01",
  });
  checkSesError(dkimXml);

  const dkimTokens = extractXmlValues(dkimXml, "member");
  if (!dkimTokens.length) throw new Error("SES returned no DKIM tokens");

  return { dkimTokens };
}

/**
 * Check if a domain's identity is verified in SES.
 */
export async function isDomainVerified(domain: string): Promise<boolean> {
  const { region } = getConfig();
  const host = sesHost(region);

  const xml = await signedFetch("email", host, "POST", "/", {
    Action:                          "GetIdentityVerificationAttributes",
    "Identities.member.1":           domain,
    Version:                         "2010-12-01",
  });
  checkSesError(xml);

  const status = extractXmlValue(xml, "VerificationStatus");
  return status === "Success";
}

/**
 * Set the custom MAIL FROM domain so SPF aligns with the From: domain for DMARC.
 * Uses mail.{domain} as the bounce subdomain.
 */
export async function setMailFromDomain(domain: string): Promise<void> {
  const { region } = getConfig();
  const host = sesHost(region);

  const xml = await signedFetch("email", host, "POST", "/", {
    Action:              "SetIdentityMailFromDomain",
    Identity:            domain,
    MailFromDomain:      `mail.${domain}`,
    BehaviorOnMXFailure: "UseDefaultValue",
    Version:             "2010-12-01",
  });
  checkSesError(xml);
}

/**
 * Enable DKIM signing for a domain (must be called after DNS records propagate).
 */
export async function enableDkimSigning(domain: string): Promise<void> {
  const { region } = getConfig();
  const host = sesHost(region);

  const xml = await signedFetch("email", host, "POST", "/", {
    Action:   "SetIdentityDkimEnabled",
    Identity: domain,
    DkimEnabled: "true",
    Version:  "2010-12-01",
  });
  checkSesError(xml);
}

/**
 * Generate SMTP credentials for a specific mailbox email address.
 *
 * SES SMTP passwords are derived from the IAM secret key using a fixed algorithm.
 * No IAM API call needed — this is a pure crypto operation.
 * Docs: https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html
 *
 * The SMTP username is the IAM access key ID.
 * The SMTP password is derived from the secret key + region.
 */
export function getSmtpCredentials(): { host: string; port: number; username: string; password: string } {
  const { accessKeyId, secretAccessKey, region } = getConfig();

  // AWS SES SMTP password derivation algorithm
  const date      = "11111111";
  const service   = "ses";
  const message   = "SendRawEmail";
  const terminal  = "aws4_request";
  const version   = 0x04;

  const kDate     = hmac("AWS4" + secretAccessKey, date);
  const kRegion   = hmac(kDate, region);
  const kService  = hmac(kRegion, service);
  const kTerminal = hmac(kService, terminal);
  const kMessage  = hmac(kTerminal, message);

  const signatureAndVersion = Buffer.concat([Buffer.from([version]), kMessage]);
  const password = signatureAndVersion.toString("base64");

  return {
    host:     `email-smtp.${region}.amazonaws.com`,
    port:     587,
    username: accessKeyId,
    password,
  };
}

/**
 * Returns IMAP settings. SES does not provide IMAP — for reply detection
 * we rely on SES inbound email rules routing to S3 or SNS.
 * For now, return null to indicate no IMAP available via SES.
 * The warmup/reply runner should handle SES inbound separately.
 */
export function getImapSettings(): null {
  return null;
}
