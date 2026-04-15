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
  const page      = parseInt(searchParams.get("page")      ?? "1");
  const search    = searchParams.get("search")    ?? "";   // workspace name search
  const type      = searchParams.get("type")      ?? "";
  const dateFrom  = searchParams.get("dateFrom")  ?? "";
  const dateTo    = searchParams.get("dateTo")    ?? "";
  const perPage   = 50;

  let query = ctx.adminClient
    .from("lead_credit_transactions")
    .select("id, workspace_id, amount, type, description, lead_campaign_id, created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (type)     query = query.eq("type", type);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo)   query = query.lte("created_at", dateTo + "T23:59:59Z");

  const { data: transactions, count, error } = await query
    .range((page - 1) * perPage, page * perPage - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Tx        = { id: string; workspace_id: string; [k: string]: unknown };
  type Workspace = { id: string; name: string; owner_id: string };

  // Enrich with workspace names
  const rows = (transactions ?? []) as Tx[];
  const workspaceIds = [...new Set(rows.map(t => t.workspace_id))];
  const wsMap = new Map<string, Workspace>();
  if (workspaceIds.length) {
    const { data: workspaces } = await ctx.adminClient
      .from("workspaces")
      .select("id, name, owner_id")
      .in("id", workspaceIds);
    (workspaces as Workspace[] ?? []).forEach(w => wsMap.set(w.id, w));
  }

  let enriched = rows.map(t => ({
    ...t,
    workspace_name: wsMap.get(t.workspace_id)?.name ?? "",
  }));

  // Apply workspace name search after enrichment (can't do server-side efficiently without FTS)
  if (search) {
    const s = search.toLowerCase();
    enriched = enriched.filter(t => t.workspace_name.toLowerCase().includes(s));
  }

  // Platform-wide totals via single-scan aggregate function
  const { data: totals } = await ctx.adminClient.rpc("admin_credit_summary").maybeSingle() as { data: { total_granted: number; total_purchased: number; total_consumed: number } | null };
  const summary = totals ?? { total_granted: 0, total_purchased: 0, total_consumed: 0 };

  return NextResponse.json({
    transactions: enriched,
    total: search ? enriched.length : (count ?? 0),
    page,
    perPage,
    summary,
  });
}
