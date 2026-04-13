/**
 * Self-hosted email verifier client.
 * Calls the verifier service running on Hetzner.
 *
 * Drop-in replacement for reoon.ts — same output interface.
 *
 * Required env vars:
 *   VERIFIER_URL     — e.g. https://mail.yourdomain.com:3002
 *   VERIFIER_SECRET  — shared secret, must match AGENT_SECRET on the VPS
 */

export interface VerifyResult {
  email:  string;
  status: "valid" | "invalid" | "catch_all" | "disposable" | "unknown";
  score:  number;
}

function verifierUrl(): string {
  const url = process.env.VERIFIER_URL;
  if (!url) throw new Error("VERIFIER_URL is not configured");
  return url.replace(/\/$/, "");
}

function verifierSecret(): string {
  const s = process.env.VERIFIER_SECRET;
  if (!s) throw new Error("VERIFIER_SECRET is not configured");
  return s;
}

async function vFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${verifierUrl()}${path}`, {
    method:  "POST",
    headers: {
      "Content-Type":   "application/json",
      "x-agent-secret": verifierSecret(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(err.error ?? `Verifier error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Verify a batch of emails using the self-hosted SMTP verifier.
 * Sends in batches of 50 to the service, which internally limits concurrency.
 * Falls back to "unknown" on individual failures — never throws.
 */
export async function verifyEmails(emails: string[]): Promise<VerifyResult[]> {
  const results: VerifyResult[] = [];
  const BATCH = 50;

  for (let i = 0; i < emails.length; i += BATCH) {
    const chunk = emails.slice(i, i + BATCH);
    try {
      const { results: batchResults } = await vFetch<{ results: VerifyResult[] }>(
        "/verify/batch",
        { emails: chunk },
      );
      results.push(...batchResults);
    } catch {
      // If the whole batch fails (service down etc.), mark all as unknown
      results.push(...chunk.map(email => ({ email, status: "unknown" as const, score: 0 })));
    }
  }

  return results;
}
