import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, db };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;
  const { id } = await params;

  const { data: account, error } = await db
    .from("leadpay_accounts")
    .select("*, workspace:workspaces(name), bank_accounts:leadpay_bank_accounts(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ account });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db, user } = ctx;
  const { id } = await params;

  const body = await req.json() as { action?: string; rejection_reason?: string };

  const { data: account } = await db
    .from("leadpay_accounts")
    .select("kyc_status")
    .eq("id", id)
    .maybeSingle();

  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "approve_kyc") {
    const { data: updated } = await db
      .from("leadpay_accounts")
      .update({
        kyc_status: "verified",
        status:     "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select().single();
    return NextResponse.json({ account: updated });
  }

  if (body.action === "reject_kyc") {
    if (!body.rejection_reason?.trim()) {
      return NextResponse.json({ error: "rejection_reason required" }, { status: 400 });
    }
    const { data: updated } = await db
      .from("leadpay_accounts")
      .update({
        kyc_status:           "rejected",
        kyc_rejection_reason: body.rejection_reason.trim(),
        updated_at:           new Date().toISOString(),
      })
      .eq("id", id)
      .select().single();
    return NextResponse.json({ account: updated });
  }

  if (body.action === "suspend") {
    const { data: updated } = await db
      .from("leadpay_accounts")
      .update({ status: "suspended", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select().single();
    return NextResponse.json({ account: updated });
  }

  if (body.action === "activate") {
    const { data: updated } = await db
      .from("leadpay_accounts")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select().single();
    return NextResponse.json({ account: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
