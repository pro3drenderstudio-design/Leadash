import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { CREDIT_COSTS } from "@/types/lead-campaigns";
import { startLeadScraperRun } from "@/lib/lead-campaigns/apify";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const url    = new URL(req.url);
  const mode   = url.searchParams.get("mode");
  const status = url.searchParams.get("status");

  let query = db
    .from("lead_campaigns")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (mode)   query = query.eq("mode",   mode);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json();
  const {
    name, mode, max_leads = 100,
    apify_actor_id, apify_input,
    source_list_id,
    source_campaign_id,
    verify_enabled = false,
    personalize_enabled = false,
    personalize_prompt,
    personalize_valid_only = false,
  } = body;

  if (!name || !mode) {
    return NextResponse.json({ error: "name and mode are required" }, { status: 400 });
  }

  // Check credit balance
  const costPerLead = CREDIT_COSTS[mode as keyof typeof CREDIT_COSTS] ?? 1;
  const creditsNeeded = max_leads * costPerLead;

  const { data: workspace } = await db
    .from("workspaces")
    .select("lead_credits_balance")
    .eq("id", workspaceId)
    .single();

  if (!workspace || workspace.lead_credits_balance < creditsNeeded) {
    return NextResponse.json(
      { error: `Insufficient credits. Need ${creditsNeeded}, have ${workspace?.lead_credits_balance ?? 0}.` },
      { status: 402 },
    );
  }

  // Credits are NOT deducted upfront. The processor deducts per-lead as they are processed.
  // credits_reserved is stored for display/estimation only.

  // Create campaign
  const { data: campaign, error } = await db
    .from("lead_campaigns")
    .insert({
      workspace_id:       workspaceId,
      name,
      mode,
      max_leads,
      apify_actor_id:     apify_actor_id ?? null,
      apify_input:        apify_input ?? null,
      source_list_id:     source_list_id ?? null,
      verify_enabled,
      personalize_enabled,
      personalize_prompt:     personalize_prompt ?? null,
      personalize_valid_only: personalize_valid_only ?? false,
      source_campaign_id:     source_campaign_id ?? null,
      credits_reserved:       creditsNeeded,
      status:                 "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // For verify_personalize mode from a previous campaign: copy its leads
  if (mode === "verify_personalize" && source_campaign_id) {
    const { data: sourceLeads } = await db
      .from("lead_campaign_leads")
      .select("email, first_name, last_name, company, title, website, linkedin_url, phone, location, industry, department, seniority, org_city, org_state, org_country, org_size, org_linkedin_url, org_description, org_founded_year")
      .eq("campaign_id", source_campaign_id)
      .eq("workspace_id", workspaceId)
      .limit(max_leads);

    if (sourceLeads?.length) {
      type SrcLead = Record<string, unknown>;
      await db.from("lead_campaign_leads").insert(
        (sourceLeads as SrcLead[]).map(l => ({
          ...l,
          id:                  undefined,
          workspace_id:        workspaceId,
          campaign_id:         campaign.id,
          verification_status: verify_enabled ? "pending" : null,
          personalized_line:   null,
          added_to_list_id:    null,
          added_at:            null,
          created_at:          undefined,
        })),
      );

      await db.from("lead_campaigns")
        .update({ status: "running", started_at: new Date().toISOString(), total_scraped: sourceLeads.length })
        .eq("id", campaign.id);
    }
  }

  // For verify_personalize mode: load source list leads immediately
  if (mode === "verify_personalize" && source_list_id) {
    const { data: sourceLeads } = await db
      .from("outreach_leads")
      .select("email, first_name, last_name, company, title, website")
      .eq("list_id", source_list_id)
      .eq("status", "active")
      .limit(max_leads);

    if (sourceLeads?.length) {
      type SrcLead = { email: string; first_name: string | null; last_name: string | null; company: string | null; title: string | null; website: string | null };
      await db.from("lead_campaign_leads").insert(
        (sourceLeads as SrcLead[]).map(l => ({
          workspace_id:        workspaceId,
          campaign_id:         campaign.id,
          email:               l.email,
          first_name:          l.first_name,
          last_name:           l.last_name,
          company:             l.company,
          title:               l.title,
          website:             l.website,
          verification_status: verify_enabled ? "pending" : null,
        })),
      );

      await db.from("lead_campaigns")
        .update({ status: "running", started_at: new Date().toISOString(), total_scraped: sourceLeads.length })
        .eq("id", campaign.id);
    }
  }

  // For scrape modes: kick off Apify run using backend API key
  if ((mode === "scrape" || mode === "full_suite") && apify_actor_id) {
    const apifyKey = process.env.APIFY_API_KEY;
    if (apifyKey) {
      try {
        const runId = await startLeadScraperRun(apifyKey, {
          ...(apify_input ?? {}),
          totalResults: max_leads,
        });
        await db.from("lead_campaigns").update({
          apify_run_id: runId,
          status:       "running",
          started_at:   new Date().toISOString(),
        }).eq("id", campaign.id);
      } catch (e) {
        // Surface error but don't fail the whole request — processor will retry
        await db.from("lead_campaigns").update({
          error_message: e instanceof Error ? e.message : "Failed to start Apify run",
        }).eq("id", campaign.id);
      }
    }
  }

  return NextResponse.json(campaign, { status: 201 });
}
