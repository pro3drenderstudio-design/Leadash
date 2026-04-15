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
  const plan    = searchParams.get("plan")   ?? "";
  const perPage = 25;

  // Fetch all workspaces with owner info via auth.users join
  let query = ctx.adminClient
    .from("workspaces")
    .select("id, name, slug, owner_id, plan_id, plan_status, lead_credits_balance, sends_this_month, max_monthly_sends, max_inboxes, max_seats, created_at, stripe_customer_id, billing_email", { count: "exact" })
    .order("created_at", { ascending: false });

  if (plan)   query = query.eq("plan_id", plan);
  if (search) query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);

  const { data: workspaces, count, error } = await query
    .range((page - 1) * perPage, page * perPage - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with owner emails
  const ownerIds = [...new Set((workspaces ?? []).map(w => w.owner_id))];
  const ownerMap = new Map<string, string>();
  if (ownerIds.length) {
    const { data: { users } } = await ctx.adminClient.auth.admin.listUsers({ perPage: 1000 });
    users.forEach(u => ownerMap.set(u.id, u.email ?? ""));
  }

  const enriched = (workspaces ?? []).map(w => ({
    ...w,
    owner_email: ownerMap.get(w.owner_id) ?? "",
  }));

  return NextResponse.json({ workspaces: enriched, total: count ?? 0, page, perPage });
}
