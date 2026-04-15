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
  const perPage = 30;

  let query = ctx.adminClient
    .from("outreach_domains")
    .select("id, workspace_id, domain, status, payment_provider, mailgun_domain, mailbox_count, mailbox_prefix, mailbox_prefixes, first_name, last_name, daily_send_limit, warmup_ends_at, error_message, dns_records, domain_price_usd, created_at, updated_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (search) query = query.ilike("domain", `%${search}%`);

  const { data: domains, count, error } = await query
    .range((page - 1) * perPage, page * perPage - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Domain    = { id: string; workspace_id: string; [k: string]: unknown };
  type Workspace = { id: string; name: string; owner_id: string };

  // Enrich with workspace names
  const rows = (domains ?? []) as Domain[];
  const workspaceIds = [...new Set(rows.map(d => d.workspace_id))];
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

  const enriched = rows.map(d => {
    const ws = wsMap.get(d.workspace_id);
    return {
      ...d,
      workspace_name:  ws?.name ?? "",
      workspace_owner: ws ? (ownerMap.get(ws.owner_id) ?? "") : "",
    };
  });

  return NextResponse.json({ domains: enriched, total: count ?? 0, page, perPage });
}
