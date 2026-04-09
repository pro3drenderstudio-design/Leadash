import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) return new NextResponse("Missing token", { status: 400 });

  // token = base64(workspaceId:email)
  let workspaceId: string, email: string;
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    [workspaceId, email] = decoded.split(":");
    if (!workspaceId || !email) throw new Error("invalid");
  } catch {
    return new NextResponse("Invalid token", { status: 400 });
  }

  const db = createAdminClient();
  await db.from("outreach_unsubscribes").upsert(
    { workspace_id: workspaceId, email, source: "link" },
    { onConflict: "workspace_id,email" }
  );

  // Mark any active enrollments as unsubscribed
  await db
    .from("outreach_enrollments")
    .update({ status: "unsubscribed" })
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .in("lead_id",
      (await db.from("outreach_leads").select("id").eq("workspace_id", workspaceId).eq("email", email)).data?.map(l => l.id) ?? []
    );

  return new NextResponse(
    `<!DOCTYPE html><html><head><title>Unsubscribed</title></head><body style="font-family:sans-serif;max-width:500px;margin:4rem auto;text-align:center">
      <h2>You've been unsubscribed</h2>
      <p style="color:#666">You won't receive any more emails from this sender.</p>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
