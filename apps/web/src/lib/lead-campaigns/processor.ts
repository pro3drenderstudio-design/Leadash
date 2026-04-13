// ─── Lead campaign background processor ──────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/server";
import { startLeadScraperRun, getApifyRunStatus, fetchApifyDataset, mapApifyRecord } from "./apify";
import { verifyEmails } from "./reoon";
import { personalizeLeads } from "./gemini";
import type { ApifyLeadScraperInput } from "@/types/lead-campaigns";

export async function processLeadCampaign(campaignId: string): Promise<void> {
  const db = createAdminClient();

  const { data: campaign, error } = await db
    .from("lead_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (error || !campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (campaign.status === "completed" || campaign.status === "cancelled") return;

  const apifyKey = process.env.APIFY_API_KEY;

  try {
    // ── Step 1: Scrape via Apify ──────────────────────────────────────────────
    if (campaign.mode === "scrape" || campaign.mode === "full_suite") {
      if (!apifyKey) throw new Error("APIFY_API_KEY not configured");

      // Start run if not yet kicked off
      if (!campaign.apify_run_id) {
        const input = (campaign.apify_input ?? {}) as ApifyLeadScraperInput;
        const runId = await startLeadScraperRun(apifyKey, { ...input, totalResults: campaign.max_leads });
        await db.from("lead_campaigns")
          .update({ apify_run_id: runId, status: "running", started_at: new Date().toISOString() })
          .eq("id", campaignId);
        return;
      }

      // Check status and ingest dataset once run completes
      if (campaign.total_scraped === 0) {
        const { status, datasetId } = await getApifyRunStatus(apifyKey, campaign.apify_run_id);

        if (status === "RUNNING" || status === "TIMING-OUT") return;

        if (status !== "SUCCEEDED" || !datasetId) {
          throw new Error(`Apify run ended with status: ${status}`);
        }

        const items = await fetchApifyDataset(apifyKey, datasetId, campaign.max_leads);
        const validItems = items
          .filter(item => item.email && String(item.email).includes("@"))
          .slice(0, campaign.max_leads);

        if (validItems.length > 0) {
          const rows = validItems.map(item =>
            mapApifyRecord(item, campaign.workspace_id, campaignId, campaign.verify_enabled),
          );

          let inserted = 0;
          for (let i = 0; i < rows.length; i += 100) {
            const { error: insertErr } = await db.from("lead_campaign_leads").insert(rows.slice(i, i + 100));
            if (insertErr) {
              // Surface error but continue with whatever was inserted
              await db.from("lead_campaigns")
                .update({ error_message: `Lead insert error: ${insertErr.message}` })
                .eq("id", campaignId);
              break;
            }
            inserted += rows.slice(i, i + 100).length;
          }

          // Deduct scrape credits for what was actually inserted
          if (inserted > 0) {
            await deductCredits(db, campaign.workspace_id, campaignId, inserted, "scrape");
          }

          await db.from("lead_campaigns")
            .update({ total_scraped: inserted })
            .eq("id", campaignId);
        } else {
          // Nothing to process — complete immediately
          await db.from("lead_campaigns")
            .update({ status: "completed", completed_at: new Date().toISOString(), total_scraped: 0 })
            .eq("id", campaignId);
          return;
        }
      }
    }

    // Re-fetch latest state
    const { data: fresh } = await db.from("lead_campaigns").select("*").eq("id", campaignId).single();
    if (!fresh) return;

    // ── Step 1b: Copy leads for verify_personalize if none exist yet ──────────
    if (
      (fresh.mode === "verify_personalize" || fresh.mode === "verify") &&
      (fresh.source_campaign_id || fresh.source_list_id)
    ) {
      const { count: leadCount } = await db
        .from("lead_campaign_leads")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId);

      if ((leadCount ?? 0) === 0) {
        if (fresh.source_campaign_id) {
          const { data: sourceLeads } = await db
            .from("lead_campaign_leads")
            .select("email, first_name, last_name, company, title, website, linkedin_url, phone, location, industry, department, seniority, org_city, org_state, org_country, org_size, org_linkedin_url, org_description, org_founded_year")
            .eq("campaign_id", fresh.source_campaign_id)
            .eq("workspace_id", fresh.workspace_id)
            .limit(fresh.max_leads);

          if (sourceLeads?.length) {
            type SrcLead = Record<string, unknown>;
            await db.from("lead_campaign_leads").insert(
              (sourceLeads as SrcLead[]).map(({ id: _id, created_at: _ca, ...l }) => ({
                ...l,
                workspace_id:        fresh.workspace_id,
                campaign_id:         campaignId,
                verification_status: fresh.verify_enabled ? "pending" : null,
                personalized_line:   null,
                added_to_list_id:    null,
                added_at:            null,
              })),
            );

            await db.from("lead_campaigns")
              .update({ total_scraped: sourceLeads.length })
              .eq("id", campaignId);
          }
        } else if (fresh.source_list_id) {
          const { data: sourceLeads } = await db
            .from("outreach_leads")
            .select("email, first_name, last_name, company, title, website")
            .eq("list_id", fresh.source_list_id)
            .eq("status", "active")
            .limit(fresh.max_leads);

          if (sourceLeads?.length) {
            type SrcLead = { email: string; first_name: string | null; last_name: string | null; company: string | null; title: string | null; website: string | null };
            await db.from("lead_campaign_leads").insert(
              (sourceLeads as SrcLead[]).map(l => ({
                workspace_id:        fresh.workspace_id,
                campaign_id:         campaignId,
                email:               l.email,
                first_name:          l.first_name,
                last_name:           l.last_name,
                company:             l.company,
                title:               l.title,
                website:             l.website,
                verification_status: fresh.verify_enabled ? "pending" : null,
              })),
            );

            await db.from("lead_campaigns")
              .update({ total_scraped: sourceLeads.length })
              .eq("id", campaignId);
          }
        }

        // Leads just copied — let next cron tick handle verification
        return;
      }
    }

    // ── Step 2: Email verification ────────────────────────────────────────────
    if (fresh.verify_enabled) {
      const { data: pending } = await db
        .from("lead_campaign_leads")
        .select("id, email")
        .eq("campaign_id", campaignId)
        .eq("verification_status", "pending")
        .limit(100);

      if (pending?.length) {
        type PendingLead = { id: string; email: string };
        const typedPending = pending as PendingLead[];
        const reoonKey = process.env.REOON_API_KEY ?? "";
        const results = await verifyEmails(reoonKey, typedPending.map(l => l.email));

        for (const result of results) {
          const lead = typedPending.find(l => l.email === result.email);
          if (lead) {
            await db.from("lead_campaign_leads").update({
              verification_status: result.status,
              verification_score:  result.score,
            }).eq("id", lead.id);
          }
        }

        await deductCredits(db, fresh.workspace_id, campaignId, results.length, "verify");
        await db.from("lead_campaigns")
          .update({ total_verified: (fresh.total_verified ?? 0) + results.length })
          .eq("id", campaignId);

        if (pending.length === 100) return; // More batches to process
      }
    }

    // Re-fetch again
    const { data: fresh2 } = await db.from("lead_campaigns").select("*").eq("id", campaignId).single();
    if (!fresh2) return;

    // ── Step 3: AI Personalization ────────────────────────────────────────────
    if (fresh2.personalize_enabled && fresh2.personalize_prompt) {
      let personQuery = db
        .from("lead_campaign_leads")
        .select("id, first_name, last_name, title, company, industry, website")
        .eq("campaign_id", campaignId)
        .is("personalized_line", null);

      if (fresh2.personalize_valid_only) {
        personQuery = personQuery.in("verification_status", ["safe", "valid", "catch_all"]);
      }

      const { data: unpersonalized } = await personQuery.limit(50);

      if (unpersonalized?.length) {
        type LeadRow = { id: string; first_name?: string | null; last_name?: string | null; title?: string | null; company?: string | null; industry?: string | null; website?: string | null };
        const rows = unpersonalized as LeadRow[];
        const lines = await personalizeLeads(rows, fresh2.personalize_prompt, fresh2.personalize_depth ?? "standard");

        let personalized = 0;
        for (let i = 0; i < rows.length; i++) {
          if (lines[i]) {
            await db.from("lead_campaign_leads")
              .update({ personalized_line: lines[i] })
              .eq("id", rows[i].id);
            personalized++;
          }
        }

        await deductCredits(db, fresh2.workspace_id, campaignId, personalized * 2, "personalize");
        await db.from("lead_campaigns")
          .update({ total_personalized: (fresh2.total_personalized ?? 0) + personalized })
          .eq("id", campaignId);

        if (unpersonalized.length === 50) return; // More batches
      }
    }

    // ── Finalize ──────────────────────────────────────────────────────────────
    const { count: totalValid } = await db
      .from("lead_campaign_leads")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("verification_status", ["valid", "catch_all"]);

    await db.from("lead_campaigns").update({
      status:       "completed",
      completed_at: new Date().toISOString(),
      total_valid:  totalValid ?? 0,
    }).eq("id", campaignId);

  } catch (err) {
    await db.from("lead_campaigns").update({
      status:        "failed",
      error_message: err instanceof Error ? err.message : String(err),
      completed_at:  new Date().toISOString(),
    }).eq("id", campaignId);
  }
}

// ─── Atomic credit deduction ──────────────────────────────────────────────────
async function deductCredits(
  db:          ReturnType<typeof createAdminClient>,
  workspaceId: string,
  campaignId:  string,
  amount:      number,
  action:      string,
): Promise<void> {
  if (amount <= 0) return;

  // Read current balance
  const { data: ws } = await db.from("workspaces")
    .select("lead_credits_balance").eq("id", workspaceId).single();
  if (!ws) return;

  const deduct = Math.min(amount, Math.max(0, ws.lead_credits_balance));
  if (deduct === 0) return;

  await db.from("workspaces")
    .update({ lead_credits_balance: ws.lead_credits_balance - deduct })
    .eq("id", workspaceId);

  // Use rpc-style increment for credits_used to avoid stale reads
  const { data: camp } = await db.from("lead_campaigns")
    .select("credits_used").eq("id", campaignId).single();
  if (camp) {
    await db.from("lead_campaigns")
      .update({ credits_used: camp.credits_used + deduct })
      .eq("id", campaignId);
  }

  await db.from("lead_credit_transactions").insert({
    workspace_id:     workspaceId,
    amount:           -deduct,
    type:             "consume",
    description:      `${action} — ${amount} leads`,
    lead_campaign_id: campaignId,
  });
}
