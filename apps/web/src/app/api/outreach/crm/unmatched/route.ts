import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data, error } = await db
    .from("outreach_replies")
    .select("*, inbox:outreach_inboxes(id, label, email_address)")
    .eq("workspace_id", workspaceId)
    .is("enrollment_id", null)
    .eq("is_filtered", false)
    .eq("is_warmup", false)
    .order("received_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
