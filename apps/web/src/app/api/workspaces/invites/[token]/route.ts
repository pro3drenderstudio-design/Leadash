import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();

  const { data, error } = await db
    .from("workspace_invites")
    .select("id, email, role, expires_at, accepted_at, workspace:workspaces(id, name)")
    .eq("token", token)
    .single();

  if (error || !data) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (data.accepted_at) return NextResponse.json({ error: "Invite already accepted" }, { status: 410 });
  if (new Date(data.expires_at) < new Date()) return NextResponse.json({ error: "Invite expired" }, { status: 410 });

  const workspace = data.workspace as { id: string; name: string } | null;
  return NextResponse.json({ workspace_name: workspace?.name ?? "", email: data.email });
}
