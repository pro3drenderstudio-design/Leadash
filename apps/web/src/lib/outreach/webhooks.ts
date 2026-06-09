import { createAdminClient } from "@/lib/supabase/server";
import crypto from "crypto";

export type WebhookEvent =
  | "reply.received"
  | "send.opened"
  | "send.clicked"
  | "send.bounced"
  | "lead.unsubscribed"
  | "enrollment.completed";

export async function fireWebhooks(
  workspaceId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = createAdminClient();
  const { data: endpoints } = await db
    .from("webhook_endpoints")
    .select("id, url, secret, events")
    .eq("workspace_id", workspaceId)
    .eq("enabled", true);

  if (!endpoints?.length) return;

  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });

  type EndpointRow = { id: string; url: string; secret: string; events: string[] };

  await Promise.allSettled(
    (endpoints as EndpointRow[])
      .filter((ep) => ep.events.includes(event) || ep.events.includes("*"))
      .map(async (ep) => {
        const sig = crypto.createHmac("sha256", ep.secret).update(body).digest("hex");
        await fetch(ep.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Leadash-Signature": `sha256=${sig}`,
            "X-Leadash-Event": event,
          },
          body,
          signal: AbortSignal.timeout(5000),
        }).catch(() => {});
      }),
  );
}
