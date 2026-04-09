import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data: invite } = await db
    .from("workspace_invites")
    .select("*")
    .eq("token", token)
    .single();

  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.accepted_at) return NextResponse.json({ error: "Already accepted" }, { status: 410 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: "Expired" }, { status: 410 });

  await db.from("workspace_members").upsert(
    { workspace_id: invite.workspace_id, user_id: user.id, role: invite.role, invited_by: invite.invited_by },
    { onConflict: "workspace_id,user_id" }
  );

  await db.from("workspace_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);

  return NextResponse.json({ workspace_id: invite.workspace_id });
}
