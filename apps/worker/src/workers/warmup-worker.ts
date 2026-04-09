import type { Job } from "bullmq";

export interface WarmupJobData {
  workspace_id: string;
}

export async function processWarmup(job: Job<WarmupJobData>) {
  const { workspace_id } = job.data;

  const { runWarmupPool } = await import("../../web/src/lib/outreach/warmup-runner");
  const result = await runWarmupPool(workspace_id);

  console.log(`[warmup] ws=${workspace_id} sent=${result.sent} replied=${result.replied} rescued=${result.rescued}`);
  return result;
}
