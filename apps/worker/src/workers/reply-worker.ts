import type { Job } from "bullmq";

export interface ReplyJobData {
  workspace_id: string;
}

export async function processReplyPoll(job: Job<ReplyJobData>) {
  const { workspace_id } = job.data;

  const { runReplyPoll } = await import("../../../web/src/lib/outreach/reply-runner");
  const result = await runReplyPoll(workspace_id, 7);

  console.log(`[reply] ws=${workspace_id} inboxes=${result.inboxes} matched=${result.matched} unmatched=${result.unmatched}`);
  return result;
}
