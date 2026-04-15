import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/outreach/microsoft";
import { createAdminClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/outreach/crypto";
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
    const tokens = await exchangeCode(code);
    const db = createAdminClient();

    const access = await checkInboxAccess(db, workspaceId, tokens.email);
    if (!access.ok) {
      const params = new URLSearchParams({ error: access.code, message: access.message });
      return NextResponse.redirect(new URL(`/inboxes/new?${params}`, req.url));
    }

    await db.from("outreach_inboxes").upsert({
      workspace_id:        workspaceId,
      label:               tokens.email,
      email_address:       tokens.email,
      provider:            "microsoft",
      status:              "active",
      oauth_access_token:  encrypt(tokens.accessToken),
      oauth_refresh_token: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      oauth_expiry:        tokens.expiresAt,
      daily_send_limit:    30,
      send_window_start:   "09:00",
      send_window_end:     "17:00",
    }, { onConflict: "workspace_id,email_address" });

    return NextResponse.redirect(new URL("/inboxes?connected=microsoft", req.url));
  } catch (err) {
    console.error("Microsoft OAuth callback error:", err);
    return NextResponse.redirect(new URL("/inboxes/new?error=oauth_failed", req.url));
  }
}
