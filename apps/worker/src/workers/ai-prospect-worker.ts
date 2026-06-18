// ─── AI Prospect Enrichment Worker ────────────────────────────────────────────
// Phase 1: Discover DB lookup for each result (domain + title fuzzy match)
// Phase 2: Batch-verify all best emails via admin-configured verifier
//           (admin_settings.verifier_provider = "reoon" | "leadash")
// Phase 3: Write results back, mark search done

import type { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiProspectJobData {
  search_id:    string;
  workspace_id: string;
}

interface EnrichedRow {
  id:               string;
  discover_email:   string | null;
  best_email:       string | null;
  best_email_source: "discover" | "ai";
}

interface BulkPollResult {
  status:              "waiting" | "running" | "completed";
  count_total:         number;
  count_checked:       number;
  progress_percentage: number;
  results?: Record<string, { status?: string }>;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const POLL_MS         = 12_000;
const REOON_BASE      = "https://emailverifier.reoon.com/api/v1";
const LEADASH_BASE    = () => (process.env.VERIFIER_URL  ?? "").replace(/\/$/, "");
const LEADASH_SECRET  = () =>  process.env.VERIFIER_SECRET ?? "";

// Statuses the DB CHECK constraint allows
const ALLOWED = new Set(["pending","valid","invalid","catch_all","disposable","unknown","risky","dangerous"]);

const STATUS_MAP: Record<string, string> = {
  safe:              "valid",
  verified_external: "valid",
  dangerous:         "invalid",
  risky:             "unknown",
};

function mapStatus(raw: string): string {
  const st     = raw || "unknown";
  const mapped = STATUS_MAP[st] ?? st;
  return ALLOWED.has(mapped) ? mapped : "unknown";
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─── DB clients ───────────────────────────────────────────────────────────────

function getDb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

let _leadsDb: ReturnType<typeof postgres> | null = null;
function getLeadsDb() {
  if (!_leadsDb) {
    const url = process.env.LEADS_DB_URL;
    if (!url) throw new Error("LEADS_DB_URL not set");
    _leadsDb = postgres(url, { max: 5, idle_timeout: 30, connect_timeout: 10, prepare: false, ssl: false });
  }
  return _leadsDb;
}

// ─── Verifier: read admin setting ────────────────────────────────────────────

async function getVerifierProvider(db: ReturnType<typeof getDb>): Promise<"reoon" | "leadash"> {
  try {
    const { data } = await db
      .from("admin_settings")
      .select("value")
      .eq("key", "verifier_provider")
      .maybeSingle();
    if (data?.value === "leadash") return "leadash";
  } catch { /* default */ }
  return "reoon";
}

// ─── Reoon bulk verify ────────────────────────────────────────────────────────

async function reoonVerifyBatch(apiKey: string, emails: string[]): Promise<Map<string, string>> {
  const submitRes = await fetch(`${REOON_BASE}/create-bulk-verification-task/`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ key: apiKey, emails }),
    signal:  AbortSignal.timeout(30_000),
  });
  if (!submitRes.ok) throw new Error(`Reoon submit: HTTP ${submitRes.status}`);
  const sd = await submitRes.json() as Record<string, unknown>;
  const taskId = sd.task_id as string | undefined;
  if (!taskId) throw new Error(`Reoon submit: no task_id — ${JSON.stringify(sd)}`);

  while (true) {
    await sleep(POLL_MS);
    const pollUrl = `${REOON_BASE}/get-result-bulk-verification-task/?key=${encodeURIComponent(apiKey)}&task_id=${encodeURIComponent(taskId)}`;
    const pr = await fetch(pollUrl, { signal: AbortSignal.timeout(30_000) });
    if (!pr.ok) throw new Error(`Reoon poll: HTTP ${pr.status}`);
    const pd = await pr.json() as BulkPollResult;
    if (pd.status === "completed" && pd.results) {
      const map = new Map<string, string>();
      for (const [email, r] of Object.entries(pd.results)) {
        map.set(email.toLowerCase(), mapStatus(r.status ?? "unknown"));
      }
      return map;
    }
  }
}

// ─── Leadash verifier bulk verify ────────────────────────────────────────────

async function leadashVerifyBatch(emails: string[]): Promise<Map<string, string>> {
  const base   = LEADASH_BASE();
  const secret = LEADASH_SECRET();
  if (!base) throw new Error("VERIFIER_URL not configured");

  const submitRes = await fetch(`${base}/tasks`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "x-agent-secret": secret },
    body:    JSON.stringify({ emails }),
    signal:  AbortSignal.timeout(30_000),
  });
  if (!submitRes.ok) throw new Error(`Leadash verifier submit: HTTP ${submitRes.status}`);
  const sd = await submitRes.json() as Record<string, unknown>;
  const taskId = sd.task_id as string | undefined;
  if (!taskId) throw new Error(`Leadash submit: no task_id — ${JSON.stringify(sd)}`);

  while (true) {
    await sleep(POLL_MS);
    const pr = await fetch(`${base}/tasks/${encodeURIComponent(taskId)}`, {
      headers: { "x-agent-secret": secret },
      signal:  AbortSignal.timeout(30_000),
    });
    if (!pr.ok) throw new Error(`Leadash verifier poll: HTTP ${pr.status}`);
    const pd = await pr.json() as BulkPollResult;
    if (pd.status === "completed" && pd.results) {
      const map = new Map<string, string>();
      for (const [email, r] of Object.entries(pd.results)) {
        map.set(email.toLowerCase(), mapStatus(r.status ?? "unknown"));
      }
      return map;
    }
  }
}

// ─── Discover DB lookup ───────────────────────────────────────────────────────

async function lookupDiscoverEmail(domain: string, title: string): Promise<string | null> {
  try {
    const leadsDb = getLeadsDb();
    const rows = await leadsDb.unsafe<{ email: string }[]>(`
      SELECT dp.email
      FROM discover_people dp
      JOIN discover_companies dc ON dp.company_id = dc.id
      WHERE lower(dc.domain) = lower($1)
        AND dp.email IS NOT NULL AND dp.email <> ''
      ORDER BY similarity(coalesce(dp.title,''), $2) DESC, dp.id
      LIMIT 1
    `, [domain, title]);
    return rows[0]?.email ?? null;
  } catch {
    return null;
  }
}

// ─── Main processor ───────────────────────────────────────────────────────────

export async function processAiProspect(job: Job<AiProspectJobData>): Promise<void> {
  const { search_id } = job.data;
  const db = getDb();

  // Fetch all pending results for this search
  const { data: results } = await db
    .from("ai_prospect_results")
    .select("id, domain, title, ai_email")
    .eq("search_id", search_id)
    .eq("enrichment_status", "pending");

  if (!results?.length) {
    await db.from("ai_prospect_searches").update({ status: "done" }).eq("id", search_id);
    return;
  }

  // ── Phase 1: Discover DB lookup ──────────────────────────────────────────────
  const enriched: EnrichedRow[] = [];

  for (const result of results) {
    const discoverEmail = await lookupDiscoverEmail(result.domain ?? "", result.title ?? "");
    enriched.push({
      id:                result.id,
      discover_email:    discoverEmail,
      best_email:        discoverEmail ?? result.ai_email ?? null,
      best_email_source: discoverEmail ? "discover" : "ai",
    });
  }

  // ── Phase 2: Batch email verification ────────────────────────────────────────
  const emailsToVerify = [...new Set(
    enriched.map(r => r.best_email).filter(Boolean) as string[],
  )];

  let verifyMap = new Map<string, string>();

  if (emailsToVerify.length > 0) {
    try {
      const provider = await getVerifierProvider(db);

      if (provider === "leadash") {
        verifyMap = await leadashVerifyBatch(emailsToVerify);
      } else {
        const apiKey = process.env.REOON_API_KEY ?? "";
        if (apiKey) {
          verifyMap = await reoonVerifyBatch(apiKey, emailsToVerify);
        }
      }
    } catch (err) {
      // Verification is best-effort — log but don't fail the whole job
      console.error(`[ai-prospect-worker] verification failed for search ${search_id}:`, err);
    }
  }

  // ── Phase 3: Write results back ───────────────────────────────────────────────
  let totalEnriched = 0;

  for (const row of enriched) {
    try {
      const verificationStatus = row.best_email
        ? (verifyMap.get(row.best_email.toLowerCase()) ?? null)
        : null;

      await db.from("ai_prospect_results").update({
        discover_email:      row.discover_email,
        best_email:          row.best_email,
        best_email_source:   row.best_email_source,
        verification_status: verificationStatus,
        enrichment_status:   "done",
      }).eq("id", row.id);

      totalEnriched++;
    } catch (err) {
      console.error(`[ai-prospect-worker] failed to update result ${row.id}:`, err);
      await db.from("ai_prospect_results").update({ enrichment_status: "failed" }).eq("id", row.id);
    }
  }

  await db.from("ai_prospect_searches")
    .update({ status: "done", total_enriched: totalEnriched })
    .eq("id", search_id);

  console.log(`[ai-prospect-worker] search ${search_id}: done — ${totalEnriched}/${results.length} enriched`);
}
