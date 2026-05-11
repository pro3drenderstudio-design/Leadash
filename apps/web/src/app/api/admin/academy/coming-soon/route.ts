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

type Setting = { enabled: boolean; beta_workspaces: string[] };

function normalize(raw: unknown): Setting {
  const v = (raw ?? {}) as Record<string, unknown>;
  return {
    enabled:         typeof v.enabled === "boolean" ? v.enabled : true,
    beta_workspaces: Array.isArray(v.beta_workspaces) ? (v.beta_workspaces as string[]) : [],
  };
}

export async function GET() {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data } = await db
    .from("admin_settings")
    .select("value")
    .eq("key", "academy_coming_soon")
    .maybeSingle();

  return NextResponse.json(normalize(data?.value));
}

export async function PUT(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const value = normalize(body);

  const { error } = await db
    .from("admin_settings")
    .upsert({ key: "academy_coming_soon", value, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) {
    console.error("[coming-soon PUT]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(value);
}
