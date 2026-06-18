import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { generateProspects, creditRateForModel, AI_PROSPECT_MODELS } from "@/lib/discover/ai-prospects-prompt";
import type { AiProspectModel } from "@/lib/discover/ai-prospects-prompt";
import { Queue } from "bullmq";

const enrichQueue = new Queue("leadash:ai-prospect-enrich", {
  connection: {
    url: process.env.UPSTASH_REDIS_URL,
  },
});

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  // Plan gate — reuse can_scrape_leads
  const { data: wsRow } = await db.from("workspaces").select("plan_id, trial_ends_at").eq("id", workspaceId).single();
  const planId = wsRow?.plan_id ?? "free";
  const trialExpired = planId === "free" && wsRow?.trial_ends_at && new Date(wsRow.trial_ends_at) < new Date();
  if (trialExpired) return NextResponse.json({ error: "Free trial expired. Upgrade to use AI Prospect Search." }, { status: 403 });
  const plan = await getPlanById(planId);
  if (!plan.can_scrape_leads) return NextResponse.json({ error: "AI Prospect Search requires a paid plan." }, { status: 403 });

  const body = await req.json();
  const {
    industry    = "",
    role        = "",
    geography   = "",
    company_size = "any",
    count       = 25,
    model       = "claude-haiku-4-5-20251001",
  } = body as {
    industry?: string; role?: string; geography?: string;
    company_size?: string; count?: number; model?: AiProspectModel;
  };

  if (!industry.trim()) return NextResponse.json({ error: "industry is required" }, { status: 400 });
  if (!role.trim())     return NextResponse.json({ error: "role is required" }, { status: 400 });
  if (!geography.trim()) return NextResponse.json({ error: "geography is required" }, { status: 400 });
  if (![10, 25, 50, 100].includes(count)) return NextResponse.json({ error: "count must be 10, 25, 50, or 100" }, { status: 400 });
  if (!AI_PROSPECT_MODELS[model as AiProspectModel]) return NextResponse.json({ error: "invalid model" }, { status: 400 });

  // Create search record
  const { data: search, error: searchErr } = await db
    .from("ai_prospect_searches")
    .insert({
      workspace_id: workspaceId,
      query: { industry, role, geography, company_size, count, model },
      model,
      status: "generating",
    })
    .select("id")
    .single();

  if (searchErr || !search) {
    return NextResponse.json({ error: "Failed to create search" }, { status: 500 });
  }

  try {
    // Call Claude — typically 8-15s
    const results = await generateProspects({ industry, role, geography, company_size, count, model });

    if (!results.length) {
      await db.from("ai_prospect_searches").update({ status: "failed", error_message: "Claude returned no results" }).eq("id", search.id);
      return NextResponse.json({ error: "No results returned. Try a broader search." }, { status: 422 });
    }

    // Bulk insert results
    const rows = results.map(r => ({
      search_id:           search.id,
      workspace_id:        workspaceId,
      person_name:         r.person_name,
      title:               r.title,
      company_name:        r.company_name,
      domain:              r.domain,
      linkedin_url:        r.linkedin_url,
      notes:               r.notes,
      ai_email:            r.ai_email,
      ai_email_confidence: r.ai_email_confidence,
      best_email:          r.ai_email,
      best_email_source:   "ai",
      enrichment_status:   "pending",
    }));

    const { data: inserted } = await db.from("ai_prospect_results").insert(rows).select("id");

    // Update search to enriching
    await db.from("ai_prospect_searches").update({
      status:          "enriching",
      total_generated: inserted?.length ?? results.length,
    }).eq("id", search.id);

    // Enqueue background enrichment
    await enrichQueue.add("enrich", { search_id: search.id, workspace_id: workspaceId }, {
      attempts: 2,
      backoff: { type: "fixed", delay: 10_000 },
      removeOnComplete: { count: 100 },
      removeOnFail:     { count: 50 },
    });

    return NextResponse.json({ search_id: search.id, results: inserted ?? [] });
  } catch (err) {
    console.error("[ai-prospects] generation failed:", err);
    await db.from("ai_prospect_searches").update({
      status: "failed",
      error_message: err instanceof Error ? err.message : "Unknown error",
    }).eq("id", search.id);
    return NextResponse.json({ error: "AI generation failed. Please try again." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data: searches } = await db
    .from("ai_prospect_searches")
    .select("id, query, model, status, error_message, total_generated, total_enriched, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ searches: searches ?? [] });
}
