/**
 * GET /api/admin/crm/tags — distinct tags across crm_contacts.tags (jsonb
 * arrays), ordered by usage count. Powers the tag chip picker in the admin
 * "Create user" modal and can be reused wherever we need suggestions.
 */
import { NextResponse } from "next/server";
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

export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Pull the tags column across every contact and aggregate in-app. crm_contacts
  // is small enough (<10k rows expected) that a distinct-tag SQL RPC is
  // overkill — a single scan + a Map keeps the code short and readable.
  const { data, error } = await ctx.adminClient.from("crm_contacts").select("tags").limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { tags: unknown }[]) {
    if (!Array.isArray(row.tags)) continue;
    for (const t of row.tags) {
      if (typeof t !== "string") continue;
      const key = t.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const tags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));

  return NextResponse.json({ tags });
}
