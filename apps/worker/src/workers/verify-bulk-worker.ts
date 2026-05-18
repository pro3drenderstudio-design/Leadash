// ─── Verify Bulk Worker ────────────────────────────────────────────────────────
// Two modes:
//   list mode  — list_id set, streams outreach_leads directly, updates them in-place
//   email mode — emails[] stored in job row (standalone verify tool)
//
// Both modes now use Reoon's bulk API (up to 50k emails per task) instead of
// individual requests. Progress is polled from Reoon every 15s.

import type { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";

const BULK_CHUNK      = 50_000; // max emails per Reoon bulk task
const DB_CHUNK        = 100;    // rows per Supabase update batch
const CREDITS_PER     = 0.5;
const POLL_MS         = 15_000; // how often to poll Reoon for task progress
const UNKNOWN_ABORT_PCT = 0.85; // abort if >85% of a batch comes back unknown

const REOON_BASE = "https://emailverifier.reoon.com/api/v1";

// Statuses the DB constraint allows; anything else falls back to "unknown"
const ALLOWED_STATUSES = new Set([
  "pending","valid","invalid","catch_all","disposable","unknown",
  "safe","risky","dangerous","verified_external",
]);

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

interface BulkPollResult {
  status:              "waiting" | "running" | "completed";
  count_total:         number;
  count_checked:       number;
  progress_percentage: number;
  results?: Record<string, { status?: string; overall_score?: number }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

function getDb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ─── Reoon bulk API ───────────────────────────────────────────────────────────

async function submitBulkTask(apiKey: string, emails: string[]): Promise<string> {
  const res = await fetch(`${REOON_BASE}/create-bulk-verification-task/`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ key: apiKey, emails }),
    signal:  AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Reoon bulk submit failed: HTTP ${res.status}`);
  const d = await res.json() as Record<string, unknown>;
  const taskId = d.task_id as string | undefined;
  if (!taskId) throw new Error(`Reoon bulk submit: no task_id in response — ${JSON.stringify(d)}`);
  return taskId;
}

async function pollBulkTask(apiKey: string, taskId: string): Promise<BulkPollResult> {
  const url = `${REOON_BASE}/get-result-bulk-verification-task/?key=${encodeURIComponent(apiKey)}&task_id=${encodeURIComponent(taskId)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Reoon poll failed: HTTP ${res.status}`);
  return await res.json() as BulkPollResult;
}

// Map a Reoon status string to a safe DB value
function mapStatus(raw: string): string {
  const st     = raw || "unknown";
  const mapped = STATUS_MAP[st] ?? st;
  if (!ALLOWED_STATUSES.has(mapped)) {
    console.warn(`[verify-bulk] unexpected Reoon status "${st}" — storing as "unknown"`);
    return "unknown";
  }
  return mapped;
}

// Count a status into the batch accumulators
function countStatus(st: string, acc: ReturnType<typeof freshAccumulators>) {
  if      (st === "safe")        acc.batchSafe++;
  else if (st === "catch_all")   acc.batchCatchAll++;
  else if (st === "unknown")     acc.batchUnknown++;
  else if (st === "risky")       acc.batchRisky++;
  else if (st === "dangerous")   acc.batchDangerous++;
  else if (st === "disposable")  acc.batchDisposable++;
  else                           acc.batchInvalid++;
}

function freshAccumulators() {
  return { batchSafe: 0, batchCatchAll: 0, batchInvalid: 0, batchRisky: 0, batchDangerous: 0, batchDisposable: 0, batchUnknown: 0 };
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

  const listId     = jobRecord.list_id as string | null;
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

  try {
    if (isListMode) {
      // ── List mode ─────────────────────────────────────────────────────────
      while (true) {
        // Cancellation check before each chunk
        const { data: sc } = await db.from("lead_verification_jobs").select("status").eq("id", job_id).single();
        if (sc?.status === "cancelled") { console.log(`[verify-bulk] ${job_id}: cancelled`); break; }

        type LeadRow = { id: string; email: string };
        const { data: leads } = await db
          .from("outreach_leads")
          .select("id, email")
          .eq("list_id", listId)
          .eq("workspace_id", workspace_id)
          .is("verified_at", null)
          .limit(BULK_CHUNK);

        if (!leads?.length) break;

        const rows     = leads as LeadRow[];
        const emailMap = new Map(rows.map(r => [r.email.toLowerCase(), r]));

        console.log(`[verify-bulk] ${job_id}: submitting ${rows.length} emails to Reoon bulk API`);
        const taskId = await submitBulkTask(apiKey, rows.map(r => r.email));
        console.log(`[verify-bulk] ${job_id}: task_id=${taskId}`);

        // ── Poll until Reoon finishes ──────────────────────────────────────
        const batchStart = processed;
        let   taskResult: BulkPollResult | null = null;

        while (true) {
          await sleep(POLL_MS);

          const { data: cc } = await db.from("lead_verification_jobs").select("status").eq("id", job_id).single();
          if (cc?.status === "cancelled") { console.log(`[verify-bulk] ${job_id}: cancelled during poll`); return; }

          taskResult = await pollBulkTask(apiKey, taskId);
          console.log(`[verify-bulk] ${job_id}: poll status=${taskResult.status} ${taskResult.count_checked}/${taskResult.count_total} (${taskResult.progress_percentage}%)`);

          // Update progress display from Reoon's count
          const displayProcessed = batchStart + (taskResult.count_checked ?? 0);
          await db.from("lead_verification_jobs").update({ processed: displayProcessed }).eq("id", job_id);
          await job.updateProgress({ processed: displayProcessed, total: jobRecord.total as number });

          if (taskResult.status === "completed") break;
        }

        if (!taskResult?.results) {
          console.error(`[verify-bulk] ${job_id}: task completed but no results returned`);
          break;
        }

        // ── Process results ────────────────────────────────────────────────
        const acc    = freshAccumulators();
        const nowStr = now();
        const updates: { id: string; verification_status: string; verification_score: number; verified_at: string }[] = [];

        for (const [email, result] of Object.entries(taskResult.results)) {
          const lead = emailMap.get(email.toLowerCase());
          if (!lead) continue;
          const st = (result.status as string) || "unknown";
          countStatus(st, acc);
          updates.push({
            id:                  lead.id,
            verification_status: mapStatus(st),
            verification_score:  typeof result.overall_score === "number" ? result.overall_score : 0,
            verified_at:         nowStr,
          });
        }

        // Abort if service appears down
        if (updates.length >= 50 && acc.batchUnknown / updates.length > UNKNOWN_ABORT_PCT) {
          throw new Error(`Email verification service returned too many unknown results — ${acc.batchUnknown}/${updates.length}. Credits for unprocessed leads will be refunded.`);
        }

        // Write to DB in chunks
        for (let ci = 0; ci < updates.length; ci += DB_CHUNK) {
          const chunk = updates.slice(ci, ci + DB_CHUNK);
          const res   = await Promise.all(
            chunk.map(u =>
              db.from("outreach_leads")
                .update({ verification_status: u.verification_status, verification_score: u.verification_score, verified_at: u.verified_at })
                .eq("id", u.id),
            ),
          );
          const err = res.find(r => r.error);
          if (err?.error) console.error(`[verify-bulk] ${job_id}: DB update error`, err.error.message);
        }

        // Refund unknowns (Reoon doesn't charge for these)
        const batchRefund = Math.round(acc.batchUnknown * CREDITS_PER * 10) / 10;
        if (batchRefund > 0) {
          await Promise.all([
            db.rpc("refund_lead_credits", { p_workspace_id: workspace_id, p_amount: batchRefund }),
            db.from("lead_credit_transactions").insert({
              workspace_id,
              type:        "refund",
              amount:      batchRefund,
              description: `Verification refund — ${acc.batchUnknown} unknown result${acc.batchUnknown !== 1 ? "s" : ""}`,
            }),
          ]);
        }

        // Accumulate outer totals
        processed     += rows.length;
        safe          += acc.batchSafe;
        catchAll      += acc.batchCatchAll;
        invalid       += acc.batchInvalid;
        risky         += acc.batchRisky;
        dangerous     += acc.batchDangerous;
        disposable    += acc.batchDisposable;
        unknown       += acc.batchUnknown;
        totalRefunded += batchRefund;

        await db.from("lead_verification_jobs").update({
          processed, safe, catch_all: catchAll, invalid, risky, dangerous, disposable, unknown,
          refunded: Math.round(totalRefunded * 10) / 10,
        }).eq("id", job_id);
        await job.updateProgress({ processed, total: jobRecord.total as number });

        console.log(`[verify-bulk] ${job_id}: ${processed}/${jobRecord.total} total processed`);
      }

    } else {
      // ── Email mode (standalone verify tool) ───────────────────────────────
      const emails = (jobRecord.emails as string[]) ?? [];
      if (!emails.length) throw new Error("No emails in job record");

      console.log(`[verify-bulk] ${job_id}: submitting ${emails.length} emails to Reoon bulk API`);
      const taskId = await submitBulkTask(apiKey, emails);
      console.log(`[verify-bulk] ${job_id}: task_id=${taskId}`);

      // Poll until done
      let taskResult: BulkPollResult | null = null;

      while (true) {
        await sleep(POLL_MS);

        const { data: cc } = await db.from("lead_verification_jobs").select("status").eq("id", job_id).single();
        if (cc?.status === "cancelled") { console.log(`[verify-bulk] ${job_id}: cancelled`); return; }

        taskResult = await pollBulkTask(apiKey, taskId);
        console.log(`[verify-bulk] ${job_id}: poll status=${taskResult.status} ${taskResult.count_checked}/${taskResult.count_total} (${taskResult.progress_percentage}%)`);

        processed = taskResult.count_checked ?? 0;
        await db.from("lead_verification_jobs").update({ processed }).eq("id", job_id);
        await job.updateProgress({ processed, total: emails.length });

        if (taskResult.status === "completed") break;
      }

      if (!taskResult?.results) throw new Error("Task completed but no results returned");

      // Process + count
      const allResults: { email: string; status: string; score: number }[] = [];
      for (const [email, r] of Object.entries(taskResult.results)) {
        const st = (r.status as string) || "unknown";
        if      (st === "safe")        safe++;
        else if (st === "catch_all")   catchAll++;
        else if (st === "unknown")     unknown++;
        else if (st === "risky")       risky++;
        else if (st === "dangerous")   dangerous++;
        else if (st === "disposable")  disposable++;
        else                           invalid++;
        allResults.push({ email, status: mapStatus(st), score: typeof r.overall_score === "number" ? r.overall_score : 0 });
      }
      processed = allResults.length;

      // Store results for download
      await db.from("lead_verification_jobs").update({ results: allResults }).eq("id", job_id);
    }

    // ── Finalize ─────────────────────────────────────────────────────────────
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

    // Refund unprocessed credits for list-mode jobs
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
