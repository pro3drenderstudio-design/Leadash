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

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("q") ?? "";
  const tier   = searchParams.get("tier") ?? "";

  let query = ctx.db
    .from("affiliates")
    .select(`
      id, handle, tier, clicks, signups, paid_referrals,
      bank_name, bank_account_number, bank_account_name,
      created_at,
      workspaces!affiliates_workspace_id_fkey(name, billing_email)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (tier) query = query.eq("tier", tier);
  if (search) query = query.ilike("handle", `%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ affiliates: data ?? [] });
}
