/**
 * Instagram DM Webhook
 *
 * GET  — webhook verification (hub.mode, hub.challenge, hub.verify_token)
 * POST — inbound + echo DM events from Meta Graph API
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
 *       message: { mid: "MID", text: "Hello", is_echo?: true }
 *     }]
 *   }]
 * }
 *
 * Edge cases handled:
 * - Duplicate mid → idempotent (skip if provider_message_id already exists)
 * - Media messages (image/video/audio) → downloaded + re-hosted so they render
 *   inline (see @/lib/instagram/media); reshared posts/reels/story mentions/
 *   other non-binary share types → linked directly, rendered as a link chip
 * - Echo messages (is_echo: true — our own outbound send, echoed back by Meta) →
 *   recorded as an outbound message on the customer's conversation. The customer
 *   is recipient.id here (sender.id is the page), which is the opposite of the
 *   inbound case — sender.id/recipient.id are never equal in either direction,
 *   so is_echo is the only reliable signal.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchInstagramMedia, instagramAttachmentLabel, type InstagramRichAttachment } from "@/lib/instagram/media";
import { fetchInstagramProfile } from "@/lib/instagram/profile";

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
    is_echo?:    boolean;
    attachments?: Array<{ type: string; payload: { url?: string; title?: string } }>;
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

  // Lazily resolved + memoized for this request — mirrors inbound-whatsapp's
  // "read fresh from crm_channel_configs so it can be rotated without a redeploy" pattern.
  let cachedAccessToken: string | null | undefined;
  async function getInstagramAccessToken(): Promise<string | null> {
    if (cachedAccessToken !== undefined) return cachedAccessToken;
    const { data: channelCfg } = await db
      .from("crm_channel_configs")
      .select("credentials")
      .eq("channel", "instagram")
      .single();
    cachedAccessToken = (channelCfg?.credentials?.access_token as string | undefined) ?? null;
    return cachedAccessToken;
  }

  for (const entry of body.entry ?? []) {
    const pageId = entry.id;

    for (const event of entry.messaging ?? []) {
      if (!event.message) continue;

      const isEcho = event.message.is_echo === true;
      // For a genuine inbound DM the customer is the sender; for an echo of our
      // own outbound send, Meta reports it from the page's perspective, so the
      // customer is the recipient instead.
      const customerId = isEcho ? event.recipient.id : event.sender.id;
      const direction   = isEcho ? "outbound" : "inbound";

      const mid       = event.message.mid;
      const text       = event.message.text ?? null;
      const timestamp  = new Date(event.timestamp).toISOString();

      // Binary media (image/video/audio) gets downloaded + re-hosted so it renders
      // inline via the shared AttachmentGrid component; everything else (reshared
      // posts/reels, story mentions, generic templates) is linked directly.
      const richAttachments: InstagramRichAttachment[] = [];
      for (const [i, att] of (event.message.attachments ?? []).entries()) {
        if (!att.payload?.url) continue;
        const media = await fetchInstagramMedia(att.payload.url, mid, i);
        if (media) {
          richAttachments.push(media);
        } else {
          richAttachments.push({
            name:     att.payload.title ?? instagramAttachmentLabel(att.type),
            mimeType: "application/octet-stream",
            size:     0,
            url:      att.payload.url,
          });
        }
      }

      let msgBody = text;
      if (!msgBody && richAttachments.length) {
        const att = event.message.attachments![0];
        msgBody = `[${instagramAttachmentLabel(att.type)}]`;
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
      let contact: { id: string; display_name: string | null } | null = null;
      const { data: existingContact } = await db
        .from("crm_contacts")
        .select("id, display_name")
        .eq("instagram_id", customerId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingContact) {
        contact = existingContact;
      } else {
        let displayName = "Instagram User";
        if (!isEcho) {
          const accessToken = await getInstagramAccessToken();
          if (accessToken) {
            const fetchedName = await fetchInstagramProfile(customerId, accessToken);
            if (fetchedName) displayName = fetchedName;
          }
        }
        const { data: newContact } = await db
          .from("crm_contacts")
          .insert({
            instagram_id:    customerId,
            display_name:    displayName,
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
        .eq("contact_id",         contact.id)
        .eq("channel",            "instagram")
        .eq("channel_identifier", customerId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      let conversationId: string;
      const now = new Date().toISOString();

      if (existingConvo) {
        conversationId = existingConvo.id;
        const updates: Record<string, unknown> = {
          last_message_at: now,
          updated_at:      now,
        };
        if (!isEcho) {
          updates.last_inbound_at = now;
          updates.status          = "open";
        }
        await db.from("crm_conversations").update(updates).eq("id", conversationId);

        if (!isEcho) {
          await db.rpc("increment_unread", { convo_id: conversationId }).then(undefined, () => {});
        }
      } else {
        const { data: newConvo } = await db
          .from("crm_conversations")
          .insert({
            contact_id:         contact.id,
            channel:            "instagram",
            channel_identifier: customerId,
            inbox_address:      `instagram:${pageId}`,
            status:             "open",
            last_message_at:    now,
            last_inbound_at:    isEcho ? null : now,
            unread_count:       isEcho ? 0 : 1,
          })
          .select("id")
          .single();
        conversationId = newConvo!.id;
      }

      // Insert message
      await db.from("crm_messages").insert({
        conversation_id:     conversationId,
        contact_id:          contact.id,
        direction,
        channel:             "instagram",
        from_address:        isEcho ? pageId : customerId,
        from_name:           isEcho ? null : (contact.display_name ?? "Instagram User"),
        body:                msgBody,
        attachments:         richAttachments,
        provider_message_id: mid,
        provider_thread_id:  conversationId,
        status:              isEcho ? "sent" : "delivered",
        delivered_at:        timestamp,
        created_at:          timestamp,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
