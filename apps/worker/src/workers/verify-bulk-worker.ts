// ─── Verify Bulk Worker ────────────────────────────────────────────────────────
// Processes standalone bulk email verification jobs (not tied to a campaign).
// Handles 50k+ emails without any timeout constraint.

import type { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";

const CONCURRENCY = 20;   // parallel Reoon requests per batch
const REOON_BASE  = "https://emailverifier.reoon.com/api/v1";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VerifyBulkJobData {
  job_id:       string;
  workspace_id: string;
}

interface VerifyResult {
  email:  string;
  status: string;
  score:  number;
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

function getDb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ─── Reoon ────────────────────────────────────────────────────────────────────

async function verifySingle(apiKey: string, email: string): Promise<VerifyResult> {
  try {
    const url = `${REOON_BASE}/verify?email=${encodeURIComponent(email)}&key=${apiKey}&mode=power`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { email, status: "unknown", score: 0 };
    const d = await res.json() as Record<string, unknown>;
    return {
      email:  (d.email  as string) ?? email,
      status: (d.status as string) ?? "unknown",
      score:  typeof d.overall_score === "number" ? d.overall_score : 0,
    };
  } catch {
    return { email, status: "unknown", score: 0 };
  }
}

// ─── Main processor ───────────────────────────────────────────────────────────

export async function processVerifyBulk(job: Job<VerifyBulkJobData>): Promise<void> {
  const { job_id, workspace_id } = job.data;
  const db     = getDb();
  const apiKey = process.env.REOON_API_KEY;

  if (!apiKey) {
    await db.from("lead_verification_jobs")
      .update({ status: "failed", error: "REOON_API_KEY not configured" })
      .eq("id", job_id);
    return;
  }

  // Fetch the job record (contains the email list)
  const { data: jobRecord, error } = await db
    .from("lead_verification_jobs")
    .select("id, emails, total, workspace_id")
    .eq("id", job_id)
    .eq("workspace_id", workspace_id)
    .single();

  if (error || !jobRecord) {
    console.error(`[verify-bulk] ${job_id}: job record not found`);
    return;
  }

  const emails = (jobRecord.emails as string[]) ?? [];
  if (!emails.length) {
    await db.from("lead_verification_jobs")
      .update({ status: "done", processed: 0, completed_at: now() })
      .eq("id", job_id);
    return;
  }

  // Mark running
  await db.from("lead_verification_jobs")
    .update({ status: "running" })
    .eq("id", job_id);

  console.log(`[verify-bulk] ${job_id}: START ${emails.length} emails`);

  const allResults: VerifyResult[] = [];
  let lastDbUpdate = Date.now();

  try {
    for (let i = 0; i < emails.length; i += CONCURRENCY) {
      const chunk   = emails.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(chunk.map(e => verifySingle(apiKey, e)));
      const batch   = settled.map((s, j) =>
        s.status === "fulfilled" ? s.value : { email: chunk[j], status: "unknown", score: 0 },
      );
      allResults.push(...batch);

      // Update processed count every 5s (not every batch — reduces DB load)
      if (Date.now() - lastDbUpdate > 5_000) {
        await db.from("lead_verification_jobs")
          .update({ processed: allResults.length })
          .eq("id", job_id);
        lastDbUpdate = Date.now();
        await job.updateProgress({ processed: allResults.length, total: emails.length });
      }
    }

    // Compute status counts
    const counts = allResults.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    await db.from("lead_verification_jobs").update({
      status:       "done",
      processed:    allResults.length,
      results:      allResults,
      safe:         counts.safe        ?? 0,
      invalid:      counts.invalid     ?? 0,
      catch_all:    counts.catch_all   ?? 0,
      risky:        counts.risky       ?? 0,
      dangerous:    counts.dangerous   ?? 0,
      disposable:   counts.disposable  ?? 0,
      unknown:      counts.unknown     ?? 0,
      completed_at: now(),
    }).eq("id", job_id);

    console.log(`[verify-bulk] ${job_id}: DONE ${allResults.length} emails`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[verify-bulk] ${job_id}: FAILED`, msg);
    await db.from("lead_verification_jobs")
      .update({ status: "failed", error: msg, processed: allResults.length })
      .eq("id", job_id);
  }
}

function now() { return new Date().toISOString(); }
