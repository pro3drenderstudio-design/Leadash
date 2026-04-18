import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidateTag } from "next/cache";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, db };
}

export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data } = await ctx.db.from("platform_config").select("*").single();
  return NextResponse.json(data ?? { usd_to_ngn: 1700 });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { usd_to_ngn?: number };
  if (typeof body.usd_to_ngn !== "number" || body.usd_to_ngn < 100) {
    return NextResponse.json({ error: "usd_to_ngn must be a number ≥ 100" }, { status: 400 });
  }

  const { data, error } = await ctx.db
    .from("platform_config")
    .update({ usd_to_ngn: body.usd_to_ngn, updated_at: new Date().toISOString(), updated_by: ctx.user.id })
    .eq("id", true)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateTag("usd_ngn_rate", {});

  return NextResponse.json(data);
}
