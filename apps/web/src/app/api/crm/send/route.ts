/**
 * POST /api/crm/send
 *
 * Sends an outbound message (email or WhatsApp) from a CRM conversation.
 *
 * Body:
 *  { conversation_id, body, channel?: "email"|"whatsapp", subject?: string, html?: string }
 *
 * For WhatsApp:
 *  - If within the 24-hour free-messaging window (last_inbound_at < 24h ago): sends free-form text
 *  - Outside the window: requires a template_name + template_vars to send via template
 *  - Enqueues to leadash:whatsapp BullMQ queue (same as automation worker)
 *
 * For email:
 *  - Sends via Postal (self-hosted) from the inbox's actual address
 *  - Records in crm_messages
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { uploadWhatsAppMedia, whatsAppMediaType } from "@/lib/whatsapp/media";

const POSTAL_API_KEY  = process.env.POSTAL_API_KEY ?? "";
const POSTAL_HOST     = process.env.POSTAL_HOST    ?? "209.145.55.138";
const POSTAL_API_URL  = `http://${POSTAL_HOST}:5000/api/v1/send/message`;
const GRAPH_API       = "https://graph.facebook.com/v21.0";
const SUPPORT_EMAIL   = process.env.CRM_SUPPORT_EMAIL   ?? "support@leadash.com";
const MARKETING_EMAIL = process.env.CRM_MARKETING_EMAIL ?? "temi@leadash.com";
const ACADEMY_EMAIL   = process.env.CRM_ACADEMY_EMAIL   ?? "academy@leadash.com";
const REDIS_URL       = process.env.UPSTASH_REDIS_URL   ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

function getQueue() {
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  return new Queue("leadash:whatsapp", { connection });
}

interface OutgoingAttachment {
  path:     string; // crm-media storage path, from POST /api/crm/media/upload
  name:     string;
  mimeType: string;
  size:     number;
}

interface SendBody {
  conversation_id: string;
  body:            string;
  channel?:        "email" | "whatsapp" | "instagram";
  subject?:        string;
  html?:           string;
  template_name?:  string;
  template_vars?:  Record<string, string>;
  note?:           boolean; // Internal note — not sent to contact
  attachments?:    OutgoingAttachment[];
  ai_suggested?:   boolean;  // Originated from the AI suggest-mode agent
}

/** Re-downloads an already-uploaded composer attachment's bytes from storage —
 *  never trusts a client-supplied URL for the actual send payload. */
async function downloadAttachment(db: ReturnType<typeof createAdminClient>, path: string): Promise<Buffer | null> {
  const { data, error } = await db.storage.from("crm-media").download(path);
  if (error || !data) { console.error("[crm/send] attachment download failed:", error?.message); return null; }
  return Buffer.from(await data.arrayBuffer());
}

/** Fresh signed URL for storing/display in crm_messages.attachments. */
async function signAttachmentUrl(db: ReturnType<typeof createAdminClient>, path: string): Promise<string | null> {
  const { data } = await db.storage.from("crm-media").createSignedUrl(path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminDb = createAdminClient();
  const { data: admin } = await adminDb.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as SendBody;
  const { conversation_id, body: msgBody, note } = body;
  const attachments = body.attachments ?? [];
  const aiSuggested = body.ai_suggested === true && !note;

  if (!conversation_id || (!msgBody?.trim() && !attachments.length)) {
    return NextResponse.json({ error: "conversation_id and a body or attachment are required" }, { status: 400 });
  }

  const db  = adminDb;
  const now = new Date().toISOString();

  // ── Load conversation + contact ──────────────────────────────────────────
  const { data: convo, error: convoErr } = await db
    .from("crm_conversations")
    .select(`
      id, channel, inbox_address, channel_identifier, status,
      last_inbound_at,
      crm_contacts ( id, email, whatsapp_number, instagram_id, display_name )
    `)
    .eq("id", conversation_id)
    .single();

  if (convoErr || !convo) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const channel = body.channel ?? (convo.channel as "email" | "whatsapp" | "instagram");
  const contact = convo.crm_contacts as Record<string, string | null> | null;

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Internal notes live in crm_messages with is_internal_note=true (mig
  // 20260722100000). One table, one query, shared timeline. The
  // last-message trigger deliberately skips notes so they don't clobber
  // the customer-facing snippet in the conversation list.
  if (note) {
    const { error: noteErr } = await db.from("crm_messages").insert({
      conversation_id,
      contact_id:       contact.id,
      direction:        "outbound",
      channel:          channel === "whatsapp" ? "whatsapp" : "email",
      body:             msgBody,
      sent_by:          user.id,
      status:           "sent",
      is_internal_note: true,
    });
    if (noteErr) {
      console.error("[crm/send] note insert error:", noteErr);
      return NextResponse.json({ error: "Failed to save note" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, type: "note" });
  }

  // ── Email send ──────────────────────────────────────────────────────────
  if (channel === "email") {
    const toEmail = contact.email;
    if (!toEmail) return NextResponse.json({ error: "Contact has no email" }, { status: 400 });

    const inbox       = (convo.inbox_address as string);
    const fromEmail   = inbox === "marketing" ? MARKETING_EMAIL
                      : inbox === "academy"   ? ACADEMY_EMAIL
                      :                        SUPPORT_EMAIL;
    const subject     = body.subject ?? `Re: ${convo.channel_identifier ?? "Your inquiry"}`;

    // Postal wants { name, content_type, data (base64) } per attachment (confirmed
    // against legacy_api/send_controller.rb) — re-download bytes from our own
    // storage rather than trusting anything client-supplied.
    const postalAttachments: { name: string; content_type: string; data: string }[] = [];
    const storedAttachments: { name: string; mimeType: string; size: number; url: string }[] = [];
    for (const att of attachments) {
      const buffer = await downloadAttachment(db, att.path);
      if (!buffer) continue;
      postalAttachments.push({ name: att.name, content_type: att.mimeType, data: buffer.toString("base64") });
      const url = await signAttachmentUrl(db, att.path);
      if (url) storedAttachments.push({ name: att.name, mimeType: att.mimeType, size: att.size, url });
    }

    const postalRes = await fetch(POSTAL_API_URL, {
      method:  "POST",
      headers: { "X-Server-API-Key": POSTAL_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:       fromEmail,
        to:         [toEmail],
        subject,
        plain_body: msgBody,
        html_body:  body.html ?? `<p>${msgBody.replace(/\n/g, "<br>")}</p>`,
        ...(postalAttachments.length ? { attachments: postalAttachments } : {}),
      }),
    });

    const postalData = await postalRes.json() as { status: string; data?: { message_id?: string; code?: string; message?: string } };
    if (!postalRes.ok || postalData.status !== "success") {
      console.error("[crm/send] Postal error:", postalData);
      return NextResponse.json({ error: postalData.data?.message ?? "Email send failed" }, { status: 502 });
    }

    // Insert CRM message
    await db.from("crm_messages").insert({
      conversation_id,
      contact_id:         contact.id,
      direction:          "outbound",
      channel:            "email",
      from_address:       fromEmail,
      subject,
      body:               msgBody,
      body_html:          body.html ?? null,
      attachments:        storedAttachments,
      provider_message_id: postalData.data?.message_id ?? null,
      sent_by:            user.id,
      status:             "sent",
      ai_suggested:       aiSuggested,
    });

    // Update conversation
    await db.from("crm_conversations").update({
      last_message_at: now,
      status: (convo.status === "resolved" || convo.status === "closed") ? "open" : convo.status,
    }).eq("id", conversation_id);

    return NextResponse.json({ ok: true, type: "email", provider_id: postalData.data?.message_id });
  }

  // ── WhatsApp send ────────────────────────────────────────────────────────
  if (channel === "whatsapp") {
    const waNumber = contact.whatsapp_number;
    if (!waNumber) return NextResponse.json({ error: "Contact has no WhatsApp number" }, { status: 400 });

    // Check 24-hour window
    const lastInbound = convo.last_inbound_at ? new Date(convo.last_inbound_at as string) : null;
    const windowOpen  = lastInbound && (Date.now() - lastInbound.getTime()) < 24 * 60 * 60 * 1000;

    // ── Media attachments — Meta sends one media item per message, so each
    // attachment becomes its own message (uploaded to Meta up front here,
    // then referenced by media ID in the enqueued job). Same 24h-window rule
    // as free-form text — only templates can send outside the window.
    if (attachments.length) {
      if (!windowOpen) {
        return NextResponse.json({
          error: "24-hour window expired. Attachments can't be sent outside the window (templates only).",
          requires_template: true,
        }, { status: 422 });
      }

      const { data: channelCfg } = await db
        .from("crm_channel_configs")
        .select("config, credentials")
        .eq("channel", "whatsapp")
        .single();
      const phoneNumberId = channelCfg?.config?.phone_number_id as string | undefined;
      const accessToken   = channelCfg?.credentials?.access_token as string | undefined;
      if (!phoneNumberId || !accessToken) {
        return NextResponse.json({ error: "WhatsApp not connected — configure it in CRM Settings" }, { status: 400 });
      }

      const q = getQueue();
      let sentCount = 0;
      for (const [i, att] of attachments.entries()) {
        const buffer = await downloadAttachment(db, att.path);
        if (!buffer) continue;
        const mediaId = await uploadWhatsAppMedia(phoneNumberId, accessToken, buffer, att.mimeType, att.name);
        if (!mediaId) continue;

        const mediaType = whatsAppMediaType(att.mimeType);
        const caption = i === 0 ? (msgBody || undefined) : undefined;

        const { data: waMsgRecord } = await db.from("whatsapp_messages").insert({
          phone_number:  waNumber,
          direction:     "outbound",
          body:          caption ?? `[${mediaType}]`,
          status:        "pending",
          source:        "crm",
        }).select("id").single();

        await q.add("send", {
          phone_number: waNumber,
          message_id:   waMsgRecord?.id,
          media:        { id: mediaId, type: mediaType, caption, filename: att.name },
          source:       "crm",
        }, { attempts: 6 });

        const url = await signAttachmentUrl(db, att.path);
        await db.from("crm_messages").insert({
          conversation_id,
          contact_id:         contact.id,
          direction:          "outbound",
          channel:            "whatsapp",
          body:               caption ?? "",
          wa_message_type:    mediaType,
          attachments:        url ? [{ name: att.name, mimeType: att.mimeType, size: att.size, url }] : [],
          provider_message_id: waMsgRecord?.id ?? null,
          sent_by:            user.id,
          status:             "sent",
        });
        sentCount++;
      }
      await q.close();

      if (!sentCount) return NextResponse.json({ error: "Failed to send attachment(s)" }, { status: 502 });

      await db.from("crm_conversations").update({
        last_message_at: now,
        status: (convo.status === "resolved" || convo.status === "closed") ? "open" : convo.status,
      }).eq("id", conversation_id);

      return NextResponse.json({ ok: true, type: "whatsapp", sent: sentCount });
    }

    let waPayload: Record<string, unknown>;

    if (body.template_name) {
      // Template send — works any time (inside or outside the 24-hour window)
      waPayload = {
        phone_number:    waNumber,
        message_type:    "template",
        template_name:   body.template_name,
        template_params: body.template_vars ?? {},
        source:          "crm",
        conversation_id,
        sent_by:         user.id,
      };
    } else if (windowOpen) {
      // Free-form text (within 24-hour window, no template specified)
      waPayload = {
        phone_number: waNumber,
        message_type: "text",
        body:         msgBody,
        source:       "crm",
        conversation_id,
        sent_by:      user.id,
      };
    } else {
      // Outside window, no template — block
      return NextResponse.json({
        error: "24-hour window expired. A template_name is required to send outside the window.",
        requires_template: true,
      }, { status: 422 });
    }

    // Insert whatsapp_messages record first (worker will update status)
    const { data: waMsgRecord } = await db.from("whatsapp_messages").insert({
      phone_number:  waNumber,
      direction:     "outbound",
      body:          msgBody,
      status:        "pending",
      source:        "crm",
      template_name: body.template_name ?? null,
    }).select("id").single();

    // Enqueue to BullMQ
    const q = getQueue();
    await q.add("send", { ...waPayload, message_id: waMsgRecord?.id }, { attempts: 6 });
    await q.close();

    // Insert CRM message
    const { error: crmMsgErr } = await db.from("crm_messages").insert({
      conversation_id,
      contact_id:         contact.id,
      direction:          "outbound",
      channel:            "whatsapp",
      body:               msgBody,
      wa_message_type:    windowOpen ? "text" : "template",
      provider_message_id: waMsgRecord?.id ?? null,
      sent_by:            user.id,
      status:             "sent",
      ai_suggested:       aiSuggested,
    });
    if (crmMsgErr) console.error("[crm/send] failed to insert crm_messages:", crmMsgErr.message);

    // Update conversation
    await db.from("crm_conversations").update({
      last_message_at: now,
      status: (convo.status === "resolved" || convo.status === "closed") ? "open" : convo.status,
    }).eq("id", conversation_id);

    return NextResponse.json({ ok: true, type: "whatsapp", within_window: windowOpen });
  }

  // ── Instagram send ───────────────────────────────────────────────────────
  if (channel === "instagram") {
    const igsid = contact.instagram_id;
    if (!igsid) return NextResponse.json({ error: "Contact has no Instagram ID" }, { status: 400 });

    const { data: channelCfg } = await db
      .from("crm_channel_configs")
      .select("config, credentials")
      .eq("channel", "instagram")
      .single();
    const pageId      = channelCfg?.config?.page_id as string | undefined;
    const accessToken = channelCfg?.credentials?.access_token as string | undefined;
    if (!pageId || !accessToken) {
      return NextResponse.json({ error: "Instagram not connected — configure it in CRM Settings" }, { status: 400 });
    }

    const igRes = await fetch(`${GRAPH_API}/${pageId}/messages?access_token=${encodeURIComponent(accessToken)}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: igsid },
        message:   { text: msgBody },
      }),
    });

    const igData = await igRes.json() as { message_id?: string; error?: { message?: string } };
    if (!igRes.ok || igData.error) {
      console.error("[crm/send] Instagram send error:", igData.error ?? igData);
      return NextResponse.json({ error: igData.error?.message ?? "Instagram send failed" }, { status: 502 });
    }

    await db.from("crm_messages").insert({
      conversation_id,
      contact_id:          contact.id,
      direction:           "outbound",
      channel:             "instagram",
      from_address:        pageId,
      body:                msgBody,
      provider_message_id: igData.message_id ?? null,
      sent_by:             user.id,
      status:              "sent",
      ai_suggested:        aiSuggested,
    });

    await db.from("crm_conversations").update({
      last_message_at: now,
      status: (convo.status === "resolved" || convo.status === "closed") ? "open" : convo.status,
    }).eq("id", conversation_id);

    return NextResponse.json({ ok: true, type: "instagram", provider_id: igData.message_id });
  }

  return NextResponse.json({ error: "Unsupported channel" }, { status: 400 });
}
