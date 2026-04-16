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

// GET /api/admin/workspaces/[workspaceId]
export async function GET(_: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { workspaceId } = await params;

  const [
    { data: workspace, error: wsError },
    { data: credits },
    { data: campaigns },
  ] = await Promise.all([
    ctx.adminClient.from("workspaces").select("*").eq("id", workspaceId).single(),
    ctx.adminClient
      .from("lead_credit_transactions")
      .select("id, amount, type, description, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(30),
    ctx.adminClient
      .from("lead_campaigns")
      .select("id, name, status, total_scraped, credits_used, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (wsError || !workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  // Get owner email
  const { data: { user: owner } } = await ctx.adminClient.auth.admin.getUserById(workspace.owner_id);

  return NextResponse.json({
    workspace: { ...workspace, owner_email: owner?.email ?? "" },
    credits:   credits   ?? [],
    campaigns: campaigns ?? [],
  });
}

// PATCH /api/admin/workspaces/[workspaceId]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { workspaceId } = await params;
  const body = await req.json();

  // Change plan
  if (body.action === "change_plan") {
    const { plan_id, plan_status } = body;
    if (!plan_id) return NextResponse.json({ error: "plan_id required" }, { status: 400 });

    // Plan limits
    const limits: Record<string, { max_inboxes: number; max_monthly_sends: number; max_seats: number }> = {
      free:    { max_inboxes: 3,   max_monthly_sends: 1000,  max_seats: 1 },
      starter: { max_inboxes: 5,   max_monthly_sends: 5000,  max_seats: 3 },
      growth:  { max_inboxes: 15,  max_monthly_sends: 25000, max_seats: 5 },
      scale:   { max_inboxes: 50,  max_monthly_sends: 100000, max_seats: 15 },
    };
    const planLimits = limits[plan_id] ?? limits.free;

    const { error } = await ctx.adminClient
      .from("workspaces")
      .update({ plan_id, plan_status: plan_status ?? "active", ...planLimits, updated_at: new Date().toISOString() })
      .eq("id", workspaceId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // Grant or deduct credits
  if (body.action === "adjust_credits") {
    const amount: number = body.amount;
    const description: string = body.description ?? (amount > 0 ? "Admin credit grant" : "Admin credit adjustment");
    if (!amount || amount === 0) return NextResponse.json({ error: "amount required (non-zero)" }, { status: 400 });

    // Insert transaction record
    const txType = amount > 0 ? "grant" : "refund";
    const { error: txError } = await ctx.adminClient
      .from("lead_credit_transactions")
      .insert({ workspace_id: workspaceId, amount, type: txType, description });

    if (txError) return NextResponse.json({ error: txError.message }, { status: 400 });

    // Update balance (increment/decrement)
    const { error: balError } = await ctx.adminClient.rpc("increment_credits", {
      p_workspace_id: workspaceId,
      p_amount: amount,
    });

    // Fallback: direct update if rpc doesn't exist
    if (balError) {
      const { data: ws } = await ctx.adminClient.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single();
      if (ws) {
        const newBalance = Math.max(0, (ws.lead_credits_balance ?? 0) + amount);
        const { error: updateErr } = await ctx.adminClient
          .from("workspaces")
          .update({ lead_credits_balance: newBalance })
          .eq("id", workspaceId);
        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
