/**
 * GET  /api/admin/crm-settings   — list all channel configs
 * PATCH /api/admin/crm-settings  — upsert a channel config
 * DELETE /api/admin/crm-settings?channel= — disconnect a channel
 */
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

export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const { data, error } = await db
    .from("crm_channel_configs")
    .select("id, channel, status, config, token_expires_at, created_at, updated_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ configs: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const body = await req.json() as {
    channel:           "instagram" | "facebook" | "sms" | "whatsapp";
    credentials?:      Record<string, string>;
    config?:           Record<string, string>;
    status?:           string;
    token_expires_at?: string;
  };

  if (!body.channel) return NextResponse.json({ error: "channel required" }, { status: 400 });

  const now = new Date().toISOString();

  const { data, error } = await db
    .from("crm_channel_configs")
    .upsert(
      {
        channel:          body.channel,
        credentials:      body.credentials ?? {},
        config:           body.config       ?? {},
        status:           body.status       ?? "connected",
        token_expires_at: body.token_expires_at ?? null,
        updated_at:       now,
      },
      { onConflict: "channel" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const channel = req.nextUrl.searchParams.get("channel");
  if (!channel) return NextResponse.json({ error: "channel required" }, { status: 400 });

  await db
    .from("crm_channel_configs")
    .update({ status: "disconnected", credentials: {}, updated_at: new Date().toISOString() })
    .eq("channel", channel);

  return NextResponse.json({ ok: true });
}
