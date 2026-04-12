import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "./crypto";
import type { OutreachInbox } from "@/types/outreach";

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI!;
const PUBSUB_TOPIC  = process.env.GOOGLE_PUBSUB_TOPIC!;

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ─── OAuth2 client ────────────────────────────────────────────────────────────

export function createOAuth2Client() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthorizationUrl(state: string): string {
  const oauth2 = createOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state,
  });
}

// ─── getGmailClient ───────────────────────────────────────────────────────────

/**
 * Returns an authenticated Gmail API client.
 * Auto-refreshes the access token if expired and persists the new token.
 */
export async function getGmailClient(inbox: OutreachInbox) {
  const oauth2 = createOAuth2Client();

  const accessToken  = inbox.oauth_access_token  ? decrypt(inbox.oauth_access_token)  : null;
  const refreshToken = inbox.oauth_refresh_token ? decrypt(inbox.oauth_refresh_token) : null;

  oauth2.setCredentials({
    access_token:  accessToken,
    refresh_token: refreshToken,
    expiry_date:   inbox.oauth_expiry ? new Date(inbox.oauth_expiry).getTime() : undefined,
  });

  // Refresh listener — persist new tokens back to Supabase
  oauth2.on("tokens", async (tokens) => {
    const updates: Record<string, string | null> = {};
    if (tokens.access_token) {
      updates.oauth_access_token = encrypt(tokens.access_token);
      updates.oauth_expiry   = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null;
    }
    if (tokens.refresh_token) {
      updates.oauth_refresh_token = encrypt(tokens.refresh_token);
    }
    if (Object.keys(updates).length > 0) {
      await supabase().from("outreach_inboxes").update(updates).eq("id", inbox.id);
    }
  });

  return google.gmail({ version: "v1", auth: oauth2 });
}

// ─── sendGmailMessage ─────────────────────────────────────────────────────────

export interface GmailSendOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  fromName?: string;
  replyToThreadId?: string;
  inReplyToMessageId?: string;
  customHeaders?: Record<string, string>;
}

export interface GmailSendResult {
  messageId: string;
  threadId: string;
}

export async function sendGmailMessage(
  inbox: OutreachInbox,
  opts: GmailSendOptions,
): Promise<GmailSendResult> {
  const gmail = await getGmailClient(inbox);

  const from = opts.fromName
    ? `${opts.fromName} <${inbox.email_address}>`
    : inbox.email_address;

  const boundary = `boundary_${Date.now().toString(36)}`;
  const rawMessage = [
    `From: ${from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    opts.replyToThreadId ? `References: <${opts.replyToThreadId}>` : "",
    opts.inReplyToMessageId ? `In-Reply-To: <${opts.inReplyToMessageId}>` : "",
    ...(opts.customHeaders ? Object.entries(opts.customHeaders).map(([k, v]) => `${k}: ${v}`) : []),
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    opts.textBody,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    opts.htmlBody,
    ``,
    `--${boundary}--`,
  ]
    .filter((line) => line !== undefined)
    .join("\r\n");

  const encoded = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encoded,
      threadId: opts.replyToThreadId,
    },
  });

  return {
    messageId: res.data.id ?? "",
    threadId:  res.data.threadId ?? "",
  };
}

// ─── watchGmailInbox (Pub/Sub push notifications) ────────────────────────────

export async function watchGmailInbox(inbox: OutreachInbox): Promise<void> {
  if (!PUBSUB_TOPIC) return;
  const gmail = await getGmailClient(inbox);

  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: PUBSUB_TOPIC,
      labelIds: ["INBOX"],
    },
  });

  const expiry = res.data.expiration
    ? new Date(parseInt(res.data.expiration, 10)).toISOString()
    : null;

  await supabase()
    .from("outreach_inboxes")
    .update({
      gmail_history_id:   res.data.historyId ?? null,
      gmail_watch_expiry: expiry,
    })
    .eq("id", inbox.id);
}

// ─── fetchRecentMessages (messages.list fallback — no history ID needed) ──────

export async function fetchRecentMessages(
  inbox: OutreachInbox,
  lookbackDays = 7,
): Promise<GmailIncomingMessage[]> {
  const gmail = await getGmailClient(inbox);
  const messages: GmailIncomingMessage[] = [];

  // List inbox messages received in the last N days
  const listRes = await gmail.users.messages.list({
    userId:     "me",
    q:          `in:inbox newer_than:${lookbackDays}d`,
    maxResults: 100,
  });

  // Also store a history ID now so future polls use the faster history API
  const profileRes = await gmail.users.getProfile({ userId: "me" }).catch(() => null);
  if (profileRes?.data.historyId) {
    await supabase()
      .from("outreach_inboxes")
      .update({ gmail_history_id: profileRes.data.historyId })
      .eq("id", inbox.id);
  }

  for (const item of listRes.data.messages ?? []) {
    if (!item.id) continue;
    const msg = await gmail.users.messages.get({
      userId:          "me",
      id:              item.id,
      format:          "full",
      metadataHeaders: ["From", "Subject", "In-Reply-To", "References", "X-LD-Ref"],
    });

    const headers  = msg.data.payload?.headers ?? [];
    const getH     = (n: string) => headers.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value ?? null;
    const fromRaw  = getH("From") ?? "";
    const fromEmail = fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw;
    const inReplyTo = getH("In-Reply-To");
    const warmupId  = getH("X-LD-Ref");

    // Extract body — prefer text/plain, fall back to text/html stripped
    let bodyText: string | null = null;
    const extractBody = (part: typeof msg.data.payload, preferHtml = false): string | null => {
      if (!part) return null;
      const mt = part.mimeType ?? "";
      if (!preferHtml && mt === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
      if (preferHtml && mt === "text/html" && part.body?.data) {
        const html = Buffer.from(part.body.data, "base64url").toString("utf-8");
        return html
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<\/div>/gi, "\n")
          .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
      }
      for (const sub of part.parts ?? []) {
        const found = extractBody(sub, preferHtml);
        if (found) return found;
      }
      return null;
    };
    bodyText = extractBody(msg.data.payload ?? undefined) ?? extractBody(msg.data.payload ?? undefined, true);

    messages.push({
      messageId:  item.id,
      threadId:   msg.data.threadId ?? "",
      inReplyTo,
      fromEmail,
      warmupId,
      subject:    getH("Subject"),
      bodyText,
    });
  }

  return messages;
}

// ─── fetchNewMessages (reply detection via history API) ───────────────────────

export interface GmailIncomingMessage {
  messageId:  string;
  threadId:   string;
  inReplyTo:  string | null;
  fromEmail:  string;
  warmupId:   string | null;
  subject?:   string | null;
  bodyText?:  string | null;
}

export async function fetchNewMessages(
  inbox: OutreachInbox,
  sinceHistoryId: string,
): Promise<GmailIncomingMessage[]> {
  const gmail = await getGmailClient(inbox);

  const historyRes = await gmail.users.history.list({
    userId:          "me",
    startHistoryId:  sinceHistoryId,
    historyTypes:    ["messageAdded"],
    labelId:         "INBOX",
  });

  const newHistoryId = historyRes.data.historyId;
  if (newHistoryId) {
    await supabase()
      .from("outreach_inboxes")
      .update({ gmail_history_id: newHistoryId })
      .eq("id", inbox.id);
  }

  const messages: GmailIncomingMessage[] = [];
  const history = historyRes.data.history ?? [];

  for (const record of history) {
    for (const added of record.messagesAdded ?? []) {
      const msgId = added.message?.id;
      if (!msgId) continue;

      const msg = await gmail.users.messages.get({
        userId: "me",
        id:     msgId,
        format: "metadata",
        metadataHeaders: ["From", "In-Reply-To", "References", "X-LD-Ref"],
      });

      const headers = msg.data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;

      const inReplyTo = getHeader("In-Reply-To");
      const warmupId  = getHeader("X-LD-Ref");
      const fromRaw   = getHeader("From") ?? "";
      const fromEmail = fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw;

      if (!inReplyTo && !warmupId) continue; // Neither reply nor warmup

      messages.push({
        messageId:  msgId,
        threadId:   msg.data.threadId ?? "",
        inReplyTo,
        fromEmail,
        warmupId,
      });
    }
  }

  return messages;
}
