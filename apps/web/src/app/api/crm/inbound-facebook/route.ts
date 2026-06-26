/**
 * Facebook Messenger Webhook
 *
 * GET  — webhook verification
 * POST — inbound messages from Meta Graph API (object: "page")
 *
 * Edge cases handled:
 * - Duplicate mid → idempotent
 * - Echo messages (sent by page) → ignored via is_echo flag
 * - Postback events (button clicks) → stored as [postback: PAYLOAD]
 * - Delivery/read receipts → update crm_messages status
 * - 24h window tracked via last_inbound_at (same as WhatsApp)
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "leadash_webhook_token";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (
    sp.get("hub.mode")        === "subscribe" &&
    sp.get("hub.verify_token") === VERIFY_TOKEN
  ) {
    return new Response(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

interface FbEvent {
  sender:    { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid:       string;
    text?:     string;
    is_echo?:  boolean;
    attachments?: Array<{ type: string }>;
  };
  postback?: { title: string; payload: string; mid: string };
  delivery?: { watermark: number };
  read?:     { watermark: number };
}

interface FbEntry { id: string; messaging: FbEvent[] }
interface FbPayload { object: string; entry: FbEntry[] }

export async function POST(req: NextRequest) {
  const body = await req.json() as FbPayload;

  if (body.object !== "page") {
    return NextResponse.json({ ok: true });
  }

  const db = createAdminClient();

  for (const entry of body.entry ?? []) {
    const pageId = entry.id;

    for (const event of entry.messaging ?? []) {
      // Skip echo
      if (event.message?.is_echo) continue;

      // Handle delivery/read receipts
      if (event.delivery || event.read) {
        const watermark = event.delivery?.watermark ?? event.read?.watermark ?? 0;
        const status    = event.read ? "read" : "delivered";
        const field     = event.read ? "read_at" : "delivered_at";
        const wts       = new Date(watermark).toISOString();

        await db
          .from("crm_messages")
          .update({ status, [field]: wts })
          .eq("from_address", event.sender.id)
          .lte("created_at", wts);
        continue;
      }

      if (!event.message && !event.postback) continue;

      const psid      = event.sender.id;
      const timestamp = new Date(event.timestamp).toISOString();

      let mid     = event.message?.mid ?? event.postback?.mid ?? `fb_${event.timestamp}_${psid}`;
      let msgBody = event.message?.text ?? null;

      if (!msgBody && event.message?.attachments?.length) {
        msgBody = `[${event.message.attachments[0].type ?? "attachment"}]`;
      }
      if (!msgBody && event.postback) {
        msgBody = `[postback: ${event.postback.title}]`;
        mid = event.postback.mid ?? mid;
      }

      // Idempotency
      const { data: existing } = await db
        .from("crm_messages")
        .select("id")
        .eq("provider_message_id", mid)
        .maybeSingle();
      if (existing) continue;

      // Find or create contact
      let contact = null;
      const { data: existingContact } = await db
        .from("crm_contacts")
        .select("id, display_name")
        .eq("facebook_id", psid)
        .maybeSingle();

      if (existingContact) {
        contact = existingContact;
      } else {
        const { data: newContact } = await db
          .from("crm_contacts")
          .insert({
            facebook_id:     psid,
            display_name:    "Facebook User",
            source:          "facebook",
            lifecycle_stage: "lead",
          })
          .select("id, display_name")
          .single();
        contact = newContact;
      }

      if (!contact) continue;

      // Find or create conversation
      const { data: existingConvo } = await db
        .from("crm_conversations")
        .select("id")
        .eq("contact_id", contact.id)
        .eq("channel", "facebook")
        .eq("channel_identifier", psid)
        .maybeSingle();

      let conversationId: string;
      const now = new Date().toISOString();

      if (existingConvo) {
        conversationId = existingConvo.id;
        await db
          .from("crm_conversations")
          .update({
            last_message_at: now,
            last_inbound_at: now,
            status:          "open",
            updated_at:      now,
          })
          .eq("id", conversationId);
      } else {
        const { data: newConvo } = await db
          .from("crm_conversations")
          .insert({
            contact_id:         contact.id,
            channel:            "facebook",
            channel_identifier: psid,
            inbox_address:      `facebook:${pageId}`,
            status:             "open",
            last_message_at:    now,
            last_inbound_at:    now,
            unread_count:       1,
          })
          .select("id")
          .single();
        conversationId = newConvo!.id;
      }

      await db.from("crm_messages").insert({
        conversation_id:     conversationId,
        contact_id:          contact.id,
        direction:           "inbound",
        channel:             "facebook",
        from_address:        psid,
        from_name:           contact.display_name ?? "Facebook User",
        body:                msgBody,
        provider_message_id: mid,
        provider_thread_id:  conversationId,
        status:              "delivered",
        delivered_at:        timestamp,
        created_at:          timestamp,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
