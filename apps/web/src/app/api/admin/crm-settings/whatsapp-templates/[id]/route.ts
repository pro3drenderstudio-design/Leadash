/**
 * DELETE /api/admin/crm-settings/whatsapp-templates/[id]
 *   Deletes the template from Meta and removes the local cache row.
 *   [id] is the local uuid from whatsapp_templates.id.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const GRAPH_VERSION = "v21.0";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, db };
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const { id } = await params;

  // Look up the local row to get the template name (Meta identifies templates by name)
  const { data: row } = await db
    .from("whatsapp_templates")
    .select("name")
    .eq("id", id)
    .single();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Get WhatsApp credentials
  const { data: channelCfg } = await db
    .from("crm_channel_configs")
    .select("config, credentials")
    .eq("channel", "whatsapp")
    .single();

  const wabaId     = (channelCfg?.config as Record<string, string> | null)?.waba_id;
  const accessToken = (channelCfg?.credentials as Record<string, string> | null)?.access_token;

  if (wabaId && accessToken) {
    // Best-effort delete from Meta — don't fail if Meta errors (the local row can still be removed)
    await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?name=${encodeURIComponent(row.name)}`,
      {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    ).catch(e => console.warn("[whatsapp-templates] Meta delete failed:", e));
  }

  await db.from("whatsapp_templates").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
