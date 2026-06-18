// ─── AI Prospect Enrichment Worker ────────────────────────────────────────────
// For each result in an ai_prospect_searches record:
//   1. Look up matching email from the Discover VPS DB (discover_people by domain + title)
//   2. Verify best email via Reoon
//   3. Update the row and mark search as done when all rows are processed

import type { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiProspectJobData {
  search_id:    string;
  workspace_id: string;
}

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

// ─── Reoon verification ───────────────────────────────────────────────────────

const REOON_BASE = "https://emailverifier.reoon.com/api/v1";

async function verifyEmail(email: string, apiKey: string): Promise<string> {
  try {
    const url = `${REOON_BASE}/verify?email=${encodeURIComponent(email)}&key=${apiKey}&mode=power`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return "unknown";
    const data = await res.json() as { status?: string };
    return data.status ?? "unknown";
  } catch {
    return "unknown";
  }
}

// ─── Discover DB lookup ───────────────────────────────────────────────────────

interface DiscoverMatch { email: string }

async function lookupDiscoverEmail(domain: string, title: string): Promise<string | null> {
  try {
    const leadsDb = getLeadsDb();
    // Match by company domain, prefer person whose title is most similar to the query title
    const rows = await leadsDb.unsafe<DiscoverMatch[]>(`
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
  const { search_id, workspace_id } = job.data;
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

  // Fetch Reoon API key from admin settings
  const { data: settings } = await db
    .from("admin_settings")
    .select("key, value")
    .in("key", ["reoon_api_key"]);
  const reoonKey = settings?.find((s: { key: string; value: string }) => s.key === "reoon_api_key")?.value ?? "";

  let enriched = 0;

  for (const result of results) {
    try {
      const discoverEmail = await lookupDiscoverEmail(result.domain ?? "", result.title ?? "");

      const bestEmail     = discoverEmail ?? result.ai_email;
      const bestSource    = discoverEmail ? "discover" : "ai";

      let verificationStatus: string | null = null;
      if (bestEmail && reoonKey) {
        verificationStatus = await verifyEmail(bestEmail, reoonKey);
      }

      await db.from("ai_prospect_results").update({
        discover_email:      discoverEmail,
        best_email:          bestEmail,
        best_email_source:   bestSource,
        verification_status: verificationStatus,
        enrichment_status:   "done",
      }).eq("id", result.id);

      enriched++;

      // Keep search progress counter in sync
      await db.from("ai_prospect_searches").update({ total_enriched: enriched }).eq("id", search_id);
    } catch (err) {
      console.error(`[ai-prospect-worker] result ${result.id} failed:`, err);
      await db.from("ai_prospect_results").update({ enrichment_status: "failed" }).eq("id", result.id);
    }
  }

  await db.from("ai_prospect_searches").update({ status: "done", total_enriched: enriched }).eq("id", search_id);
}
