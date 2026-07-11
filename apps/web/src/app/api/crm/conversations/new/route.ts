/**
 * POST /api/crm/conversations/new
 *
 * Initiates an outbound conversation from the CRM.
 * Creates the contact if they don't exist, creates the conversation,
 * and sends the first message.
 *
 * Body:
 *  {
 *    channel:        "email" | "whatsapp"
 *    to:             string           — email address or phone number
 *    name?:          string           — display name for new contacts
 *    inbox?:         "support" | "marketing" | "academy"   (email only, default "support")
 *    subject?:       string           — email subject
 *    body:           string           — message body
 *    template_name?: string           — WhatsApp template name (cold outreach)
 *    template_vars?: Record<string,string>
 *  }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const POSTAL_API_KEY  = process.env.POSTAL_API_KEY ?? "";
const POSTAL_HOST     = process.env.POSTAL_HOST    ?? "209.145.55.138";
const POSTAL_API_URL  = `http://${POSTAL_HOST}:5000/api/v1/send/message`;
const SUPPORT_EMAIL   = process.env.CRM_SUPPORT_EMAIL   ?? "support@leadash.com";
const MARKETING_EMAIL = process.env.CRM_MARKETING_EMAIL ?? "temi@leadash.com";
const ACADEMY_EMAIL   = process.env.CRM_ACADEMY_EMAIL   ?? "academy@leadash.com";
const REDIS_URL       = process.env.UPSTASH_REDIS_URL   ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, db };
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\s+/g, "").replace(/[^0-9+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`; // default Nigeria prefix
  return `+${digits}`;
}

interface NewConvoBody {
  channel:        "email" | "whatsapp";
  to:             string;
  name?:          string;
  inbox?:         "support" | "marketing" | "academy";
  subject?:       string;
  body:           string;
  template_name?: string;
  template_vars?: Record<string, string>;
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { user, db } = ctx;

  const payload = await req.json() as NewConvoBody;
  const { channel, body: msgBody, name, template_name, template_vars } = payload;
  const inbox = payload.inbox ?? "support";

  if (!channel || !payload.to?.trim() || !msgBody?.trim()) {
    return NextResponse.json({ error: "channel, to, and body are required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // ── 1. Normalise the recipient ───────────────────────────────────────────
  const isEmail = channel === "email";
  const to      = isEmail
    ? payload.to.toLowerCase().trim()
    : normalizePhone(payload.to.trim());

  // ── 2. Upsert contact ────────────────────────────────────────────────────
  let contactId: string;
  const { data: existing } = isEmail
    ? await db.from("crm_contacts").select("id").eq("email", to).maybeSingle()
    : await db.from("crm_contacts").select("id").eq("whatsapp_number", to).maybeSingle();

  if (existing) {
    contactId = existing.id as string;
    if (name) await db.from("crm_contacts").update({ display_name: name }).eq("id", contactId);
  } else {
    const insert = isEmail
      ? { email: to, display_name: name ?? null, status: "active" }
      : { whatsapp_number: to, display_name: name ?? null, status: "active" };
    const { data: newContact, error: contactErr } = await db
      .from("crm_contacts").insert(insert).select("id").single();
    if (contactErr || !newContact) {
      return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
    }
    contactId = newContact.id as string;
  }

  // ── 3. Create conversation ────────────────────────────────────────────────
  const subject    = payload.subject?.trim() || null;
  const convoInsert = isEmail
    ? {
        contact_id:         contactId,
        channel:            "email",
        inbox_address:      inbox,
        channel_identifier: to,
        subject:            subject ?? "(no subject)",
        status:             "open",
        last_message_at:    now,
      }
    : {
        contact_id:         contactId,
        channel:            "whatsapp",
        inbox_address:      "support",
        channel_identifier: to,
        status:             "open",
        last_message_at:    now,
      };

  const { data: convo, error: convoErr } = await db
    .from("crm_conversations").insert(convoInsert).select("id").single();
  if (convoErr || !convo) {
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
  }
  const conversationId = convo.id as string;

  // ── 4. Send the message ───────────────────────────────────────────────────
  if (isEmail) {
    const fromEmail = inbox === "marketing" ? MARKETING_EMAIL
                    : inbox === "academy"   ? ACADEMY_EMAIL
                    :                        SUPPORT_EMAIL;

    const postalRes = await fetch(POSTAL_API_URL, {
      method:  "POST",
      headers: { "X-Server-API-Key": POSTAL_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:       fromEmail,
        to:         [to],
        subject:    subject ?? "(no subject)",
        plain_body: msgBody,
        html_body:  `<p>${msgBody.replace(/\n/g, "<br>")}</p>`,
      }),
    });

    const postalData = await postalRes.json() as { status: string; data?: { message_id?: string; message?: string } };
    if (!postalRes.ok || postalData.status !== "success") {
      await db.from("crm_conversations").delete().eq("id", conversationId);
      return NextResponse.json({ error: postalData.data?.message ?? "Email send failed" }, { status: 502 });
    }

    await db.from("crm_messages").insert({
      conversation_id:     conversationId,
      contact_id:          contactId,
      direction:           "outbound",
      channel:             "email",
      from_address:        fromEmail,
      subject:             subject,
      body:                msgBody,
      provider_message_id: postalData.data?.message_id ?? null,
      sent_by:             user.id,
      status:              "sent",
    });

  } else {
    // WhatsApp — always a cold send (no prior inbound), so template is required.
    // If no template provided we still attempt a free-form send; Meta will reject
    // it if the contact has never messaged us, which surfaces as an error.
    const waNumber = to;

    const { data: waMsgRecord } = await db.from("whatsapp_messages").insert({
      phone_number:  waNumber,
      direction:     "outbound",
      body:          msgBody,
      status:        "pending",
      source:        "crm",
      template_name: template_name ?? null,
    }).select("id").single();

    const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    const q = new Queue("leadash:whatsapp", { connection });
    const waPayload = template_name ? {
      phone_number:    waNumber,
      message_type:    "template",
      template_name,
      template_params: template_vars ?? {},
      source:          "crm",
      conversation_id: conversationId,
      sent_by:         user.id,
      message_id:      waMsgRecord?.id,
    } : {
      phone_number: waNumber,
      message_type: "text",
      body:         msgBody,
      source:       "crm",
      conversation_id: conversationId,
      sent_by:      user.id,
      message_id:   waMsgRecord?.id,
    };
    await q.add("send", waPayload, { attempts: 3 });
    await q.close();

    await db.from("crm_messages").insert({
      conversation_id:     conversationId,
      contact_id:          contactId,
      direction:           "outbound",
      channel:             "whatsapp",
      body:                msgBody,
      wa_message_type:     template_name ? "template" : "text",
      provider_message_id: waMsgRecord?.id ?? null,
      sent_by:             user.id,
      status:              "sent",
    });
  }

  return NextResponse.json({ ok: true, conversation_id: conversationId });
}
