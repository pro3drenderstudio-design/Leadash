// ─── Verify Bulk Worker ────────────────────────────────────────────────────────
// Two modes:
//   list mode  — list_id set, streams outreach_leads directly, updates them in-place
//   email mode — emails[] stored in job row (standalone verify tool, unchanged)

import type { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";

const CONCURRENCY  = 20;   // parallel Reoon requests — higher rates trigger 429s
const BATCH_SIZE   = 500;  // leads fetched per loop iteration
const DB_CHUNK     = 100;  // max rows per Supabase update batch
const CREDITS_PER  = 0.5;
const REOON_BASE   = "https://emailverifier.reoon.com/api/v1";
const ALLOWED      = new Set(["safe", "valid", "catch_all", "verified_external"]);

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
      status: (d.status as string) ?? "unknown",
      score:  typeof d.overall_score === "number" ? d.overall_score : 0,
    };
  } catch {
    return { email, status: "unknown", score: 0 };
  }
}

async function verifyBatch(apiKey: string, emails: string[]): Promise<VerifyResult[]> {
  const results: VerifyResult[] = [];
  for (let i = 0; i < emails.length; i += CONCURRENCY) {
    const chunk   = emails.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map(e => verifySingle(apiKey, e)));
    for (let j = 0; j < chunk.length; j++) {
      const s = settled[j];
      results.push(s.status === "fulfilled" ? s.value : { email: chunk[j], status: "unknown", score: 0 });
    }
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
        type LeadRow = { id: string; email: string };
        const { data: leads } = await db
          .from("outreach_leads")
          .select("id, email")
          .eq("list_id", listId)
          .eq("workspace_id", workspace_id)
          .is("verified_at", null)
          .limit(BATCH_SIZE);

        if (!leads?.length) break;

        const rows    = leads as LeadRow[];
        const results = await verifyBatch(apiKey, rows.map(l => l.email));

        const nowStr = now();

        let batchSafe = 0, batchCatchAll = 0, batchInvalid = 0;
        let batchRisky = 0, batchDangerous = 0, batchDisposable = 0, batchUnknown = 0;

        // Use index-based matching — position in results always matches rows
        const updates = results.map((r, i) => {
          const st = r.status;
          if      (st === "safe")        batchSafe++;
          else if (st === "catch_all")   batchCatchAll++;
          else if (st === "unknown")     batchUnknown++;
          else if (st === "risky")       batchRisky++;
          else if (st === "dangerous")   batchDangerous++;
          else if (st === "disposable")  batchDisposable++;
          else                           batchInvalid++;
          return {
            id:                  rows[i].id,
            verification_status: st,
            verification_score:  r.score,
            verified_at:         nowStr,
          };
        });

        // UPDATE (not upsert) — upsert requires all NOT NULL columns on the insert
        // path even when a conflict is guaranteed; individual updates avoid that.
        const updateResults = await Promise.all(
          updates.map(u =>
            db.from("outreach_leads")
              .update({
                verification_status: u.verification_status,
                verification_score:  u.verification_score,
                verified_at:         u.verified_at,
              })
              .eq("id", u.id),
          ),
        );
        const firstErr = updateResults.find(r => r.error);
        if (firstErr?.error) console.error(`[verify-bulk] ${job_id}: update failed`, firstErr.error.message);

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

        processed   += results.length;
        safe        += batchSafe;
        catchAll    += batchCatchAll;
        invalid     += batchInvalid;
        risky       += batchRisky;
        dangerous   += batchDangerous;
        disposable  += batchDisposable;
        unknown     += batchUnknown;
        totalRefunded += batchRefund;

        // Throttle DB progress updates — every 3s is plenty
        if (Date.now() - lastDbUpdate > 3_000) {
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
        }

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
