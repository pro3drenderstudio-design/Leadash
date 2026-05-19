import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;
  const { id: listId } = await params;

  const db = createAdminClient();

  const { data: list } = await db
    .from("outreach_lists")
    .select("id")
    .eq("id", listId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch in pages to bypass PostgREST 1000-row cap
  const counts: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await db
      .from("outreach_leads")
      .select("verification_status")
      .eq("list_id", listId)
      .eq("workspace_id", workspaceId)
      .range(from, from + PAGE - 1);
    if (error || !data?.length) break;
    for (const row of data as { verification_status: string | null }[]) {
      const s = row.verification_status ?? "pending";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return NextResponse.json({ counts });
}
