import type { Job } from "bullmq";

export interface LeadCampaignJobData {
  campaign_id: string;
}

export async function processLeadCampaign(job: Job<LeadCampaignJobData>) {
  const { campaign_id } = job.data;
  const { processLeadCampaign: run } = await import("../../web/src/lib/lead-campaigns/processor");
  await run(campaign_id);
  console.log(`[lead-campaign] campaign=${campaign_id} done`);
}
