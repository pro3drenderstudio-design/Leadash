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
  const page     = parseInt(searchParams.get("page")     ?? "1");
  const status   = searchParams.get("status")   ?? "";
  const priority = searchParams.get("priority") ?? "";
  const search   = searchParams.get("search")   ?? "";
  const perPage  = 30;

  let query = ctx.adminClient
    .from("support_tickets")
    .select("id, ticket_number, subject, message, category, priority, status, admin_reply, admin_replied_at, created_at, updated_at, user_id, workspace_id", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status)   query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);
  if (search)   query = query.ilike("subject", `%${search}%`);

  const { data: tickets, count, error } = await query
    .range((page - 1) * perPage, page * perPage - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with user emails
  const userIds = [...new Set((tickets ?? []).map(t => t.user_id))];
  const emailMap = new Map<string, string>();
  if (userIds.length) {
    const { data: { users } } = await ctx.adminClient.auth.admin.listUsers({ perPage: 1000 });
    users.forEach(u => emailMap.set(u.id, u.email ?? ""));
  }

  const enriched = (tickets ?? []).map(t => ({
    ...t,
    user_email: emailMap.get(t.user_id) ?? "",
  }));

  return NextResponse.json({ tickets: enriched, total: count ?? 0, page, perPage });
}
