import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

export async function GET() {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data } = await db.from("admin_settings").select("value").eq("key", "academy_coming_soon").maybeSingle();
  return NextResponse.json({ setting: data?.value ?? { enabled: true, beta_workspaces: [] } });
}

export async function PATCH(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { enabled?: boolean; beta_workspaces?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Fetch current value and merge
  const { data: current } = await db.from("admin_settings").select("value").eq("key", "academy_coming_soon").maybeSingle();
  const existing = (current?.value ?? { enabled: true, beta_workspaces: [] }) as { enabled: boolean; beta_workspaces: string[] };

  const merged = {
    enabled:         body.enabled         ?? existing.enabled,
    beta_workspaces: body.beta_workspaces ?? existing.beta_workspaces,
  };

  const { data, error } = await db
    .from("admin_settings")
    .upsert(
      { key: "academy_coming_soon", value: merged, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
    .select("value")
    .single();

  if (error) {
    console.error("[coming-soon PATCH]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ setting: data.value });
}
