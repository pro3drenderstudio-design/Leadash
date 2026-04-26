/**
 * GET  /api/admin/dedicated-ip  — list all dedicated IP subscriptions
 * POST /api/admin/dedicated-ip  — manually create a subscription
 */
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

  const { adminClient: db } = ctx;
  const url    = new URL(req.url);
  const page   = parseInt(url.searchParams.get("page") ?? "1");
  const status = url.searchParams.get("status") ?? "";
  const search = url.searchParams.get("search") ?? "";
  const limit  = 30;
  const offset = (page - 1) * limit;

  type SubRow = {
    id: string;
    workspace_id: string;
    status: string;
    ip_address: string | null;
    postal_pool_id: string | null;
    max_domains: number;
    max_inboxes: number;
    price_ngn: number;
    notes: string | null;
    cancel_requested_at: string | null;
    retire_at: string | null;
    created_at: string;
    updated_at: string;
  };

  let query = db
    .from("dedicated_ip_subscriptions")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);

  const { data: subs, count, error } = await query as { data: SubRow[] | null; count: number | null; error: unknown };
  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });

  // Enrich with workspace names
  const wsIds = [...new Set((subs ?? []).map(s => s.workspace_id))];
  const { data: workspaces } = await db
    .from("workspaces")
    .select("id, name, billing_email, plan_id")
    .in("id", wsIds.length ? wsIds : ["00000000-0000-0000-0000-000000000000"]);

  type WsRow = { id: string; name: string; billing_email: string; plan_id: string };
  const wsMap = new Map<string, WsRow>((workspaces ?? []).map((w: WsRow) => [w.id, w]));

  const enriched = (subs ?? [])
    .map(s => ({ ...s, workspace: wsMap.get(s.workspace_id) ?? null }))
    .filter(s => !search || s.ip_address?.includes(search) || wsMap.get(s.workspace_id)?.name?.toLowerCase().includes(search.toLowerCase()));

  return NextResponse.json({ subscriptions: enriched, total: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { adminClient: db } = ctx;
  const body = await req.json() as {
    workspace_id: string;
    ip_address?:  string;
    notes?:       string;
  };

  if (!body.workspace_id) {
    return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
  }

  const { data, error } = await db
    .from("dedicated_ip_subscriptions")
    .insert({
      workspace_id: body.workspace_id,
      ip_address:   body.ip_address ?? null,
      notes:        body.notes ?? null,
      status:       body.ip_address ? "active" : "pending",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ subscription: data });
}
