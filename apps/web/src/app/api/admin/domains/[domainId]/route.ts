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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ domainId: string }> }
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { domainId } = await params;
  const body = await req.json();
  const { action } = body;

  if (!["retry_dns", "force_active", "reset", "set_failed"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const statusMap: Record<string, string> = {
    retry_dns:    "dns_pending",
    force_active: "active",
    reset:        "dns_pending",
    set_failed:   "failed",
  };

  const updates: Record<string, unknown> = {
    status:     statusMap[action],
    updated_at: now,
  };

  // Clear error on retry/force
  if (action === "retry_dns" || action === "force_active") {
    updates.error_message = null;
  }

  const { error } = await ctx.adminClient
    .from("outreach_domains")
    .update(updates)
    .eq("id", domainId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, action, newStatus: statusMap[action] });
}
