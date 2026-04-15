import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminClient = createAdminClient();
  const { data: admin } = await adminClient.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, adminClient };
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page    = parseInt(searchParams.get("page")   ?? "1");
  const search  = searchParams.get("search") ?? "";
  const status  = searchParams.get("status") ?? "";
  const mode    = searchParams.get("mode")   ?? "";
  const perPage = 30;

  let query = ctx.adminClient
    .from("lead_campaigns")
    .select("id, workspace_id, name, mode, status, max_leads, total_scraped, total_verified, total_personalized, total_valid, credits_reserved, credits_used, error_message, started_at, completed_at, created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (mode)   query = query.eq("mode", mode);

  const { data: campaigns, count, error } = await query
    .range((page - 1) * perPage, page * perPage - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Campaign  = { id: string; workspace_id: string; name: string; [k: string]: unknown };
  type Workspace = { id: string; name: string; owner_id: string };

  // Enrich with workspace names and owner emails
  const rows = (campaigns ?? []) as Campaign[];
  const workspaceIds = [...new Set(rows.map(c => c.workspace_id))];
  const wsMap = new Map<string, Workspace>();
  if (workspaceIds.length) {
    const { data: workspaces } = await ctx.adminClient
      .from("workspaces")
      .select("id, name, owner_id")
      .in("id", workspaceIds);
    (workspaces as Workspace[] ?? []).forEach(w => wsMap.set(w.id, w));
  }

  const ownerIds = [...new Set([...wsMap.values()].map(w => w.owner_id))];
  const ownerMap = new Map<string, string>();
  if (ownerIds.length) {
    const { data: { users } } = await ctx.adminClient.auth.admin.listUsers({ perPage: 1000 });
    users.forEach((u: { id: string; email?: string }) => ownerMap.set(u.id, u.email ?? ""));
  }

  // Apply workspace name search after enrichment
  let enriched = rows.map(c => {
    const ws = wsMap.get(c.workspace_id);
    return {
      ...c,
      workspace_name:  ws?.name ?? "",
      workspace_owner: ws ? (ownerMap.get(ws.owner_id) ?? "") : "",
    };
  });

  if (search) {
    const s = search.toLowerCase();
    enriched = enriched.filter(c =>
      (c.name as string).toLowerCase().includes(s) ||
      c.workspace_name.toLowerCase().includes(s)
    );
  }

  return NextResponse.json({ campaigns: enriched, total: search ? enriched.length : (count ?? 0), page, perPage });
}
