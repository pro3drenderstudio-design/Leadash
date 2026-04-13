// ─── Reoon Email Verifier API ─────────────────────────────────────────────────

const REOON_BASE = "https://emailverifier.reoon.com/api/v1";

export interface ReoonResult {
  email:  string;
  status: "valid" | "invalid" | "catch_all" | "disposable" | "unknown";
  score:  number; // 0–100
}

// Verifies a batch of emails — Reoon supports single verification only,
// so we parallelize with concurrency cap of 10.
export async function verifyEmails(
  apiKey: string,
  emails: string[],
): Promise<ReoonResult[]> {
  const CONCURRENCY = 10;
  const results: ReoonResult[] = [];

  for (let i = 0; i < emails.length; i += CONCURRENCY) {
    const batch = emails.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(email => verifySingle(apiKey, email)),
    );
    for (let j = 0; j < batch.length; j++) {
      const s = settled[j];
      if (s.status === "fulfilled") {
        results.push(s.value);
      } else {
        results.push({ email: batch[j], status: "unknown", score: 0 });
      }
    }
  }
  return results;
}

async function verifySingle(apiKey: string, email: string): Promise<ReoonResult> {
  const url = `${REOON_BASE}/verify?email=${encodeURIComponent(email)}&key=${apiKey}&mode=power`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Reoon API error ${res.status}`);
  const data = await res.json();
  return {
    email:  data.email ?? email,
    status: mapReoonStatus(data.status),
    score:  typeof data.overall_score === "number" ? data.overall_score : 0,
  };
}

function mapReoonStatus(raw: string): ReoonResult["status"] {
  switch (raw?.toLowerCase()) {
    case "safe":
    case "valid":       return "valid";
    case "invalid":
    case "dangerous":   return "invalid";
    case "catch_all":
    case "catchall":    return "catch_all";
    case "disposable":  return "disposable";
    case "risky":       return "unknown";
    default:            return "unknown";
  }
}
