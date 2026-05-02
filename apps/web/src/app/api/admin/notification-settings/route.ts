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

// GET /api/admin/notification-settings
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await ctx.adminClient
    .from("notification_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? {});
}

// PUT /api/admin/notification-settings
export async function PUT(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as Record<string, unknown>;
  const db   = ctx.adminClient;

  const allowed = [
    "email_recipients",
    "email_on_warning",
    "email_on_critical",
    "quiet_hours_start",
    "quiet_hours_end",
    "slack_webhook_url",
    "thresholds",
  ];

  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  // Validate email_recipients is an array of strings
  if ("email_recipients" in update) {
    const arr = update.email_recipients;
    if (!Array.isArray(arr) || arr.some(e => typeof e !== "string")) {
      return NextResponse.json({ error: "email_recipients must be an array of strings" }, { status: 400 });
    }
  }

  // Get existing row id to upsert
  const { data: existing } = await db
    .from("notification_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await db
      .from("notification_settings")
      .update(update)
      .eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await db
      .from("notification_settings")
      .insert(update);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = await db
    .from("notification_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  return NextResponse.json(data ?? {});
}
