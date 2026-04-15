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

// GET /api/admin/users/[userId]
export async function GET(_: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { userId } = await params;

  const { data: { user: target }, error } = await ctx.adminClient.auth.admin.getUserById(userId);
  if (error || !target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [
    { data: workspaces },
    { data: campaigns },
    { data: creditTxns },
    { data: tickets },
  ] = await Promise.all([
    ctx.adminClient.from("workspaces").select("id, name, plan_id, plan_status, lead_credits_balance, created_at, stripe_customer_id, sends_this_month, max_monthly_sends, max_inboxes").eq("owner_id", userId),
    ctx.adminClient.from("lead_campaigns").select("id, name, status, total_scraped, credits_used, created_at").eq("workspace_id",
      // Get workspace IDs for this user
      ctx.adminClient.from("workspaces").select("id").eq("owner_id", userId)
    ).order("created_at", { ascending: false }).limit(10),
    ctx.adminClient.from("lead_credit_transactions").select("id, amount, type, description, created_at").order("created_at", { ascending: false }).limit(20),
    ctx.adminClient.from("support_tickets").select("id, subject, status, priority, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    user: {
      id: target.id,
      email: target.email,
      name: (target.user_metadata?.full_name as string) ?? null,
      created_at: target.created_at,
      last_sign_in_at: target.last_sign_in_at,
      email_confirmed: !!target.email_confirmed_at,
      banned_until: target.banned_until ?? null,
      user_metadata: target.user_metadata,
    },
    workspaces: workspaces ?? [],
    tickets: tickets ?? [],
  });
}

// PATCH /api/admin/users/[userId] — ban / unban / reset password
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { userId } = await params;
  const body = await req.json();

  if (body.action === "ban") {
    const { error } = await ctx.adminClient.auth.admin.updateUserById(userId, {
      ban_duration: body.duration ?? "876600h", // 100 years
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "unban") {
    const { error } = await ctx.adminClient.auth.admin.updateUserById(userId, { ban_duration: "none" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reset_password") {
    const { data: { user: target } } = await ctx.adminClient.auth.admin.getUserById(userId);
    if (!target?.email) return NextResponse.json({ error: "No email" }, { status: 400 });
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(target.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    const { error } = await ctx.adminClient.auth.admin.deleteUser(userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
