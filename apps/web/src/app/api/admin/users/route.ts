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
  const page   = parseInt(searchParams.get("page")  ?? "1");
  const search = searchParams.get("search") ?? "";
  const plan   = searchParams.get("plan")   ?? "";
  const perPage = 25;

  // Fetch auth users (Supabase Admin API, max 1000 at once)
  const { data: { users: allUsers } } = await ctx.adminClient.auth.admin.listUsers({ perPage: 1000 });

  // Fetch all workspaces to enrich
  const { data: workspaces } = await ctx.adminClient
    .from("workspaces")
    .select("id, owner_id, plan_id, name, lead_credits_balance, created_at");

  const wsMap = new Map<string, typeof workspaces[0][]>();
  (workspaces ?? []).forEach(w => {
    const arr = wsMap.get(w.owner_id) ?? [];
    arr.push(w);
    wsMap.set(w.owner_id, arr);
  });

  // Enrich users
  let enriched = allUsers.map(u => ({
    id:         u.id,
    email:      u.email ?? "",
    name:       resolveName(u.user_metadata),
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    email_confirmed: !!u.email_confirmed_at,
    banned:     !!u.banned_until,
    workspaces: wsMap.get(u.id) ?? [],
  }));

  // Filter
  if (search) {
    const s = search.toLowerCase();
    enriched = enriched.filter(u => u.email.toLowerCase().includes(s) || u.name?.toLowerCase().includes(s));
  }
  if (plan) {
    enriched = enriched.filter(u => u.workspaces.some(w => w.plan_id === plan));
  }

  // Sort newest first
  enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const total = enriched.length;
  const users = enriched.slice((page - 1) * perPage, page * perPage);

  return NextResponse.json({ users, total, page, perPage });
}
