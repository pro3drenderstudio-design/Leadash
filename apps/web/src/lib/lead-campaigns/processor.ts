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

  const apifyKey  = process.env.APIFY_API_KEY;
  const reoonKey  = process.env.REOON_API_KEY;

  try {
    // ── Step 1: Check Apify run & ingest results ──────────────────────────────
    if (campaign.mode === "scrape" || campaign.mode === "full_suite") {
      if (!apifyKey) throw new Error("APIFY_API_KEY not configured");

      // If no run started yet, start one now (route may have failed silently)
      if (!campaign.apify_run_id) {
        const input = (campaign.apify_input ?? {}) as ApifyLeadScraperInput;
        const runId = await startLeadScraperRun(apifyKey, { ...input, totalResults: campaign.max_leads });
        await db.from("lead_campaigns")
          .update({ apify_run_id: runId, status: "running", started_at: new Date().toISOString() })
          .eq("id", campaignId);
        return; // Poll again next tick
      }

      if (campaign.total_scraped === 0) {
        const { status, datasetId } = await getApifyRunStatus(apifyKey, campaign.apify_run_id);

        if (status === "RUNNING" || status === "TIMING-OUT") return; // Still running

        if (status !== "SUCCEEDED" || !datasetId) {
          throw new Error(`Apify run ended with status: ${status}`);
        }

        // Fetch and insert leads
        const items = await fetchApifyDataset(apifyKey, datasetId, campaign.max_leads);
        const validItems = items
          .filter(item => item.email && String(item.email).includes("@"))
          .slice(0, campaign.max_leads);

        if (validItems.length > 0) {
          const rows = validItems.map(item =>
            mapApifyRecord(item, campaign.workspace_id, campaignId, campaign.verify_enabled),
          );
          for (let i = 0; i < rows.length; i += 100) {
            await db.from("lead_campaign_leads").insert(rows.slice(i, i + 100));
          }
        }

        await db.from("lead_campaigns")
          .update({ total_scraped: validItems.length })
          .eq("id", campaignId);

        await consumeCredits(db, campaign, validItems.length, "scrape");
      }
    }

    // Re-fetch for latest counts
    const { data: fresh } = await db.from("lead_campaigns").select("*").eq("id", campaignId).single();
    if (!fresh) return;

    // ── Step 2: Email verification ────────────────────────────────────────────
    if (fresh.verify_enabled && reoonKey && fresh.total_verified < fresh.total_scraped) {
      const { data: pending } = await db
        .from("lead_campaign_leads")
        .select("id, email")
        .eq("campaign_id", campaignId)
        .eq("verification_status", "pending")
        .limit(100);

      if (pending?.length) {
        type PendingLead = { id: string; email: string };
        const typedPending = pending as PendingLead[];
        const results = await verifyEmails(reoonKey!, typedPending.map(l => l.email));

        for (const result of results) {
          const lead = typedPending.find(l => l.email === result.email);
          if (lead) {
            await db.from("lead_campaign_leads").update({
              verification_status: result.status,
              verification_score:  result.score,
            }).eq("id", lead.id);
          }
        }

        await consumeCredits(db, fresh, results.length, "verify");
        await db.from("lead_campaigns")
          .update({ total_verified: fresh.total_verified + results.length })
          .eq("id", campaignId);

        // More pending? Don't finalize yet
        if (pending.length === 100) return;
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

      // Optionally restrict to valid emails only
      if (fresh2.personalize_valid_only) {
        personQuery = personQuery.in("verification_status", ["valid", "catch_all"]);
      }

      const { data: unpersonalized } = await personQuery.limit(50);

      if (unpersonalized?.length) {
        const lines = await personalizeLeads(unpersonalized, fresh2.personalize_prompt);

        for (let i = 0; i < unpersonalized.length; i++) {
          if (lines[i]) {
            await db.from("lead_campaign_leads")
              .update({ personalized_line: lines[i] })
              .eq("id", unpersonalized[i].id);
          }
        }

        await consumeCredits(db, fresh2, unpersonalized.length * 2, "personalize");
        await db.from("lead_campaigns")
          .update({ total_personalized: fresh2.total_personalized + unpersonalized.length })
          .eq("id", campaignId);

        if (unpersonalized.length === 50) return; // More to process
      }
    }

    // ── Finalize ──────────────────────────────────────────────────────────────
    const { count: totalValid } = await db
      .from("lead_campaign_leads")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("verification_status", ["valid", "catch_all"]);

    const { data: finalCampaign } = await db
      .from("lead_campaigns").select("credits_reserved, credits_used, name, workspace_id")
      .eq("id", campaignId).single();

    if (finalCampaign) {
      const refund = Math.max(0, finalCampaign.credits_reserved - finalCampaign.credits_used);
      if (refund > 0) {
        const { data: ws } = await db.from("workspaces")
          .select("lead_credits_balance").eq("id", finalCampaign.workspace_id).single();
        if (ws) {
          await db.from("workspaces")
            .update({ lead_credits_balance: ws.lead_credits_balance + refund })
            .eq("id", finalCampaign.workspace_id);
          await db.from("lead_credit_transactions").insert({
            workspace_id:     finalCampaign.workspace_id,
            amount:           refund,
            type:             "refund",
            description:      `Unused credit refund for "${finalCampaign.name}"`,
            lead_campaign_id: campaignId,
          });
        }
      }
    }

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

async function consumeCredits(
  db:       ReturnType<typeof createAdminClient>,
  campaign: { id: string; workspace_id: string; credits_used: number },
  amount:   number,
  action:   string,
): Promise<void> {
  await db.from("lead_campaigns")
    .update({ credits_used: campaign.credits_used + amount })
    .eq("id", campaign.id);

  await db.from("lead_credit_transactions").insert({
    workspace_id:     campaign.workspace_id,
    amount:           -amount,
    type:             "consume",
    description:      `${action} — ${amount} leads`,
    lead_campaign_id: campaign.id,
  });
}
