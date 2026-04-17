/**
 * GET /api/cron/cleanup
 *
 * Deletes stale lead campaign records to manage database size:
 *   - lead_campaign_leads older than 60 days
 *   - lead_campaigns (scrape/verify/enrich jobs) older than 60 days that are done/failed
 *   - enrich_jobs and verify_jobs older than 60 days
 *
 * Outreach leads (outreach_leads table) are NOT touched — they persist as long
 * as the workspace has an active subscription that covers its pool quota.
 *
 * Run daily via Vercel cron.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

const RETENTION_DAYS = 60;

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const results: Record<string, number> = {};

  // ── lead_campaign_leads older than 60 days ────────────────────────────────
  {
    const { error, count } = await db
      .from("lead_campaign_leads")
      .delete({ count: "exact" })
      .lt("created_at", cutoff);
    if (!error) results.lead_campaign_leads = count ?? 0;
    else console.error("[cleanup] lead_campaign_leads:", error.message);
  }

  // ── completed/failed lead_campaigns older than 60 days ────────────────────
  {
    const { error, count } = await db
      .from("lead_campaigns")
      .delete({ count: "exact" })
      .lt("created_at", cutoff)
      .in("status", ["done", "failed", "cancelled"]);
    if (!error) results.lead_campaigns = count ?? 0;
    else console.error("[cleanup] lead_campaigns:", error.message);
  }

  // ── enrich_jobs older than 60 days ────────────────────────────────────────
  {
    const { error, count } = await db
      .from("enrich_jobs")
      .delete({ count: "exact" })
      .lt("created_at", cutoff)
      .in("status", ["done", "failed"]);
    if (!error) results.enrich_jobs = count ?? 0;
    else console.error("[cleanup] enrich_jobs:", error.message);
  }

  // ── verify_jobs older than 60 days ────────────────────────────────────────
  {
    const { error, count } = await db
      .from("verify_jobs")
      .delete({ count: "exact" })
      .lt("created_at", cutoff)
      .in("status", ["done", "failed"]);
    if (!error) results.verify_jobs = count ?? 0;
    else console.error("[cleanup] verify_jobs:", error.message);
  }

  console.log("[cleanup] done:", results);
  return NextResponse.json({ ok: true, deleted: results, cutoff });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
