import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  // Auth + admin check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();
  const { data: admin } = await adminClient.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfWeek  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalUsers },
    { count: newUsersWeek },
    { count: newUsersMonth },
    { count: totalWorkspaces },
    { count: totalCampaigns },
    { count: activeCampaigns },
    { count: totalLeads },
    { count: openTickets },
    { data: creditStats },
    { data: recentUsers },
    { data: recentTickets },
    { data: signupsByDay },
  ] = await Promise.all([
    adminClient.from("workspaces").select("*", { count: "exact", head: true }),
    adminClient.from("workspaces").select("*", { count: "exact", head: true }).gte("created_at", startOfWeek),
    adminClient.from("workspaces").select("*", { count: "exact", head: true }).gte("created_at", startOfMonth),
    adminClient.from("workspaces").select("*", { count: "exact", head: true }),
    adminClient.from("lead_campaigns").select("*", { count: "exact", head: true }),
    adminClient.from("lead_campaigns").select("*", { count: "exact", head: true }).in("status", ["running", "pending"]),
    adminClient.from("lead_campaign_leads").select("*", { count: "exact", head: true }),
    adminClient.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "open"),
    adminClient.from("lead_credit_transactions").select("type, amount").gte("created_at", startOfMonth),
    adminClient.from("workspaces").select("id, name, owner_id, plan_id, created_at, lead_credits_balance").order("created_at", { ascending: false }).limit(5),
    adminClient.from("support_tickets").select("id, subject, status, priority, created_at, workspace_id").order("created_at", { ascending: false }).limit(5),
    adminClient.from("workspaces").select("created_at").gte("created_at", thirtyDaysAgo).order("created_at", { ascending: true }),
  ]);

  // Aggregate credit stats for this month
  const creditsPurchased = (creditStats ?? []).filter(t => t.type === "purchase" || t.type === "grant").reduce((s, t) => s + (t.amount ?? 0), 0);
  const creditsConsumed  = (creditStats ?? []).filter(t => t.type === "consume" || t.type === "reserve").reduce((s, t) => s + Math.abs(t.amount ?? 0), 0);

  // Group signups by day for sparkline (last 30 days)
  const signupMap: Record<string, number> = {};
  (signupsByDay ?? []).forEach(w => {
    const day = w.created_at.slice(0, 10);
    signupMap[day] = (signupMap[day] ?? 0) + 1;
  });
  const signupSparkline = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    return { date: key, count: signupMap[key] ?? 0 };
  });

  return NextResponse.json({
    users: { total: totalUsers ?? 0, newThisWeek: newUsersWeek ?? 0, newThisMonth: newUsersMonth ?? 0 },
    workspaces: { total: totalWorkspaces ?? 0 },
    campaigns: { total: totalCampaigns ?? 0, active: activeCampaigns ?? 0 },
    leads: { total: totalLeads ?? 0 },
    tickets: { open: openTickets ?? 0 },
    credits: { purchased: creditsPurchased, consumed: creditsConsumed },
    recentUsers: recentUsers ?? [],
    recentTickets: recentTickets ?? [],
    signupSparkline,
  });
}
