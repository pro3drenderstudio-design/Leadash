/**
 * Reply ingest pipeline — workspace-scoped for multi-tenant use.
 */

import { createClient } from "@supabase/supabase-js";
import { markEnrollmentReplied } from "@/lib/outreach/scheduler";
import type { OutreachCrmFilter } from "@/types/outreach";

function supabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// ─── OOO patterns ─────────────────────────────────────────────────────────────
const OOO_PATTERNS = [
  /out of (the )?office/i, /on vacation/i, /away from (the )?office/i,
  /automatic(ally)? reply/i, /auto.?reply/i, /i('m| am) currently (away|out|unavailable)/i,
  /will be (back|returning)/i, /on (annual|maternity|paternity|sick) leave/i,
  /currently (out|away|travelling)/i, /this is an automated/i, /do not reply to this (email|message)/i,
];

function detectOoo(subject?: string | null, body?: string | null): boolean {
  const text = `${subject ?? ""} ${body ?? ""}`;
  return OOO_PATTERNS.some(p => p.test(text));
}

// ─── Filter rule application ──────────────────────────────────────────────────
function applyFilters(
  filters: OutreachCrmFilter[],
  msg: { fromEmail: string; subject: string | null; bodyText: string | null },
): { action: string; reason: string; auto_status?: string } | null {
  const body    = (msg.bodyText  ?? "").toLowerCase();
  const subject = (msg.subject   ?? "").toLowerCase();
  const from    = msg.fromEmail.toLowerCase();

  for (const f of filters) {
    const val = f.value.toLowerCase();
    let hit = false;
    switch (f.type) {
      case "phrase":         hit = body.includes(val) || subject.includes(val); break;
      case "subject_phrase": hit = subject.includes(val); break;
      case "sender_email":   hit = from === val; break;
      case "sender_domain":  hit = from.endsWith(`@${val.replace(/^@/, "")}`); break;
    }
    if (hit) return { action: f.action, reason: f.name, auto_status: f.auto_status ?? undefined };
  }
  return null;
}

// ─── AI classification ────────────────────────────────────────────────────────
const VALID_CATEGORIES = new Set(["interested","meeting_booked","not_interested","ooo","follow_up","neutral"]);

async function aiClassify(subject: string | null, bodyText: string | null): Promise<{ category: string; confidence: number }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return { category: "neutral", confidence: 0 };

  const snippet = (bodyText ?? "").slice(0, 500).replace(/\s+/g, " ");
  const prompt = `Classify this cold email reply into one category.
Categories: interested, meeting_booked, not_interested, ooo, follow_up, neutral
Subject: ${subject ?? "(none)"}
Body: ${snippet}
Respond with JSON only: {"category": "...", "confidence": 0.0-1.0}`;

  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const text   = result.response.text().trim().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);
    const category   = VALID_CATEGORIES.has(parsed.category) ? parsed.category : "neutral";
    const confidence = typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5;
    return { category, confidence };
  } catch { return { category: "neutral", confidence: 0 }; }
}

function stripQuotedReply(text: string): string {
  return text.split(/\n[-_]{3,}\n|\nOn .+wrote:\n|^>.*$/m)[0].trim();
}

// ─── IMAP fetch ───────────────────────────────────────────────────────────────
interface RawMessage {
  messageId: string; inReplyTo: string | null; fromEmail: string; fromName: string | null;
  subject: string | null; bodyText: string | null; receivedAt: string; warmupId: string | null;
  /** Provider-level thread/conversation ID (Gmail threadId, Outlook conversationId) for fallback matching */
  threadId?: string | null;
  /** Raw MIME source — used to extract attachments on IMAP inboxes */
  rawSource?: string | null;
}

function deriveImapHost(smtpHost?: string | null): string | null {
  if (!smtpHost) return null;
  const h = smtpHost.toLowerCase();
  if (h.includes("outlook") || h.includes("office365")) return "outlook.office365.com";
  if (h.includes("gmail") || h.includes("googlemail"))  return "imap.gmail.com";
  return h.replace(/^smtp\./, "imap.");
}

async function fetchImapMessages(
  inbox: { id: string; imap_host?: string | null; imap_port?: number | null; smtp_host?: string | null; smtp_user?: string | null; smtp_pass_encrypted?: string | null; email_address: string },
  lookbackDays = 7,
): Promise<{ messages: RawMessage[]; error?: string }> {
  const imapHost = inbox.imap_host || deriveImapHost(inbox.smtp_host);
  if (!imapHost) return { messages: [], error: "no imap_host configured" };

  const { ImapFlow } = await import("imapflow");
  const { decrypt }  = await import("@/lib/outreach/crypto");

  const pass = inbox.smtp_pass_encrypted ? decrypt(inbox.smtp_pass_encrypted) : "";
  const port = inbox.imap_port ?? 993;
  const client = new ImapFlow({
    host: imapHost, port, secure: port === 993 || port === 465,
    auth: { user: inbox.smtp_user!, pass }, logger: false,
    connectionTimeout: 8_000, greetingTimeout: 5_000, socketTimeout: 10_000,
  });

  try { await client.connect(); }
  catch (e) { return { messages: [], error: `IMAP connect: ${String(e).slice(0, 200)}` }; }

  let lock;
  try { lock = await client.getMailboxLock("INBOX"); }
  catch (e) { await client.logout().catch(() => {}); return { messages: [], error: `INBOX lock: ${String(e).slice(0, 200)}` }; }

  const messages: RawMessage[] = [];
  try {
    const since = new Date(Date.now() - lookbackDays * 86_400_000);
    for await (const msg of client.fetch({ since }, { envelope: true, source: true, headers: ["in-reply-to","references","x-ld-ref","message-id"] })) {
      const headerStr  = msg.headers ? msg.headers.toString() : "";
      const inReplyToM = headerStr.match(/in-reply-to:\s*(.+)/im);
      const warmupM    = headerStr.match(/x-ld-ref:\s*(.+)/im);
      const fromAddr   = msg.envelope?.from?.[0]?.address ?? "";
      if (fromAddr.toLowerCase() === inbox.email_address.toLowerCase()) continue;

      const rawSource = msg.source ? msg.source.toString() : null;
      let bodyText: string | null = null;
      if (rawSource) bodyText = extractPlainText(rawSource);

      messages.push({
        messageId:  (msg.envelope?.messageId ?? "").replace(/^<|>$/g, ""),
        inReplyTo:  inReplyToM?.[1]?.trim().replace(/^<|>$/g, "") ?? null,
        fromEmail:  fromAddr,
        fromName:   msg.envelope?.from?.[0]?.name || null,
        subject:    msg.envelope?.subject ?? null,
        bodyText:   bodyText ? stripQuotedReply(bodyText) : null,
        receivedAt: (msg.envelope?.date ?? new Date()).toISOString(),
        warmupId:   warmupM?.[1]?.trim() ?? null,
        rawSource,
      });
    }
  } finally { lock.release(); await client.logout().catch(() => {}); }

  return { messages };
}

function decodeQP(str: string): string {
  return str.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function decodePart(body: string, headers: string): string {
  const encM = headers.match(/content-transfer-encoding:\s*(\S+)/i);
  const enc  = (encM?.[1] ?? "7bit").toLowerCase().trim();
  if (enc === "base64") {
    try { return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8"); }
    catch { return body; }
  }
  if (enc === "quoted-printable") return decodeQP(body);
  return body;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface MimePart { headers: string; body: string; contentType: string; boundary?: string }

/** Split a raw MIME message into header-block + body, then into parts if multipart. */
function parseMimeParts(raw: string): MimePart[] {
  // Normalise line endings
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Find blank-line separator between headers and body
  const sep = text.indexOf("\n\n");
  if (sep === -1) return [];

  const hdrs = text.slice(0, sep);
  const body = text.slice(sep + 2);

  const ctM = hdrs.match(/^content-type:\s*([^\n;]+)/im);
  const ct  = (ctM?.[1] ?? "text/plain").trim().toLowerCase();

  if (ct.startsWith("multipart/")) {
    const bdM = hdrs.match(/boundary="?([^"\n;]+)"?/i);
    if (!bdM) return [];
    const boundary = bdM[1].trim();
    // Split on --boundary lines
    const parts = body.split(new RegExp(`^--${escRe(boundary)}(?:--|\\s*$)`, "m"));
    // First element is preamble, last may be epilogue
    const result: MimePart[] = [];
    for (const part of parts.slice(1)) {
      const sub = parseMimeParts(part.trimStart());
      result.push(...sub);
    }
    return result;
  }

  return [{ headers: hdrs, body: body.trim(), contentType: ct }];
}

function extractPlainText(rawSource: string): string | null {
  const parts = parseMimeParts(rawSource);

  // Prefer text/plain
  const plain = parts.find(p => p.contentType.startsWith("text/plain"));
  if (plain?.body?.trim()) {
    const decoded = decodePart(plain.body, plain.headers);
    if (decoded.trim()) return decoded.trim();
  }

  // Fall back to text/html
  const html = parts.find(p => p.contentType.startsWith("text/html"));
  if (html?.body) {
    const decoded = decodePart(html.body, html.headers);
    const stripped = stripHtml(decoded);
    if (stripped) return stripped;
  }

  return null;
}

// ─── Core ingest ──────────────────────────────────────────────────────────────
async function ingestMessages(
  db: ReturnType<typeof supabase>,
  workspaceId: string,
  inboxId: string,
  messages: RawMessage[],
  filters: OutreachCrmFilter[],
): Promise<{ matched: number; unmatched: number; filtered: number }> {
  let matched = 0, unmatched = 0, filtered = 0;

  const msgIds = messages.map(m => m.messageId).filter(Boolean);
  const { data: existing } = msgIds.length
    ? await db.from("outreach_replies").select("message_id").in("message_id", msgIds)
    : { data: [] };
  const seenIds = new Set((existing ?? []).map(r => r.message_id));

  for (const msg of messages) {
    if (msg.messageId && seenIds.has(msg.messageId)) continue;

    if (msg.warmupId) {
      await db.from("outreach_warmup_sends").update({ replied_at: new Date().toISOString() })
        .eq("id", msg.warmupId).is("replied_at", null);
      continue;
    }
    if (msg.messageId) {
      const { data: wu } = await db.from("outreach_warmup_sends").select("id").eq("thread_id", msg.messageId).limit(1).single();
      if (wu) continue;
    }

    const filterHit = applyFilters(filters, { fromEmail: msg.fromEmail, subject: msg.subject, bodyText: msg.bodyText });

    if (filterHit?.action === "exclude") {
      await db.from("outreach_replies").insert({
        workspace_id: workspaceId, inbox_id: inboxId,
        from_email: msg.fromEmail, from_name: msg.fromName, subject: msg.subject,
        body_text: msg.bodyText, message_id: msg.messageId || null, in_reply_to: msg.inReplyTo,
        received_at: msg.receivedAt, is_filtered: true, filter_reason: filterHit.reason,
        attachments: [],
      });
      filtered++; continue;
    }

    // Match to outreach_sends
    let send: { id: string; enrollment_id: string } | null = null;
    if (msg.inReplyTo) {
      const { data } = await db.from("outreach_sends").select("id, enrollment_id")
        .eq("workspace_id", workspaceId).eq("message_id", msg.inReplyTo).is("replied_at", null).limit(1).single();
      send = data ?? null;
    }
    if (!send && msg.threadId) {
      // Fallback: match by provider thread/conversation ID (Gmail threadId, Outlook conversationId)
      const { data } = await db.from("outreach_sends").select("id, enrollment_id")
        .eq("workspace_id", workspaceId).eq("thread_id", msg.threadId).is("replied_at", null)
        .order("sent_at", { ascending: false }).limit(1).single();
      send = data ?? null;
    }
    if (!send && msg.fromEmail) {
      const { data } = await db.from("outreach_sends").select("id, enrollment_id")
        .eq("workspace_id", workspaceId).eq("to_email", msg.fromEmail.toLowerCase())
        .eq("status", "sent").is("replied_at", null).order("sent_at", { ascending: false }).limit(1).single();
      send = data ?? null;
    }

    // AI classify
    let aiCategory = "neutral", aiConfidence = 0;
    if (filterHit?.action === "auto_status" && filterHit.auto_status) {
      aiCategory = filterHit.auto_status; aiConfidence = 1.0;
    } else if (detectOoo(msg.subject, msg.bodyText)) {
      aiCategory = "ooo"; aiConfidence = 1.0;
    } else {
      const r = await aiClassify(msg.subject, msg.bodyText);
      aiCategory = r.category; aiConfidence = r.confidence;
    }

    // Extract + upload attachments (IMAP only — rawSource available)
    let attachments: import("@/lib/outreach/mime-attachments").StoredAttachment[] = [];
    if (msg.rawSource) {
      try {
        const { extractAttachments, uploadAttachments } = await import("@/lib/outreach/mime-attachments");
        const parsed = extractAttachments(msg.rawSource);
        if (parsed.length) {
          attachments = await uploadAttachments(workspaceId, msg.messageId || Date.now().toString(), parsed);
        }
      } catch (e) {
        console.warn("[reply-runner] attachment extraction failed:", String(e).slice(0, 200));
      }
    }

    await db.from("outreach_replies").insert({
      workspace_id: workspaceId, inbox_id: inboxId,
      send_id: send?.id ?? null, enrollment_id: send?.enrollment_id ?? null,
      from_email: msg.fromEmail, from_name: msg.fromName, subject: msg.subject,
      body_text: msg.bodyText, message_id: msg.messageId || null, in_reply_to: msg.inReplyTo,
      received_at: msg.receivedAt, ai_category: aiCategory, ai_confidence: aiConfidence,
      is_filtered: false, attachments,
    });

    if (send) {
      await markEnrollmentReplied(send.enrollment_id, send.id);
      if (aiConfidence >= 0.7 && aiCategory !== "neutral") {
        const { data: enr } = await db.from("outreach_enrollments").select("crm_status").eq("id", send.enrollment_id).single();
        if (enr?.crm_status === "neutral") {
          await db.from("outreach_enrollments").update({ crm_status: aiCategory }).eq("id", send.enrollment_id);
        }
      }
      matched++;
    } else { unmatched++; }
  }

  return { matched, unmatched, filtered };
}

// ─── Public entry ─────────────────────────────────────────────────────────────
export interface ReplyPollResult {
  inboxes: number; matched: number; unmatched: number; filtered: number;
  details: Array<{ email: string; fetched: number; matched: number; unmatched: number; error?: string }>;
}

function isSesSmtpInbox(inbox: { imap_host?: string | null; smtp_host?: string | null; provider?: string | null }): boolean {
  return !inbox.imap_host && (inbox.smtp_host ?? "").includes("amazonaws.com") && inbox.provider === "smtp";
}

export async function runReplyPoll(workspaceId: string, lookbackDays = 7): Promise<ReplyPollResult> {
  const db = supabase();

  const [{ data: inboxes }, { data: filtersData }] = await Promise.all([
    db.from("outreach_inboxes").select("*").eq("workspace_id", workspaceId).eq("status", "active"),
    db.from("outreach_crm_filters").select("*").eq("workspace_id", workspaceId).order("created_at"),
  ]);

  if (!inboxes?.length) return { inboxes: 0, matched: 0, unmatched: 0, filtered: 0, details: [] };
  const filters = (filtersData ?? []) as OutreachCrmFilter[];

  // ── SES S3 inbound: one poll per workspace covers all SES inboxes ────────────
  const sesInboxes = inboxes.filter(isSesSmtpInbox);
  const sesInboxMap = new Map(sesInboxes.map(i => [i.email_address.toLowerCase(), i]));
  const sesMessagesByInbox = new Map<string, RawMessage[]>();

  if (sesInboxes.length && process.env.SES_INBOUND_BUCKET) {
    try {
      const { listInboundObjects, downloadObject, parseRawEmail } = await import("@/lib/outreach/ses-inbound");
      const since   = new Date(Date.now() - lookbackDays * 86_400_000);
      const objects = await listInboundObjects(since);
      console.log(`[reply-runner] SES S3: found ${objects.length} object(s) since ${since.toISOString()}, ${sesInboxes.length} SES inbox(es)`);

      // Already-seen message IDs to avoid re-processing
      const { data: existing } = await db
        .from("outreach_replies")
        .select("message_id")
        .eq("workspace_id", workspaceId)
        .gte("received_at", since.toISOString());
      const seenIds = new Set((existing ?? []).map((r: { message_id: string }) => r.message_id).filter(Boolean));

      for (const obj of objects) {
        const raw = await downloadObject(obj.key);
        if (!raw) continue;

        const parsed = parseRawEmail(raw);
        if (!parsed) continue;
        if (parsed.messageId && seenIds.has(parsed.messageId)) continue;

        // Route to the correct inbox by To: address
        const inbox = sesInboxMap.get(parsed.toEmail);
        if (!inbox) {
          console.log(`[reply-runner] SES S3: no inbox match for To: ${parsed.toEmail} (known: ${[...sesInboxMap.keys()].join(", ")})`);
          continue;
        }

        const msg: RawMessage = {
          messageId:  parsed.messageId,
          inReplyTo:  parsed.inReplyTo,
          fromEmail:  parsed.fromEmail,
          fromName:   parsed.fromName,
          subject:    parsed.subject,
          bodyText:   parsed.bodyText,
          receivedAt: parsed.receivedAt,
          warmupId:   parsed.warmupId,
          rawSource:  parsed.rawSource,
        };

        const bucket = sesMessagesByInbox.get(inbox.id) ?? [];
        bucket.push(msg);
        sesMessagesByInbox.set(inbox.id, bucket);
      }
    } catch (e) {
      console.error("[reply-runner] SES S3 poll failed:", String(e).slice(0, 300));
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  const CONCURRENCY = 5;
  const allDetails: ReplyPollResult["details"] = [];
  let totalMatched = 0, totalUnmatched = 0, totalFiltered = 0;

  type InboxRow = NonNullable<typeof inboxes>[number];
  async function processInbox(inbox: InboxRow): Promise<ReplyPollResult["details"][0]> {
    let messages: RawMessage[] = [];
    let fetchError: string | undefined;

    if (isSesSmtpInbox(inbox)) {
      // Messages already fetched from S3 above
      messages = sesMessagesByInbox.get(inbox.id) ?? [];
      if (!process.env.SES_INBOUND_BUCKET) {
        fetchError = "SES_INBOUND_BUCKET not configured — add it to environment variables";
      }
    } else if (inbox.imap_host || deriveImapHost(inbox.smtp_host)) {
      const r = await fetchImapMessages(inbox, lookbackDays);
      messages = r.messages; fetchError = r.error;
      if (fetchError) await db.from("outreach_inboxes").update({ last_error: `IMAP poll: ${fetchError}` }).eq("id", inbox.id);
    } else if (inbox.provider === "gmail" && inbox.oauth_refresh_token) {
      try {
        const { fetchNewMessages, fetchRecentMessages } = await import("@/lib/outreach/gmail");
        const raw = inbox.gmail_history_id
          ? await fetchNewMessages(inbox, inbox.gmail_history_id).catch(() => [])
          : await fetchRecentMessages(inbox, lookbackDays).catch(() => []);
        messages = raw.map(r => ({
          messageId:  (r.messageId ?? "").replace(/^<|>$/g, ""),
          inReplyTo:  (r.inReplyTo ?? "").replace(/^<|>$/g, "") || null,
          threadId:   r.threadId ?? null,
          fromEmail:  r.fromEmail ?? "",
          fromName:   null,
          subject:    r.subject ?? null,
          bodyText:   r.bodyText ?? null,
          receivedAt: new Date().toISOString(),
          warmupId:   r.warmupId ?? null,
        }));
      } catch (e) { fetchError = String(e); }
    } else if (inbox.provider === "outlook" && inbox.oauth_refresh_token) {
      try {
        const { fetchNewReplies } = await import("@/lib/outreach/microsoft");
        const since = new Date(Date.now() - lookbackDays * 86_400_000);
        const raw = await fetchNewReplies(inbox, since).catch(() => []);
        messages = raw.map(r => ({
          messageId:  r.messageId.replace(/^<|>$/g, ""),
          inReplyTo:  r.inReplyTo ? r.inReplyTo.replace(/^<|>$/g, "") : null,
          threadId:   r.threadId ?? null,
          fromEmail:  r.fromEmail ?? "",
          fromName:   null,
          subject:    null,
          bodyText:   r.bodySnippet ?? null,
          receivedAt: r.receivedAt ?? new Date().toISOString(),
          warmupId:   r.warmupId ?? null,
        }));
      } catch (e) { fetchError = String(e); }
    } else { fetchError = "no imap_host and no OAuth credentials"; }

    let inboxMatched = 0, inboxUnmatched = 0;
    if (messages.length) {
      const r = await ingestMessages(db, workspaceId, inbox.id, messages, filters);
      inboxMatched = r.matched; inboxUnmatched = r.unmatched;
      totalMatched += r.matched; totalUnmatched += r.unmatched; totalFiltered += r.filtered;
    }

    return { email: inbox.email_address, fetched: messages.length, matched: inboxMatched, unmatched: inboxUnmatched, ...(fetchError ? { error: fetchError } : {}) };
  }

  for (let i = 0; i < inboxes.length; i += CONCURRENCY) {
    const batch   = inboxes.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(processInbox));
    allDetails.push(...results);
  }

  return { inboxes: inboxes.length, matched: totalMatched, unmatched: totalUnmatched, filtered: totalFiltered, details: allDetails };
}
