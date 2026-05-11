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

  const now = new Date().toISOString();

  // Try UPDATE first (row already exists)
  const { data: updated, error: updateErr } = await db
    .from("admin_settings")
    .update({ value: merged, updated_at: now })
    .eq("key", "academy_coming_soon")
    .select("value")
    .single();

  if (updateErr?.code !== "PGRST116" && updateErr) {
    console.error("[coming-soon UPDATE]", updateErr);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (updated) return NextResponse.json({ setting: updated.value });

  // Row doesn't exist yet — insert it
  const { data: inserted, error: insertErr } = await db
    .from("admin_settings")
    .insert({ key: "academy_coming_soon", value: merged, updated_at: now })
    .select("value")
    .single();

  if (insertErr) {
    console.error("[coming-soon INSERT]", insertErr);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }
  return NextResponse.json({ setting: inserted.value });
}
