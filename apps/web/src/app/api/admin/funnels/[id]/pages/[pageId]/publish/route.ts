import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? { db, userId: user.id } : null;
}

// POST — publish page: set status=published, save version, revalidate
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db, userId } = auth;
  const { id: funnelId, pageId } = await params;

  // Get current page
  const { data: page, error: pageErr } = await db
    .from("funnel_pages")
    .select("*")
    .eq("id", pageId)
    .single();

  if (pageErr || !page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  // Get funnel for slug
  const { data: funnel } = await db.from("funnels").select("slug").eq("id", funnelId).single();

  // Save version snapshot
  const { data: lastVersion } = await db
    .from("funnel_page_versions")
    .select("version")
    .eq("page_id", pageId)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (lastVersion?.version ?? 0) + 1;

  await db.from("funnel_page_versions").insert({
    page_id: pageId,
    version: nextVersion,
    blocks: page.blocks,
    settings: page.settings,
    saved_by: userId,
    saved_at: new Date().toISOString(),
  });

  // Update page status
  const { data: updated, error: updateErr } = await db
    .from("funnel_pages")
    .update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", pageId)
    .select()
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Revalidate the public page path
  if (funnel?.slug && page.slug) {
    try {
      revalidatePath(`/f/${funnel.slug}/${page.slug}`);
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ page: updated, version: nextVersion });
}
