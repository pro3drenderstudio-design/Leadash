import { NextRequest, NextResponse } from "next/server";
import { getAuthorizationUrl } from "@/lib/outreach/microsoft";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const db = createAdminClient();
  let workspaceId = req.nextUrl.searchParams.get("workspace_id") ?? "";

  if (workspaceId) {
    // Verify the user is a member of the supplied workspace
    const { data: member } = await db
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();
    if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    // Auto-resolve from the user's first workspace membership
    const { data: member } = await db
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    workspaceId = member?.workspace_id ?? "";
  }

  const state = Buffer.from(JSON.stringify({ userId: user.id, workspaceId })).toString("base64");
  const authUrl = await getAuthorizationUrl(state);
  return NextResponse.redirect(authUrl);
}
