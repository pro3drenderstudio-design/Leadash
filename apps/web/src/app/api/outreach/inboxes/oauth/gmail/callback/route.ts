import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client, watchGmailInbox } from "@/lib/outreach/gmail";
import { createAdminClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/outreach/crypto";
import { google } from "googleapis";
import { checkInboxAccess } from "@/lib/outreach/inbox-access";

export async function GET(req: NextRequest) {
  const url   = new URL(req.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const error = url.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/inboxes/new?error=oauth_denied", req.url));
  }

  let workspaceId = "";
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
    workspaceId = decoded.workspaceId;
  } catch {
    return NextResponse.redirect(new URL("/inboxes/new?error=invalid_state", req.url));
  }

  try {
    const oauth2 = createOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
    const { data: userInfo } = await oauth2Api.userinfo.get();
    const email = userInfo.email ?? "";

    const db = createAdminClient();
    const { data: inbox, error: upsertErr } = await db
      .from("outreach_inboxes")
      .upsert({
        workspace_id:        workspaceId,
        label:               email,
        email_address:       email,
        provider:            "gmail",
        status:              "active",
        first_name:          userInfo.given_name  ?? null,
        last_name:           userInfo.family_name ?? null,
        oauth_access_token:  tokens.access_token  ? encrypt(tokens.access_token)  : null,
        oauth_refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        oauth_expiry:        tokens.expiry_date   ? new Date(tokens.expiry_date).toISOString() : null,
        daily_send_limit:    30,
        send_window_start:   "09:00",
        send_window_end:     "17:00",
      }, { onConflict: "workspace_id,email_address" })
      .select()
      .single();

    if (upsertErr) throw upsertErr;
    if (inbox) await watchGmailInbox(inbox).catch(() => {});

    return NextResponse.redirect(new URL("/inboxes?connected=gmail", req.url));
  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    return NextResponse.redirect(new URL("/inboxes/new?error=oauth_failed", req.url));
  }
}
