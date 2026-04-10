import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const url    = new URL(req.url);
  const page   = parseInt(url.searchParams.get("page") ?? "0", 10);
  const limit  = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
  const filter = url.searchParams.get("filter") ?? "all"; // all | valid | not_added
  const search = url.searchParams.get("search") ?? "";

  let query = db
    .from("lead_campaign_leads")
    .select("*", { count: "exact" })
    .eq("campaign_id", id)
    .eq("workspace_id", workspaceId);

  if (filter === "valid") {
    query = query.in("verification_status", ["valid", "catch_all"]);
  } else if (filter === "not_added") {
    query = query.is("added_to_list_id", null);
  }

  if (search) {
    query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%`);
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: true })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leads: data ?? [], total: count ?? 0, page, limit });
}
