import { NextRequest, NextResponse } from "next/server";
import { getAuthorizationUrl } from "@/lib/outreach/gmail";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const workspaceId = req.nextUrl.searchParams.get("workspace_id") ?? "";
  if (workspaceId) {
    const db = createAdminClient();
    const { data: member } = await db
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();
    if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const state = Buffer.from(JSON.stringify({ userId: user.id, workspaceId })).toString("base64");
  const authUrl = getAuthorizationUrl(state);
  return NextResponse.redirect(authUrl);
}
