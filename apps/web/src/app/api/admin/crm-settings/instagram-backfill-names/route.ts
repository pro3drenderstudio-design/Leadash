/**
 * POST /api/admin/crm-settings/instagram-backfill-names
 *
 * One-time backfill for Instagram contacts created before a Page access
 * token was configured — those all fell back to the generic "Instagram
 * User" display name since there was nothing to look up a real name with.
 * Re-fetches each one now that a token exists. Safe to re-run any time
 * (only touches contacts still on the fallback name).
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { fetchInstagramProfile } from "@/lib/instagram/profile";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { db };
}

export async function POST() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const { data: channelCfg } = await db
    .from("crm_channel_configs")
    .select("credentials")
    .eq("channel", "instagram")
    .single();
  const accessToken = channelCfg?.credentials?.access_token as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ error: "Instagram isn't connected yet — add a Page access token above first." }, { status: 400 });
  }

  const { data: contacts, error } = await db
    .from("crm_contacts")
    .select("id, instagram_id")
    .eq("source", "instagram")
    .or("display_name.is.null,display_name.eq.Instagram User")
    .not("instagram_id", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;
  for (const contact of contacts ?? []) {
    const name = await fetchInstagramProfile(contact.instagram_id as string, accessToken);
    if (name) {
      await db.from("crm_contacts").update({ display_name: name }).eq("id", contact.id);
      updated++;
    }
  }

  return NextResponse.json({ ok: true, checked: (contacts ?? []).length, updated });
}
