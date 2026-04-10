import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { CREDIT_COSTS } from "@/types/lead-campaigns";
import { startLeadScraperRun } from "@/lib/lead-campaigns/apify";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data, error } = await db
    .from("lead_campaigns")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

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
    verify_enabled = false,
    personalize_enabled = false,
    personalize_prompt,
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

  // Deduct credits upfront
  await db.from("workspaces")
    .update({ lead_credits_balance: workspace.lead_credits_balance - creditsNeeded })
    .eq("id", workspaceId);

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
      personalize_prompt: personalize_prompt ?? null,
      credits_reserved:   creditsNeeded,
      status:             "pending",
    })
    .select()
    .single();

  if (error) {
    // Refund on failure
    await db.from("workspaces")
      .update({ lead_credits_balance: workspace.lead_credits_balance })
      .eq("id", workspaceId);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log credit transaction
  await db.from("lead_credit_transactions").insert({
    workspace_id:     workspaceId,
    amount:           -creditsNeeded,
    type:             "reserve",
    description:      `Reserved for campaign "${name}"`,
    lead_campaign_id: campaign.id,
  });

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

  // For scrape modes: kick off Apify run if API key available
  if ((mode === "scrape" || mode === "full_suite") && apify_actor_id) {
    const { data: settings } = await db
      .from("workspace_settings")
      .select("apify_api_key")
      .eq("workspace_id", workspaceId)
      .single();

    if (settings?.apify_api_key) {
      try {
        const runId = await startLeadScraperRun(settings.apify_api_key, {
          ...(apify_input ?? {}),
          totalResults: max_leads,
        });
        await db.from("lead_campaigns").update({
          apify_run_id: runId,
          status:       "running",
          started_at:   new Date().toISOString(),
        }).eq("id", campaign.id);
      } catch {
        // Apify start failed — cron will retry
      }
    }
  }

  return NextResponse.json(campaign, { status: 201 });
}
