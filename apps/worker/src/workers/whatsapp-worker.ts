/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";

type DB = any;

const SUPABASE_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
const SUPABASE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAX_RETRY_HOURS    = parseInt(process.env.WA_MAX_RETRY_HOURS ?? "6", 10);

export interface WhatsappJobData {
  message_id:      string;
  phone_number:    string;
  template_name?:  string;
  template_params?: Record<string, string>;
  body?:           string;
  source:          "automation" | "crm" | "system";
}

export async function processWhatsapp(job: Job<WhatsappJobData>) {
  const db: DB = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { message_id, phone_number, template_name, template_params, body } = job.data;

  // Pull Meta credentials from admin_settings at runtime so they can be
  // rotated without redeployment.
  const { data: settings } = await db
    .from("admin_settings")
    .select("key, value")
    .in("key", ["whatsapp_phone_number_id", "whatsapp_access_token"]);

  const cfg = Object.fromEntries((settings ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value as string]));
  const phoneNumberId = cfg["whatsapp_phone_number_id"];
  const accessToken   = cfg["whatsapp_access_token"];

  if (!phoneNumberId || !accessToken) {
    throw new Error("WhatsApp credentials not configured in admin_settings");
  }

  // Build the Meta Cloud API payload
  let payload: Record<string, unknown>;

  if (template_name) {
    // Template message (required when outside 24-hour customer service window)
    const components = template_params && Object.keys(template_params).length > 0
      ? [{
          type: "body",
          parameters: Object.values(template_params).map(v => ({ type: "text", text: v })),
        }]
      : [];

    payload = {
      messaging_product: "whatsapp",
      to:                phone_number,
      type:              "template",
      template: {
        name:     template_name,
        language: { code: "en" },
        components,
      },
    };
  } else if (body) {
    // Free-form text message (within 24-hour window)
    payload = {
      messaging_product: "whatsapp",
      to:                phone_number,
      type:              "text",
      text:              { body },
    };
  } else {
    throw new Error("WhatsApp job missing both template_name and body");
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[whatsapp] send failed phone=${phone_number} status=${res.status}`, errBody);

    // Check if we've exhausted the retry window
    const elapsed = Date.now() - (job.timestamp ?? Date.now());
    const exhausted = elapsed > MAX_RETRY_HOURS * 60 * 60 * 1000;

    await db.from("whatsapp_messages").update({
      status:          exhausted ? "failed" : "pending",
      failed_reason:   `${res.status}: ${errBody}`,
      retry_count:     (job.attemptsMade ?? 0),
      next_retry_at:   exhausted ? null : new Date(Date.now() + getBackoffMs(job.attemptsMade)).toISOString(),
      flagged_for_review: exhausted ? await shouldFlagForReview(db, message_id) : false,
    }).eq("id", message_id);

    throw new Error(`Meta API error ${res.status}`);
  }

  const result = await res.json() as { messages?: Array<{ id: string }> };
  const providerMessageId = result.messages?.[0]?.id;

  await db.from("whatsapp_messages").update({
    status:              "sent",
    provider_message_id: providerMessageId ?? null,
    sent_at:             new Date().toISOString(),
    retry_count:         job.attemptsMade ?? 0,
  }).eq("id", message_id);

  console.log(`[whatsapp] sent phone=${phone_number} provider_id=${providerMessageId}`);
}

// Exponential backoff: 1m, 2m, 4m, 8m, 16m, 32m
function getBackoffMs(attempt: number): number {
  return Math.min(60_000 * Math.pow(2, attempt), 32 * 60_000);
}

// Flag for admin review only if email fallback also failed (checked by caller).
// For now: always flag on WA exhaustion — the API route / automation engine
// handles the email fallback attempt before we reach this point.
async function shouldFlagForReview(
  db: DB,
  messageId: string,
): Promise<boolean> {
  const { data } = await db
    .from("whatsapp_messages")
    .select("flagged_for_review")
    .eq("id", messageId)
    .single();
  // Only flag if not already flagged (idempotent)
  return !(data?.flagged_for_review ?? false);
}
