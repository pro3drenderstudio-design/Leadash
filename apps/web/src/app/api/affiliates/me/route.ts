import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  // Use admin client for reads that need to bypass RLS on affiliates (auto-create)
  const admin = createAdminClient();

  // Get affiliate record (auto-create if not exists)
  let { data: affiliate } = await admin
    .from("affiliates")
    .select("*")
    .eq("workspace_id", auth.workspaceId)
    .maybeSingle();

  if (!affiliate) {
    // Auto-enroll: derive handle from workspace name
    const { data: ws } = await admin.from("workspaces").select("name").eq("id", auth.workspaceId).single();
    const rawHandle = (ws?.name ?? "user")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 12);
    const handle = `${rawHandle}${Math.random().toString(36).slice(2, 6)}`;

    const { data: created } = await admin
      .from("affiliates")
      .insert({ user_id: auth.userId, workspace_id: auth.workspaceId, handle })
      .select("*")
      .single();
    affiliate = created;
  }

  if (!affiliate) return NextResponse.json({ error: "Failed to load affiliate record" }, { status: 500 });

  // Commission summary — use user client so RLS restricts to own affiliate
  const supabase = await createClient();
  const { data: commissions } = await supabase
    .from("commission_events")
    .select("amount_ngn, status, holds_until")
    .eq("affiliate_id", affiliate.id);

  const now = new Date();
  const available = (commissions ?? [])
    .filter(c => c.status === "available" || (c.status === "pending" && new Date(c.holds_until) <= now))
    .reduce((s, c) => s + Number(c.amount_ngn), 0);
  const pending = (commissions ?? [])
    .filter(c => c.status === "pending" && new Date(c.holds_until) > now)
    .reduce((s, c) => s + Number(c.amount_ngn), 0);
  const paid = (commissions ?? [])
    .filter(c => c.status === "paid")
    .reduce((s, c) => s + Number(c.amount_ngn), 0);

  return NextResponse.json({
    affiliate: {
      ...affiliate,
      referral_url: `https://leadash.com/r/${affiliate.handle}`,
    },
    earnings: { available, pending, paid, total: available + pending + paid },
  });
}

// Update bank details
export async function PATCH(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const supabase = await createClient();
  const { bank_name, bank_account_number, bank_account_name } = await req.json();

  const { error } = await supabase
    .from("affiliates")
    .update({ bank_name, bank_account_number, bank_account_name })
    .eq("workspace_id", auth.workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
