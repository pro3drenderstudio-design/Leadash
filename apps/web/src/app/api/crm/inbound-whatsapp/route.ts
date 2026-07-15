/**
 * POST /api/crm/inbound-whatsapp
 *
 * Receives Meta Cloud API webhooks for inbound WhatsApp messages.
 * Also handles delivery receipts (status updates).
 *
 * GET handles the webhook verification challenge from Meta.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createHmac } from "crypto";
import { fetchWhatsAppMedia, type WhatsAppMediaResult } from "@/lib/whatsapp/media";
import { enqueueAutomation } from "@/lib/queue/client";
import { normalisePhoneNG } from "@/lib/phone";

const APP_SECRET      = process.env.WHATSAPP_APP_SECRET  ?? "";
const VERIFY_TOKEN    = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
const RESEND_API_KEY  = process.env.RESEND_API_KEY        ?? "";
const RESEND_FROM     = process.env.RESEND_FROM_EMAIL     ?? "no-reply@notifications.leadash.com";
const SUPPORT_EMAIL   = process.env.CRM_SUPPORT_EMAIL     ?? "support@leadash.com";
const APP_URL         = process.env.NEXT_PUBLIC_APP_URL   ?? "https://leadash.com";

function verifySignature(rawBody: string, sig: string): boolean {
  if (!APP_SECRET) return true; // Dev mode
  const hash = createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");
  return `sha256=${hash}` === sig;
}

// ── Meta webhook verification challenge ───────────────────────────────────
export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get("hub.mode");
  const token     = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig     = req.headers.get("x-hub-signature-256") ?? "";

  if (!verifySignature(rawBody, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db  = createAdminClient();
  const now = new Date().toISOString();

  // Lazily resolved + memoized for this request — mirrors the outbound worker's
  // "read fresh from crm_channel_configs so it can be rotated without a redeploy" pattern.
  let cachedAccessToken: string | null | undefined;
  async function getWhatsAppAccessToken(): Promise<string | null> {
    if (cachedAccessToken !== undefined) return cachedAccessToken;
    const { data: channelCfg } = await db
      .from("crm_channel_configs")
      .select("credentials")
      .eq("channel", "whatsapp")
      .single();
    cachedAccessToken = (channelCfg?.credentials?.access_token as string | undefined) ?? null;
    return cachedAccessToken;
  }

  const entries = (body.entry as Array<Record<string, unknown>>) ?? [];

  for (const entry of entries) {
    const changes = (entry.changes as Array<Record<string, unknown>>) ?? [];
    for (const change of changes) {
      const value = change.value as Record<string, unknown>;
      if (!value) continue;

      // ── Delivery/read status updates ───────────────────────────────────
      const statuses = (value.statuses as Array<Record<string, unknown>>) ?? [];
      for (const status of statuses) {
        const providerMsgId = status.id as string;
        const newStatus     = status.status as string; // sent | delivered | read | failed

        // Update whatsapp_messages delivery status
        await db.from("whatsapp_messages")
          .update({ status: newStatus === "read" ? "read" : newStatus === "delivered" ? "delivered" : undefined })
          .eq("provider_message_id", providerMsgId);

        // Update crm_messages delivery status
        const { data: crmMsg } = await db
          .from("crm_messages")
          .select("id")
          .eq("provider_message_id", providerMsgId)
          .maybeSingle();

        if (crmMsg) {
          const update: Record<string, unknown> = { status: newStatus === "read" ? "read" : newStatus === "delivered" ? "delivered" : undefined };
          if (newStatus === "delivered") update.delivered_at = now;
          if (newStatus === "read")      update.read_at      = now;
          if (Object.keys(update).length > 0) {
            await db.from("crm_messages").update(update).eq("id", crmMsg.id);
          }
        }
      }

      // ── Inbound messages ───────────────────────────────────────────────
      const messages = (value.messages as Array<Record<string, unknown>>) ?? [];
      for (const msg of messages) {
        // WhatsApp delivers wa_id as digits-only ("2348012345678"). We normalise
        // to the same 234-prefixed digits-only shape stored by /funnels/submit
        // so a form contact and a WhatsApp contact for the same person link up.
        const rawFrom   = msg.from as string;
        const phone     = normalisePhoneNG(rawFrom) ?? rawFrom.replace(/^\+/, "");
        const msgId     = msg.id as string;
        const msgType   = msg.type as string;
        let   msgBody   = "";
        let   attachments: WhatsAppMediaResult[] = [];
        let   location: { latitude: number; longitude: number; name?: string; address?: string } | null = null;
        let   contacts: { name: string; phone: string }[] = [];

        if (msgType === "text") {
          msgBody = ((msg.text as Record<string, string>)?.body) ?? "";
        } else if (msgType === "image" || msgType === "document" || msgType === "audio" || msgType === "video") {
          const mediaObj = msg[msgType] as { id?: string; caption?: string; filename?: string } | undefined;
          msgBody = mediaObj?.caption ?? "";
          if (mediaObj?.id) {
            const token = await getWhatsAppAccessToken();
            if (token) {
              const media = await fetchWhatsAppMedia(mediaObj.id, token, mediaObj.filename);
              if (media) attachments = [media];
            }
          }
        } else if (msgType === "location") {
          const loc = msg.location as { latitude?: number; longitude?: number; name?: string; address?: string } | undefined;
          if (loc?.latitude != null && loc?.longitude != null) {
            location = { latitude: loc.latitude, longitude: loc.longitude, name: loc.name, address: loc.address };
          }
          msgBody = loc?.name ?? "";
        } else if (msgType === "contacts") {
          const rawContacts = (msg.contacts as Array<Record<string, unknown>>) ?? [];
          contacts = rawContacts
            .map(c => {
              const nameObj = c.name as { formatted_name?: string } | undefined;
              const phones  = (c.phones as Array<{ phone?: string }>) ?? [];
              return { name: nameObj?.formatted_name ?? "Contact", phone: phones[0]?.phone ?? "" };
            })
            .filter(c => c.phone);
        } else {
          msgBody = `[${msgType}]`;
        }

        // ── Upsert contact ──────────────────────────────────────────────
        let contactId: string;
        const { data: existingContact } = await db
          .from("crm_contacts")
          .select("id")
          .eq("whatsapp_number", phone)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (existingContact) {
          contactId = existingContact.id as string;
        } else {
          // Try to find matching Leadash workspace by WA number
          const { data: ws } = await db
            .from("workspaces")
            .select("id, owner_id")
            .eq("whatsapp_number", phone)
            .maybeSingle();

          const { data: newContact } = await db
            .from("crm_contacts")
            .insert({
              whatsapp_number: phone,
              user_id:         ws?.owner_id ?? null,
              workspace_id:    ws?.id       ?? null,
              status:          "active",
            })
            .select("id")
            .single();

          contactId = newContact!.id as string;
        }

        // ── Find or create conversation ──────────────────────────────────
        let conversationId: string;
        const { data: existingConvo } = await db
          .from("crm_conversations")
          .select("id, unread_count, status")
          .eq("contact_id",    contactId)
          .eq("channel",       "whatsapp")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: crmSettings } = await db
          .from("admin_settings")
          .select("key, value")
          .in("key", ["crm_auto_reopen_on_reply", "crm_support_email"]);
        type SettingRow = { key: string; value: unknown };
        const reopenVal  = crmSettings?.find((s: SettingRow) => s.key === "crm_auto_reopen_on_reply")?.value;
        const autoReopen = reopenVal !== "false" && reopenVal !== false;
        const notifyEmail = (crmSettings?.find((s: SettingRow) => s.key === "crm_support_email")?.value as string) || SUPPORT_EMAIL;

        if (existingConvo) {
          conversationId = existingConvo.id as string;
          const updates: Record<string, unknown> = {
            last_message_at: now,
            last_inbound_at: now,  // Resets 24-hour window
            unread_count:    (existingConvo.unread_count as number ?? 0) + 1,
          };
          if (autoReopen && (existingConvo.status === "resolved" || existingConvo.status === "closed")) {
            updates.status = "open";
          }
          await db.from("crm_conversations").update(updates).eq("id", conversationId);
        } else {
          const { data: newConvo } = await db
            .from("crm_conversations")
            .insert({
              contact_id:         contactId,
              channel:            "whatsapp",
              channel_identifier: phone,
              inbox_address:      "support",
              status:             "open",
              last_message_at:    now,
              last_inbound_at:    now,
              unread_count:       1,
            })
            .select("id")
            .single();
          conversationId = newConvo!.id as string;
        }

        // ── Insert CRM message ───────────────────────────────────────────
        await db.from("crm_messages").insert({
          conversation_id:    conversationId,
          contact_id:         contactId,
          direction:          "inbound",
          channel:            "whatsapp",
          body:               msgBody,
          wa_message_type:    msgType,
          provider_message_id: msgId,
          status:             "delivered",
          delivered_at:       now,
          attachments,
          location,
          contacts,
        });

        // ── Fire automation trigger ──────────────────────────────────────
        // Emitted for every inbound WhatsApp regardless of caption/type so
        // automations can filter on body / channel / message type themselves.
        // body_lower is denormalised to make case-insensitive keyword flows
        // easy to author in the builder ("contains 'paid'" etc.).
        await enqueueAutomation({
          event:        "crm.message_received",
          workspace_id: null,
          user_id:      null,
          payload: {
            contact_id:      contactId,
            conversation_id: conversationId,
            channel:         "whatsapp",
            direction:       "inbound",
            body:            msgBody ?? "",
            body_lower:     (msgBody ?? "").toLowerCase(),
            wa_message_type: msgType,
            phone,
          },
        }).catch(err => console.error("[crm/inbound-whatsapp] automation enqueue error:", err));

        // Admin notification email — fire and forget. msgBody can legitimately be
        // empty for media/location/contact messages with no caption, so fall back
        // to a type-appropriate description rather than requiring body text.
        const notifyPreview = msgBody
          || (attachments.length ? `[${msgType} message]` : null)
          || (location ? "[location shared]" : null)
          || (contacts.length ? "[contact shared]" : null)
          || `[${msgType}]`;
        if (RESEND_API_KEY && notifyEmail) {
          fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from:    `Leadash CRM <${RESEND_FROM}>`,
              to:      [notifyEmail],
              subject: `New WhatsApp from ${phone}`,
              html:    `<p><strong>${phone}</strong> sent a WhatsApp message:</p><blockquote style="border-left:3px solid #25d366;padding-left:12px;color:#374151">${notifyPreview.slice(0, 400).replace(/\n/g, "<br>")}</blockquote><p><a href="${APP_URL}/admin/crm?id=${conversationId}">View in CRM →</a></p>`,
            }),
          }).catch(() => {});
        }

        // Also record in whatsapp_messages for audit trail
        await db.from("whatsapp_messages").insert({
          phone_number:        phone,
          direction:           "inbound",
          body:                msgBody,
          status:              "delivered",
          source:              "crm",
          provider_message_id: msgId,
        }).then(() => {}).catch(() => {}); // Non-fatal
      }
    }
  }

  return NextResponse.json({ ok: true });
}
