import type { Job } from "bullmq";
import { createHmac } from "crypto";

export interface WebhookJobData {
  workspace_id:  string;
  endpoint_url:  string;
  signing_secret: string;
  event_type:    string;
  payload:       Record<string, unknown>;
}

export async function processWebhook(job: Job<WebhookJobData>) {
  const { endpoint_url, signing_secret, event_type, payload } = job.data;

  const body      = JSON.stringify({ event: event_type, data: payload, ts: Date.now() });
  const signature = createHmac("sha256", signing_secret).update(body).digest("hex");

  const res = await fetch(endpoint_url, {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "X-Leadash-Event":   event_type,
      "X-Leadash-Sig":     `sha256=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Webhook delivery failed: ${res.status}`);
  return { status: res.status };
}
