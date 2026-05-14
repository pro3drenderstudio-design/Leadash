import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const url    = new URL(req.url);
  const page   = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1"));
  const limit  = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50"));
  const offset = (page - 1) * limit;

  const [{ data, error }, { count }] = await Promise.all([
    db
      .from("outreach_replies")
      .select("*, inbox:outreach_inboxes(id, label, email_address)")
      .eq("workspace_id", workspaceId)
      .is("enrollment_id", null)
      .eq("is_filtered", false)
      .eq("is_warmup", false)
      .order("received_at", { ascending: false })
      .range(offset, offset + limit - 1),
    db
      .from("outreach_replies")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("enrollment_id", null)
      .eq("is_filtered", false)
      .eq("is_warmup", false),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count ?? 0, page, limit });
}
