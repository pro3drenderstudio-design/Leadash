import type { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";

export interface SendJobData {
  workspace_id: string;
  batch_limit:  number;
}

/**
 * Processes one send batch for a single workspace.
 * Dynamically imports the send-runner from the web app's lib folder.
 * In production, extract to a shared @leadash/outreach-core package.
 */
export async function processSend(job: Job<SendJobData>) {
  const { workspace_id, batch_limit } = job.data;

  const { runSendBatch } = await import("../../../web/src/lib/outreach/send-runner");
  const result = await runSendBatch(workspace_id, batch_limit, 2_000, 8_000);

  console.log(`[send] ws=${workspace_id} processed=${result.processed} sent=${result.sent} errors=${result.errors}`);

  if (result.sent > 0) {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    // Increment monthly send counter atomically
    await db.rpc("increment_sends_this_month", { ws_id: workspace_id, amount: result.sent });
  }

  return result;
}
