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
 *  - Sends via Resend from the inbox's configured address
 *  - Records in crm_messages
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const RESEND_API_KEY  = process.env.RESEND_API_KEY ?? "";
const SUPPORT_FROM    = process.env.CRM_SUPPORT_EMAIL   ?? "support@leadash.com";
const MARKETING_FROM  = process.env.CRM_MARKETING_EMAIL ?? "temi@leadash.com";
const REDIS_URL       = process.env.UPSTASH_REDIS_URL   ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

function getQueue() {
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  return new Queue("leadash:whatsapp", { connection });
}

interface SendBody {
  conversation_id: string;
  body:            string;
  channel?:        "email" | "whatsapp";
  subject?:        string;
  html?:           string;
  template_name?:  string;
  template_vars?:  Record<string, string>;
  note?:           boolean; // Internal note — not sent to contact
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

  if (!conversation_id || !msgBody?.trim()) {
    return NextResponse.json({ error: "conversation_id and body are required" }, { status: 400 });
  }

  const db  = adminDb;
  const now = new Date().toISOString();

  // ── Load conversation + contact ──────────────────────────────────────────
  const { data: convo, error: convoErr } = await db
    .from("crm_conversations")
    .select(`
      id, channel, inbox_address, channel_identifier, status,
      last_inbound_at,
      crm_contacts ( id, email, whatsapp_number, display_name )
    `)
    .eq("id", conversation_id)
    .single();

  if (convoErr || !convo) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const channel = body.channel ?? (convo.channel as "email" | "whatsapp");
  const contact = convo.crm_contacts as Record<string, string | null> | null;

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Internal notes — stored as outbound with a note flag in crm_conversation_notes
  if (note) {
    await db.from("crm_conversation_notes").insert({
      conversation_id,
      body:    msgBody,
      sent_by: user.id,
    }).then(() => {}).catch(async () => {
      // Fallback: table may not exist yet — store as outbound with [NOTE] prefix
      await db.from("crm_messages").insert({
        conversation_id,
        contact_id:   contact.id,
        direction:    "outbound",
        channel:      channel === "whatsapp" ? "whatsapp" : "email",
        body:         `[NOTE] ${msgBody}`,
        sent_by:      user.id,
        status:       "delivered",
        delivered_at: now,
      });
    });
    await db.from("crm_conversations").update({ last_message_at: now }).eq("id", conversation_id);
    return NextResponse.json({ ok: true, type: "note" });
  }

  // ── Email send ──────────────────────────────────────────────────────────
  if (channel === "email") {
    const toEmail = contact.email;
    if (!toEmail) return NextResponse.json({ error: "Contact has no email" }, { status: 400 });

    const fromAddress = (convo.inbox_address as string) === "marketing" ? MARKETING_FROM : SUPPORT_FROM;
    const subject     = body.subject ?? `Re: ${convo.channel_identifier ?? "Your inquiry"}`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    fromAddress,
        to:      [toEmail],
        subject,
        text:    msgBody,
        html:    body.html ?? `<p>${msgBody.replace(/\n/g, "<br>")}</p>`,
      }),
    });

    const resendData = await resendRes.json() as { id?: string; error?: string };
    if (!resendRes.ok) {
      return NextResponse.json({ error: resendData.error ?? "Email send failed" }, { status: 502 });
    }

    // Insert CRM message
    await db.from("crm_messages").insert({
      conversation_id,
      contact_id:         contact.id,
      direction:          "outbound",
      channel:            "email",
      from_address:       fromAddress,
      subject,
      body:               msgBody,
      body_html:          body.html ?? null,
      provider_message_id: resendData.id ?? null,
      sent_by:            user.id,
      status:             "sent",
    });

    // Update conversation
    await db.from("crm_conversations").update({
      last_message_at: now,
      status: (convo.status === "resolved" || convo.status === "closed") ? "open" : convo.status,
    }).eq("id", conversation_id);

    return NextResponse.json({ ok: true, type: "email", provider_id: resendData.id });
  }

  // ── WhatsApp send ────────────────────────────────────────────────────────
  if (channel === "whatsapp") {
    const waNumber = contact.whatsapp_number;
    if (!waNumber) return NextResponse.json({ error: "Contact has no WhatsApp number" }, { status: 400 });

    // Check 24-hour window
    const lastInbound = convo.last_inbound_at ? new Date(convo.last_inbound_at as string) : null;
    const windowOpen  = lastInbound && (Date.now() - lastInbound.getTime()) < 24 * 60 * 60 * 1000;

    let waPayload: Record<string, unknown>;

    if (windowOpen) {
      // Free-form text (within window)
      waPayload = {
        phone_number: waNumber,
        message_type: "text",
        body:         msgBody,
        source:       "crm",
        conversation_id,
        sent_by:      user.id,
      };
    } else {
      // Outside window — must use a template
      if (!body.template_name) {
        return NextResponse.json({
          error: "24-hour window expired. A template_name is required to send outside the window.",
          requires_template: true,
        }, { status: 422 });
      }
      waPayload = {
        phone_number:   waNumber,
        message_type:   "template",
        template_name:  body.template_name,
        template_vars:  body.template_vars ?? {},
        source:         "crm",
        conversation_id,
        sent_by:        user.id,
      };
    }

    // Insert whatsapp_messages record first (worker will update status)
    const { data: waMsgRecord } = await db.from("whatsapp_messages").insert({
      phone_number:  waNumber,
      direction:     "outbound",
      body:          msgBody,
      status:        "pending",
      source:        "crm",
      template_name: windowOpen ? null : (body.template_name ?? null),
    }).select("id").single();

    // Enqueue to BullMQ
    const q = getQueue();
    await q.add("send", { ...waPayload, record_id: waMsgRecord?.id }, { attempts: 6 });
    await q.close();

    // Insert CRM message
    await db.from("crm_messages").insert({
      conversation_id,
      contact_id:         contact.id,
      direction:          "outbound",
      channel:            "whatsapp",
      body:               msgBody,
      wa_message_type:    windowOpen ? "text" : "template",
      provider_message_id: waMsgRecord?.id ?? null,
      sent_by:            user.id,
      status:             "pending",
    });

    // Update conversation
    await db.from("crm_conversations").update({
      last_message_at: now,
      status: (convo.status === "resolved" || convo.status === "closed") ? "open" : convo.status,
    }).eq("id", conversation_id);

    return NextResponse.json({ ok: true, type: "whatsapp", within_window: windowOpen });
  }

  return NextResponse.json({ error: "Unsupported channel" }, { status: 400 });
}
