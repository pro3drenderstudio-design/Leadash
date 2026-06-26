/**
 * GET /api/crm/contacts/[id]
 * Returns full contact profile: contact row, linked workspace data,
 * funnel journey, open tasks, and recent activity timeline.
 *
 * PATCH /api/crm/contacts/[id]
 * Update lifecycle_stage, custom_fields, tags, display_name, etc.
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;
  const { id } = await params;

  // Fetch contact row with all extended fields
  const { data: contact, error } = await db
    .from("crm_contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch linked workspace if present
  let workspace = null;
  if (contact.workspace_id) {
    const { data: ws } = await db
      .from("workspaces")
      .select(`
        id, name, plan_id, lead_credits_balance, created_at,
        plan_configs (name)
      `)
      .eq("id", contact.workspace_id)
      .maybeSingle();
    workspace = ws;
  }

  // Fetch funnel state (academy journey)
  let funnelState = null;
  if (contact.user_id) {
    const { data: fs } = await db
      .from("funnel_states")
      .select("*")
      .eq("user_id", contact.user_id)
      .maybeSingle();
    funnelState = fs;
  }

  // Fetch open tasks
  const { data: tasks } = await db
    .from("crm_tasks")
    .select("id, title, due_at, completed_at, assigned_to, created_at")
    .eq("contact_id", id)
    .is("completed_at", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(10);

  // Fetch recent activity (last 15 messages across all conversations)
  const { data: recentMsgs } = await db
    .from("crm_messages")
    .select("id, direction, channel, body, created_at")
    .eq("contact_id", id)
    .order("created_at", { ascending: false })
    .limit(15);

  // Fetch conversation count per channel
  const { data: convos } = await db
    .from("crm_conversations")
    .select("id, channel, status, last_message_at")
    .eq("contact_id", id)
    .order("last_message_at", { ascending: false });

  return NextResponse.json({
    contact,
    workspace,
    funnel_state: funnelState,
    tasks:        tasks ?? [],
    recent_messages: recentMsgs ?? [],
    conversations:   convos ?? [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;
  const { id } = await params;

  const body = await req.json() as Record<string, unknown>;

  const allowed: Record<string, unknown> = {};
  const editable = ["display_name","email","phone","whatsapp_number","company","lifecycle_stage","custom_fields","tags","notes","status","timezone","avatar_url"];
  for (const key of editable) {
    if (key in body) allowed[key] = body[key];
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  allowed.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from("crm_contacts")
    .update(allowed)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}
