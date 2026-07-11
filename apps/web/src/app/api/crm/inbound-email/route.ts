/**
 * POST /api/crm/inbound-email
 *
 * Receives inbound email webhooks from Postal.
 * Creates or updates crm_contacts, crm_conversations, and crm_messages.
 * Postal sends a JSON payload for each inbound email.
 *
 * Verify with POSTAL_WEBHOOK_SECRET (shared secret header).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createHmac } from "crypto";
import { enqueueAutomation } from "@/lib/queue/client";

const SECRET          = process.env.POSTAL_WEBHOOK_SECRET;
const SUPPORT_EMAIL   = process.env.CRM_SUPPORT_EMAIL   ?? "support@leadash.com";
const MARKETING_EMAIL = process.env.CRM_MARKETING_EMAIL ?? "temi@leadash.com";
const ACADEMY_EMAIL   = process.env.CRM_ACADEMY_EMAIL   ?? "academy@leadash.com";
const RESEND_API_KEY  = process.env.RESEND_API_KEY ?? "";
const RESEND_FROM     = process.env.RESEND_FROM_EMAIL ?? "no-reply@notifications.leadash.com";
const APP_URL         = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";

interface PostalPayload {
  id:          number;
  rcpt_to:     string;
  mail_from:   string;
  subject?:    string;
  plain_body?: string;
  html_body?:  string;
  // Postal's Hash-format webhook (confirmed against http_sender.rb): base64 body
  // content is included per-attachment whenever the HTTP endpoint has
  // include_attachments enabled (it is, on all our live endpoints).
  attachments?: Array<{ filename: string; content_type: string; size: number; data?: string }>;
  message_id?: string;
  in_reply_to?: string;
}

interface StoredAttachment { name: string; mimeType: string; size: number; url: string; }

/** Decode Postal's base64 attachment bodies and persist them to Storage. */
async function storeEmailAttachments(
  db: ReturnType<typeof createAdminClient>,
  messageId: number,
  attachments: PostalPayload["attachments"],
): Promise<StoredAttachment[]> {
  if (!attachments?.length) return [];

  const results: StoredAttachment[] = [];
  for (const [i, att] of attachments.entries()) {
    if (!att.data) continue; // no content included — skip rather than store a broken reference
    try {
      const buffer = Buffer.from(att.data, "base64");
      const safeName = att.filename.replace(/[^a-zA-Z0-9._-]/g, "_") || `attachment-${i}`;
      const path = `email/${messageId}/${i}-${safeName}`;

      const { error: uploadError } = await db.storage
        .from("crm-media")
        .upload(path, buffer, { contentType: att.content_type, upsert: true });
      if (uploadError) { console.error("[inbound-email] attachment upload failed:", uploadError.message); continue; }

      const { data: signed } = await db.storage.from("crm-media").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (!signed?.signedUrl) continue;

      results.push({ name: att.filename, mimeType: att.content_type, size: att.size, url: signed.signedUrl });
    } catch (e) {
      console.error("[inbound-email] attachment processing failed:", e);
    }
  }
  return results;
}

function verifySignature(rawBody: string, sig: string): boolean {
  if (!SECRET) return true; // Dev mode: skip verification
  const expected = createHmac("sha256", SECRET).update(rawBody).digest("hex");
  return expected === sig;
}

function resolveInbox(to: string): "support" | "marketing" | "academy" | null {
  const normalized = to.toLowerCase().trim();
  if (normalized.includes(SUPPORT_EMAIL.toLowerCase()))   return "support";
  if (normalized.includes(MARKETING_EMAIL.toLowerCase())) return "marketing";
  if (normalized.includes(ACADEMY_EMAIL.toLowerCase()))   return "academy";
  return null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig     = req.headers.get("x-postal-signature") ?? "";

  if (!verifySignature(rawBody, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: PostalPayload;
  try {
    payload = JSON.parse(rawBody) as PostalPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = createAdminClient();

  const inbox = resolveInbox(payload.rcpt_to);
  if (!inbox) {
    // Not one of our CRM inboxes — ignore
    return NextResponse.json({ ok: true });
  }

  const fromEmail = payload.mail_from.toLowerCase().trim().replace(/^.*<(.+)>$/, "$1");
  const fromName  = payload.mail_from.replace(/<.+>/, "").trim().replace(/^"|"$/g, "").trim() || null;

  // ── 1. Upsert contact ────────────────────────────────────────────────────
  let contactId: string;
  const { data: existing } = await db
    .from("crm_contacts")
    .select("id")
    .eq("email", fromEmail)
    .maybeSingle();

  if (existing) {
    contactId = existing.id as string;
    if (fromName) {
      await db.from("crm_contacts").update({ display_name: fromName }).eq("id", contactId);
    }
  } else {
    // Try to link to a Leadash user
    const { data: authData } = await db.auth.admin.listUsers();
    const matchedUser = authData?.users?.find((u: { email?: string; id: string }) => u.email === fromEmail);

    let workspaceId: string | null = null;
    if (matchedUser) {
      const { data: member } = await db
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", matchedUser.id)
        .limit(1)
        .maybeSingle();
      workspaceId = member?.workspace_id ?? null;
    }

    const { data: newContact } = await db
      .from("crm_contacts")
      .insert({
        email:        fromEmail,
        display_name: fromName,
        user_id:      matchedUser?.id ?? null,
        workspace_id: workspaceId,
        status:       "active",
      })
      .select("id")
      .single();

    contactId = newContact!.id as string;
  }

  // ── 2. Find or create conversation ───────────────────────────────────────
  // Thread by: contact + inbox + email subject (strip Re:/Fwd: prefixes)
  const baseSubject = (payload.subject ?? "").replace(/^(Re|Fwd?):\s*/i, "").trim();
  const threadId    = payload.in_reply_to ?? payload.message_id ?? null;
  const now         = new Date().toISOString();

  let conversationId: string;
  const { data: existingConvo } = await db
    .from("crm_conversations")
    .select("id, unread_count, status")
    .eq("contact_id",    contactId)
    .eq("channel",       "email")
    .eq("inbox_address", inbox)
    .eq("subject",       baseSubject)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Load auto-reopen setting
  const { data: crmSettings } = await db
    .from("admin_settings")
    .select("key, value")
    .in("key", ["crm_auto_reopen_on_reply", "crm_support_email"]);
  type SettingRow = { key: string; value: unknown };
  const reopenVal = crmSettings?.find((s: SettingRow) => s.key === "crm_auto_reopen_on_reply")?.value;
  const autoReopen = reopenVal !== "false" && reopenVal !== false;
  const notifyEmail = (crmSettings?.find((s: SettingRow) => s.key === "crm_support_email")?.value as string) || SUPPORT_EMAIL;

  if (existingConvo) {
    conversationId = existingConvo.id as string;
    const updates: Record<string, unknown> = {
      last_message_at:  now,
      last_inbound_at:  now,
      unread_count:     (existingConvo.unread_count as number ?? 0) + 1,
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
        channel:            "email",
        inbox_address:      inbox,
        channel_identifier: fromEmail,
        subject:            baseSubject,
        status:             "open",
        last_message_at:    now,
        last_inbound_at:    now,
        unread_count:       1,
      })
      .select("id")
      .single();
    conversationId = newConvo!.id as string;
  }

  // ── 3. Insert message ─────────────────────────────────────────────────────
  const storedAttachments = await storeEmailAttachments(db, payload.id, payload.attachments);

  await db.from("crm_messages").insert({
    conversation_id:    conversationId,
    contact_id:         contactId,
    direction:          "inbound",
    channel:            "email",
    from_address:       fromEmail,
    from_name:          fromName,
    subject:            payload.subject ?? null,
    body:               payload.plain_body ?? null,
    body_html:          payload.html_body  ?? null,
    attachments:        storedAttachments,
    provider_message_id: String(payload.id),
    provider_thread_id:  threadId,
    status:             "delivered",
    delivered_at:       now,
  });

  // ── Fire automation trigger ────────────────────────────────────────────
  // Same event shape as inbound-whatsapp so a single flow can react to both
  // channels (branching on payload.channel if needed).
  await enqueueAutomation({
    event:        "crm.message_received",
    workspace_id: null,
    user_id:      null,
    payload: {
      contact_id:      contactId,
      conversation_id: conversationId,
      channel:         "email",
      direction:       "inbound",
      body:            payload.plain_body ?? "",
      body_lower:     (payload.plain_body ?? "").toLowerCase(),
      subject:         payload.subject ?? null,
      email:           fromEmail,
    },
  }).catch(err => console.error("[crm/inbound-email] automation enqueue error:", err));

  // Admin notification email — fire and forget
  if (RESEND_API_KEY && notifyEmail) {
    const preview = payload.plain_body?.slice(0, 400) ?? "";
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:     `Leadash CRM <${RESEND_FROM}>`,
        to:       [notifyEmail],
        reply_to: [fromEmail],
        subject:  `New email from ${fromName || fromEmail}`,
        html:     `<p><strong>${fromName || fromEmail}</strong> sent a message${payload.subject ? ` re: <em>${payload.subject}</em>` : ""}:</p><blockquote style="border-left:3px solid #e5e7eb;padding-left:12px;color:#374151">${preview.replace(/\n/g, "<br>")}</blockquote><p><a href="${APP_URL}/admin/crm?id=${conversationId}">View in CRM →</a></p>`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
