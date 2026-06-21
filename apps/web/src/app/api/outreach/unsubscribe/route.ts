import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyUnsubscribeToken } from "@/lib/outreach/template";

const SUCCESS_HTML = `<!DOCTYPE html><html><head><title>Unsubscribed</title></head><body style="font-family:sans-serif;max-width:500px;margin:4rem auto;text-align:center">
  <h2>You've been unsubscribed</h2>
  <p style="color:#666">You won't receive any more emails from this sender.</p>
</body></html>`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("w");
  const email       = searchParams.get("email");
  const token       = searchParams.get("token");

  if (!workspaceId || !email || !token) {
    return new NextResponse("Invalid unsubscribe link", { status: 400 });
  }

  // Verify HMAC — prevents forgery
  if (!verifyUnsubscribeToken(workspaceId, email, token)) {
    return new NextResponse("Invalid unsubscribe link", { status: 400 });
  }

  const db = createAdminClient();

  await db.from("outreach_unsubscribes").upsert(
    { workspace_id: workspaceId, email: email.toLowerCase(), source: "link" },
    { onConflict: "workspace_id,email" }
  );

  // Mark any active enrollments for this email as unsubscribed
  const { data: leads } = await db
    .from("outreach_leads")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("email", email.toLowerCase());

  const leadIds = (leads ?? []).map((l: { id: string }) => l.id);
  if (leadIds.length > 0) {
    // Mark ALL non-terminal enrollments as unsubscribed — not just active ones.
    // Completed/replied enrollments must also be blocked so re-activated or
    // paused sequences can't fire additional steps.
    await db
      .from("outreach_enrollments")
      .update({ status: "unsubscribed" })
      .eq("workspace_id", workspaceId)
      .not("status", "in", '("bounced","unsubscribed")')
      .in("lead_id", leadIds);
  }

  return new NextResponse(SUCCESS_HTML, { headers: { "Content-Type": "text/html" } });
}
