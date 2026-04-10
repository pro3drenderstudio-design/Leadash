import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client as GraphClient } from "@microsoft/microsoft-graph-client";
import { createClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "./crypto";
import type { OutreachInbox } from "@/types/outreach";

const MS_CLIENT_ID     = process.env.MICROSOFT_CLIENT_ID!;
const MS_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!;
const MS_TENANT_ID     = process.env.MICROSOFT_TENANT_ID ?? "common";
const MS_REDIRECT_URI  = process.env.MICROSOFT_REDIRECT_URI!;
const APP_URL          = process.env.NEXT_PUBLIC_APP_URL ?? "https://proplanstudio.com";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ─── MSAL config ──────────────────────────────────────────────────────────────

export function getMsalApp() {
  return new ConfidentialClientApplication({
    auth: {
      clientId:     MS_CLIENT_ID,
      clientSecret: MS_CLIENT_SECRET,
      authority:    `https://login.microsoftonline.com/${MS_TENANT_ID}`,
    },
  });
}

export function getAuthorizationUrl(state: string, loginHint?: string): Promise<string> {
  const app = getMsalApp();
  return app.getAuthCodeUrl({
    scopes:      ["Mail.Send", "Mail.ReadWrite", "offline_access", "User.Read"],
    redirectUri: MS_REDIRECT_URI,
    state,
    loginHint,
    prompt: loginHint ? "login" : "select_account",
  });
}

// ─── Token exchange ───────────────────────────────────────────────────────────

export interface MsTokens {
  accessToken:  string;
  refreshToken: string;
  expiresAt:    string;
  email:        string;
}

export async function exchangeCode(code: string): Promise<MsTokens> {
  const app = getMsalApp();
  const result = await app.acquireTokenByCode({
    code,
    scopes:      ["Mail.Send", "Mail.ReadWrite", "offline_access", "User.Read"],
    redirectUri: MS_REDIRECT_URI,
  });

  if (!result) throw new Error("Failed to exchange Microsoft OAuth code");

  // Fetch email from Graph
  const graphClient = getGraphClientFromToken(result.accessToken);
  const me = await graphClient.api("/me").select("mail,userPrincipalName").get();
  const email = me.mail ?? me.userPrincipalName ?? "";

  return {
    accessToken:  result.accessToken,
    refreshToken: (result as { refreshToken?: string }).refreshToken ?? "",
    expiresAt:    result.expiresOn?.toISOString() ?? new Date(Date.now() + 3600_000).toISOString(),
    email,
  };
}

// ─── Graph client helpers ─────────────────────────────────────────────────────

function getGraphClientFromToken(accessToken: string): GraphClient {
  return GraphClient.init({
    authProvider: (done: (err: Error | null, token: string) => void) => done(null, accessToken),
  });
}

export async function getGraphClient(inbox: OutreachInbox): Promise<GraphClient> {
  const accessToken  = inbox.oauth_access_token  ? decrypt(inbox.oauth_access_token)  : "";
  const refreshToken = inbox.oauth_refresh_token ? decrypt(inbox.oauth_refresh_token) : "";
  const expiresAt    = inbox.oauth_expiry ? new Date(inbox.oauth_expiry) : new Date(0);

  let token = accessToken;

  // Refresh if expired (or expiring within 5 min)
  if (new Date() >= new Date(expiresAt.getTime() - 5 * 60 * 1000)) {
    const app = getMsalApp();
    const result = await app.acquireTokenByRefreshToken({
      refreshToken,
      scopes: ["Mail.Send", "Mail.ReadWrite", "offline_access"],
    });
    if (result) {
      token = result.accessToken;
      const updates = {
        oauth_access_token: encrypt(result.accessToken),
        oauth_expiry:   result.expiresOn?.toISOString() ?? null,
        ...(((result as { refreshToken?: string }).refreshToken)
          ? { oauth_refresh_token: encrypt((result as { refreshToken?: string }).refreshToken!) }
          : {}),
      };
      await supabase().from("outreach_inboxes").update(updates).eq("id", inbox.id);
    }
  }

  return getGraphClientFromToken(token);
}

// ─── sendMicrosoftMessage ─────────────────────────────────────────────────────

export interface MsSendOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  fromName?: string;
  inReplyToMessageId?: string;
  replyToThreadId?: string;
  customHeaders?: Record<string, string>;
}

export async function sendMicrosoftMessage(
  inbox: OutreachInbox,
  opts: MsSendOptions,
): Promise<{ messageId: string; threadId: string }> {
  const client = await getGraphClient(inbox);

  const internetMessageHeaders = opts.customHeaders
    ? Object.entries(opts.customHeaders).map(([name, value]) => ({ name, value }))
    : undefined;

  const message: Record<string, unknown> = {
    subject: opts.subject,
    body: {
      contentType: "HTML",
      content: opts.htmlBody,
    },
    toRecipients: [
      {
        emailAddress: { address: opts.to },
      },
    ],
    ...(opts.fromName ? { from: { emailAddress: { name: opts.fromName, address: inbox.email_address } } } : {}),
    ...(internetMessageHeaders ? { internetMessageHeaders } : {}),
  };

  // sendMail and get the sent message ID
  await client.api("/me/sendMail").post({ message, saveToSentItems: true });

  // Fetch the latest sent item to get the message/thread ID
  const sent = await client
    .api("/me/mailFolders/SentItems/messages")
    .top(1)
    .select("id,conversationId")
    .get();

  const latest = sent?.value?.[0];
  return {
    messageId: latest?.id ?? "",
    threadId:  latest?.conversationId ?? "",
  };
}

// ─── Graph change notification subscription (reply detection) ────────────────

export async function createGraphSubscription(inbox: OutreachInbox): Promise<void> {
  const client = await getGraphClient(inbox);
  const notificationUrl = `${APP_URL}/api/outreach/webhooks/microsoft`;

  // Expiry: max 3 days for mail subscriptions
  const expiryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  const subscription = await client.api("/subscriptions").post({
    changeType:      "created",
    notificationUrl,
    resource:        "me/mailFolders/inbox/messages",
    expirationDateTime: expiryDate.toISOString(),
    clientState:     inbox.id, // used to verify webhook
  });

  await supabase()
    .from("outreach_inboxes")
    .update({
      ms_subscription_id:     subscription.id,
      ms_subscription_expiry: expiryDate.toISOString(),
    })
    .eq("id", inbox.id);
}

export async function renewGraphSubscription(inbox: OutreachInbox): Promise<void> {
  if (!inbox.ms_subscription_id) return;
  const client = await getGraphClient(inbox);
  const expiryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  await client.api(`/subscriptions/${inbox.ms_subscription_id}`).patch({
    expirationDateTime: expiryDate.toISOString(),
  });

  await supabase()
    .from("outreach_inboxes")
    .update({ ms_subscription_expiry: expiryDate.toISOString() })
    .eq("id", inbox.id);
}

// ─── fetchNewReplies (for poller fallback) ────────────────────────────────────

export interface MsIncomingMessage {
  messageId:   string;
  threadId:    string;
  inReplyTo:   string | null;
  fromEmail:   string;
  receivedAt:  string;
  warmupId:    string | null;
  bodySnippet: string | null;
}

export async function fetchNewReplies(
  inbox: OutreachInbox,
  since: Date,
): Promise<MsIncomingMessage[]> {
  const client = await getGraphClient(inbox);

  const result = await client
    .api("/me/mailFolders/inbox/messages")
    .filter(`receivedDateTime ge ${since.toISOString()} and isDraft eq false`)
    .select("id,conversationId,internetMessageHeaders,from,receivedDateTime,bodyPreview")
    .top(50)
    .get();

  const messages: MsIncomingMessage[] = [];

  for (const msg of result?.value ?? []) {
    const headers: Array<{ name: string; value: string }> = msg.internetMessageHeaders ?? [];
    const inReplyTo = headers.find((h) => h.name === "In-Reply-To")?.value ?? null;
    const warmupId  = headers.find((h) => h.name === "X-PP-Ref")?.value ?? null;

    if (!inReplyTo && !warmupId) continue;

    messages.push({
      messageId:   msg.id,
      threadId:    msg.conversationId ?? "",
      inReplyTo,
      fromEmail:   msg.from?.emailAddress?.address ?? "",
      receivedAt:  msg.receivedDateTime ?? new Date().toISOString(),
      warmupId,
      bodySnippet: msg.bodyPreview ?? null,
    });
  }

  return messages;
}

// ─── rescueFromSpam (Microsoft) ───────────────────────────────────────────────

export async function rescueMicrosoftWarmupFromSpam(
  inbox: OutreachInbox,
  warmupSendId: string,
): Promise<boolean> {
  const client = await getGraphClient(inbox);
  const marker = `<!--pps-ref:${warmupSendId}-->`;

  // Search junk folder for messages with the warmup HTML comment
  const result = await client
    .api("/me/mailFolders/JunkEmail/messages")
    .select("id,body")
    .top(50)
    .get();

  for (const msg of result?.value ?? []) {
    const body: string = msg.body?.content ?? "";
    if (!body.includes(marker)) continue;

    // Move to Inbox
    await client.api(`/me/messages/${msg.id}/move`).post({
      destinationId: "inbox",
    });
    return true;
  }
  return false;
}
