// ─── Verify Bulk Worker ────────────────────────────────────────────────────────
// Two modes:
//   list mode  — list_id set, streams outreach_leads directly, updates them in-place
//   email mode — emails[] stored in job row (standalone verify tool, unchanged)

import type { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";

const CONCURRENCY       = 100;  // parallel Reoon requests (power mode; 200 caused rate limits, testing 100)
const BATCH_SIZE        = 500;  // leads fetched per loop iteration
const CREDITS_PER       = 0.5;
const REOON_BASE        = "https://emailverifier.reoon.com/api/v1";
const UNKNOWN_ABORT_PCT = 0.85; // abort if >85% of a batch comes back unknown (Reoon down)

// Statuses the DB constraint currently allows (migration 033 expands this — until then, map the rest)
const ALLOWED_STATUSES = new Set(["pending","valid","invalid","catch_all","disposable","unknown","safe","risky","dangerous","verified_external"]);

const STATUS_MAP: Record<string, string> = {
  safe:              "valid",
  verified_external: "valid",
  dangerous:         "invalid",
  risky:             "unknown",
};

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
    // Reoon returns {"status":"error"} when rate-limited — treat as transient unknown
    if (d.status === "error") return { email, status: "unknown", score: 0 };
    return {
      email:  (d.email  as string) ?? email,
      status: (d.status as string) || "unknown",
      score:  typeof d.overall_score === "number" ? d.overall_score : 0,
    };
  } catch {
    return { email, status: "unknown", score: 0 };
  }
}

async function verifyBatch(
  apiKey: string,
  emails: string[],
  onChunk?: (results: VerifyResult[]) => Promise<void>,
): Promise<VerifyResult[]> {
  const results: VerifyResult[] = [];
  for (let i = 0; i < emails.length; i += CONCURRENCY) {
    const chunk   = emails.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map(e => verifySingle(apiKey, e)));
    const chunkResults: VerifyResult[] = [];
    for (let j = 0; j < chunk.length; j++) {
      const s = settled[j];
      chunkResults.push(s.status === "fulfilled" ? s.value : { email: chunk[j], status: "unknown", score: 0 });
    }
    results.push(...chunkResults);
    if (onChunk) await onChunk(chunkResults);
  }
  return results;
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

  const { data: jobRecord, error } = await db
    .from("lead_verification_jobs")
    .select("id, list_id, emails, total, workspace_id, credits_deducted")
    .eq("id", job_id)
    .eq("workspace_id", workspace_id)
    .single();

  if (error || !jobRecord) {
    console.error(`[verify-bulk] ${job_id}: job record not found`);
    return;
  }

  const listId     = jobRecord.list_id  as string | null;
  const isListMode = !!listId;

  await db.from("lead_verification_jobs")
    .update({ status: "running", started_at: now() })
    .eq("id", job_id);

  console.log(`[verify-bulk] ${job_id}: START mode=${isListMode ? "list" : "emails"} total=${jobRecord.total}`);

  let processed     = 0;
  let safe          = 0;
  let catchAll      = 0;
  let invalid       = 0;
  let risky         = 0;
  let dangerous     = 0;
  let disposable    = 0;
  let unknown       = 0;
  let totalRefunded = 0;
  let lastDbUpdate  = Date.now();

  try {
    if (isListMode) {
      // ── List mode: stream outreach_leads, update in-place ──────────────────
      while (true) {
        // Check for cancellation before each batch
        const { data: statusCheck } = await db
          .from("lead_verification_jobs").select("status").eq("id", job_id).single();
        if (statusCheck?.status === "cancelled") {
          console.log(`[verify-bulk] ${job_id}: cancelled by user`);
          break;
        }

        type LeadRow = { id: string; email: string };
        const { data: leads } = await db
          .from("outreach_leads")
          .select("id, email")
          .eq("list_id", listId)
          .eq("workspace_id", workspace_id)
          .is("verified_at", null)
          .limit(BATCH_SIZE);

        if (!leads?.length) break;

        const rows      = leads as LeadRow[];
        const nowStr    = now();
        let chunkOffset = 0;

        let batchSafe = 0, batchCatchAll = 0, batchInvalid = 0;
        let batchRisky = 0, batchDangerous = 0, batchDisposable = 0, batchUnknown = 0;

        // Stream per-chunk: write DB + update progress after every CONCURRENCY-sized slice
        await verifyBatch(apiKey, rows.map(l => l.email), async (chunkResults) => {
          const chunkUpdates = chunkResults.map((r, j) => {
            const st = r.status;
            if      (st === "safe")        batchSafe++;
            else if (st === "catch_all")   batchCatchAll++;
            else if (st === "unknown")     batchUnknown++;
            else if (st === "risky")       batchRisky++;
            else if (st === "dangerous")   batchDangerous++;
            else if (st === "disposable")  batchDisposable++;
            else                           batchInvalid++;
            const mapped = STATUS_MAP[st] ?? st;
            const dbStatus = ALLOWED_STATUSES.has(mapped) ? mapped : "unknown";
            if (!ALLOWED_STATUSES.has(mapped)) console.warn(`[verify-bulk] unexpected Reoon status: "${st}" → "${mapped}" → fallback "unknown"`);
            return {
              id:                  rows[chunkOffset + j].id,
              verification_status: dbStatus,
              verification_score:  r.score,
              verified_at:         nowStr,
            };
          });
          chunkOffset += chunkResults.length;

          // Write chunk updates immediately (≤CONCURRENCY=20 rows per round)
          const dbResults = await Promise.all(
            chunkUpdates.map(u =>
              db.from("outreach_leads")
                .update({
                  verification_status: u.verification_status,
                  verification_score:  u.verification_score,
                  verified_at:         u.verified_at,
                })
                .eq("id", u.id),
            ),
          );
          const firstErr = dbResults.find(r => r.error);
          if (firstErr?.error) console.error(`[verify-bulk] ${job_id}: update failed`, firstErr.error.message);

          processed += chunkResults.length;

          // Throttled job-progress update — every 3s
          if (Date.now() - lastDbUpdate > 3_000) {
            await db.from("lead_verification_jobs").update({
              processed,
              safe:       safe + batchSafe,
              catch_all:  catchAll + batchCatchAll,
              invalid:    invalid + batchInvalid,
              risky:      risky + batchRisky,
              dangerous:  dangerous + batchDangerous,
              disposable: disposable + batchDisposable,
              unknown:    unknown + batchUnknown,
              refunded:   Math.round(totalRefunded * 10) / 10,
            }).eq("id", job_id);
            await job.updateProgress({ processed, total: jobRecord.total as number });
            lastDbUpdate = Date.now();
          }
        });

        // Abort if Reoon appears to be down (85%+ unknowns in a batch of ≥50 leads)
        const batchTotal = batchSafe + batchCatchAll + batchInvalid + batchRisky + batchDangerous + batchDisposable + batchUnknown;
        if (batchTotal >= 50 && batchUnknown / batchTotal > UNKNOWN_ABORT_PCT) {
          throw new Error(`Reoon API appears to be down — ${batchUnknown}/${batchTotal} results were unknown. Credits for unprocessed leads will be refunded.`);
        }

        // Refund unknowns — Reoon doesn't charge for these
        const batchRefund = Math.round(batchUnknown * CREDITS_PER * 10) / 10;
        if (batchRefund > 0) {
          await Promise.all([
            db.rpc("refund_lead_credits", { p_workspace_id: workspace_id, p_amount: batchRefund }),
            db.from("lead_credit_transactions").insert({
              workspace_id,
              type:        "refund",
              amount:      batchRefund,
              description: `Verification refund — ${batchUnknown} unknown result${batchUnknown !== 1 ? "s" : ""}`,
            }),
          ]);
        }

        // Commit batch counters to outer totals
        safe          += batchSafe;
        catchAll      += batchCatchAll;
        invalid       += batchInvalid;
        risky         += batchRisky;
        dangerous     += batchDangerous;
        disposable    += batchDisposable;
        unknown       += batchUnknown;
        totalRefunded += batchRefund;

        // Final progress flush for this batch
        await db.from("lead_verification_jobs").update({
          processed,
          safe,
          catch_all:  catchAll,
          invalid,
          risky,
          dangerous,
          disposable,
          unknown,
          refunded:   Math.round(totalRefunded * 10) / 10,
        }).eq("id", job_id);
        await job.updateProgress({ processed, total: jobRecord.total as number });
        lastDbUpdate = Date.now();

        console.log(`[verify-bulk] ${job_id}: ${processed}/${jobRecord.total} processed`);
      }

    } else {
      // ── Email mode: existing standalone-tool behaviour ─────────────────────
      const emails = (jobRecord.emails as string[]) ?? [];
      const allResults: VerifyResult[] = [];

      for (let i = 0; i < emails.length; i += BATCH_SIZE) {
        const results = await verifyBatch(apiKey, emails.slice(i, i + BATCH_SIZE));
        allResults.push(...results);

        for (const r of results) {
          const st = r.status;
          if      (st === "safe")       safe++;
          else if (st === "catch_all")  catchAll++;
          else if (st === "unknown")    unknown++;
          else if (st === "risky")      risky++;
          else if (st === "dangerous")  dangerous++;
          else if (st === "disposable") disposable++;
          else                          invalid++;
        }
        processed += results.length;

        if (Date.now() - lastDbUpdate > 3_000) {
          await db.from("lead_verification_jobs").update({
            processed, safe, catch_all: catchAll, invalid,
            risky, dangerous, disposable, unknown,
          }).eq("id", job_id);
          await job.updateProgress({ processed, total: emails.length });
          lastDbUpdate = Date.now();
        }
      }

      // Store full results for the standalone tool's download feature
      await db.from("lead_verification_jobs")
        .update({ results: allResults })
        .eq("id", job_id);
    }

    // ── Finalize ──────────────────────────────────────────────────────────────
    const deducted    = (jobRecord.credits_deducted as number) ?? 0;
    const creditsUsed = Math.round(Math.max(0, deducted - totalRefunded) * 10) / 10;

    await db.from("lead_verification_jobs").update({
      status:       "done",
      processed,
      safe,
      catch_all:    catchAll,
      invalid,
      risky,
      dangerous,
      disposable,
      unknown,
      credits_used: creditsUsed,
      refunded:     Math.round(totalRefunded * 10) / 10,
      completed_at: now(),
    }).eq("id", job_id);

    console.log(`[verify-bulk] ${job_id}: DONE — ${processed} verified, ${totalRefunded} cr refunded`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[verify-bulk] ${job_id}: FAILED`, msg);

    // Refund unprocessed credits for list-mode jobs (upfront deduction)
    if (isListMode) {
      const deducted         = (jobRecord.credits_deducted as number) ?? 0;
      const creditsProcessed = Math.round(processed * CREDITS_PER * 10) / 10;
      const unprocessed      = Math.round(Math.max(0, deducted - creditsProcessed - totalRefunded) * 10) / 10;
      if (unprocessed > 0) {
        await db.rpc("refund_lead_credits", { p_workspace_id: workspace_id, p_amount: unprocessed });
        await db.from("lead_credit_transactions").insert({
          workspace_id,
          type:        "refund",
          amount:      unprocessed,
          description: "Verification failed — unprocessed leads refund",
        });
        totalRefunded += unprocessed;
      }
    }

    await db.from("lead_verification_jobs").update({
      status:       "failed",
      error:        msg,
      processed,
      safe,
      catch_all:    catchAll,
      invalid,
      risky,
      dangerous,
      disposable,
      unknown,
      refunded:     Math.round(totalRefunded * 10) / 10,
      completed_at: now(),
    }).eq("id", job_id);
  }
}

function now() { return new Date().toISOString(); }
