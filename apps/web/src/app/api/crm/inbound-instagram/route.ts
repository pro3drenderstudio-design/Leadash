/**
 * Instagram DM Webhook
 *
 * GET  — webhook verification (hub.mode, hub.challenge, hub.verify_token)
 * POST — inbound DM events from Meta Graph API
 *
 * Instagram DM payload shape:
 * {
 *   object: "instagram",
 *   entry: [{
 *     id: "IG_PAGE_ID",
 *     messaging: [{
 *       sender:    { id: "USER_SCOPED_ID" },
 *       recipient: { id: "IG_PAGE_ID" },
 *       timestamp: 1234567890,
 *       message: { mid: "MID", text: "Hello" }
 *     }]
 *   }]
 * }
 *
 * Edge cases handled:
 * - Duplicate mid → idempotent (skip if provider_message_id already exists)
 * - Media messages (image/video/audio/sticker) → stored as [media:TYPE] placeholder
 * - Echo messages (sent by page) → ignored (sender.id === recipient.id)
 * - Story mentions → stored as sticker/media type
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "leadash_webhook_token";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (
    sp.get("hub.mode")       === "subscribe" &&
    sp.get("hub.verify_token") === VERIFY_TOKEN
  ) {
    return new Response(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

interface MetaMessageEvent {
  sender:    { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid:         string;
    text?:       string;
    attachments?: Array<{ type: string; payload: { url?: string } }>;
    sticker_id?:  number;
  };
}

interface MetaEntry {
  id:        string;
  messaging: MetaMessageEvent[];
}

interface MetaPayload {
  object: string;
  entry:  MetaEntry[];
}

export async function POST(req: NextRequest) {
  // Must respond 200 quickly to avoid Meta retries
  const body = await req.json() as MetaPayload;

  if (body.object !== "instagram") {
    return NextResponse.json({ ok: true });
  }

  const db = createAdminClient();

  for (const entry of body.entry ?? []) {
    const pageId = entry.id;

    for (const event of entry.messaging ?? []) {
      // Skip echo messages (page to page)
      if (event.sender.id === event.recipient.id) continue;
      if (!event.message) continue;

      const mid       = event.message.mid;
      const senderId  = event.sender.id;
      const text      = event.message.text ?? null;
      const timestamp = new Date(event.timestamp).toISOString();

      // Determine message body
      let msgBody = text;
      if (!msgBody && event.message.attachments?.length) {
        const att = event.message.attachments[0];
        msgBody = `[${att.type ?? "media"}]`;
      }
      if (!msgBody && event.message.sticker_id) {
        msgBody = "[sticker]";
      }

      // Idempotency — skip if already stored
      const { data: existing } = await db
        .from("crm_messages")
        .select("id")
        .eq("provider_message_id", mid)
        .maybeSingle();
      if (existing) continue;

      // Find or create contact by instagram_id
      let contact = null;
      const { data: existingContact } = await db
        .from("crm_contacts")
        .select("id, display_name")
        .eq("instagram_id", senderId)
        .maybeSingle();

      if (existingContact) {
        contact = existingContact;
      } else {
        const { data: newContact } = await db
          .from("crm_contacts")
          .insert({
            instagram_id:    senderId,
            display_name:    `Instagram User`,
            source:          "instagram",
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
        .select("id, last_inbound_at")
        .eq("contact_id", contact.id)
        .eq("channel", "instagram")
        .eq("channel_identifier", senderId)
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

        // Increment unread (RPC may not exist yet — fail silently)
        await db.rpc("increment_unread", { convo_id: conversationId }).then(undefined, () => {});
      } else {
        const { data: newConvo } = await db
          .from("crm_conversations")
          .insert({
            contact_id:         contact.id,
            channel:            "instagram",
            channel_identifier: senderId,
            inbox_address:      `instagram:${pageId}`,
            status:             "open",
            last_message_at:    now,
            last_inbound_at:    now,
            unread_count:       1,
          })
          .select("id")
          .single();
        conversationId = newConvo!.id;
      }

      // Insert message
      await db.from("crm_messages").insert({
        conversation_id:     conversationId,
        contact_id:          contact.id,
        direction:           "inbound",
        channel:             "instagram",
        from_address:        senderId,
        from_name:           contact.display_name ?? "Instagram User",
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
