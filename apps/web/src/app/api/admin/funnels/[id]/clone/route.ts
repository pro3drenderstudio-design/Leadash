import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? { db, userId: user.id } : null;
}

// POST — clone funnel + all pages
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db, userId } = auth;
  const { id } = await params;

  // Get original funnel
  const { data: original, error: fErr } = await db.from("funnels").select("*").eq("id", id).single();
  if (fErr || !original) return NextResponse.json({ error: "Funnel not found" }, { status: 404 });

  // Get original pages
  const { data: pages } = await db.from("funnel_pages").select("*").eq("funnel_id", id).order("step_order");

  // Create cloned funnel
  const newSlug = `${original.slug}-copy-${Date.now()}`;
  const { data: cloned, error: cErr } = await db
    .from("funnels")
    .insert({
      name: `${original.name} (Copy)`,
      slug: newSlug,
      status: "draft",
      global_styles: original.global_styles,
      settings: original.settings,
      created_by: userId,
    })
    .select()
    .single();

  if (cErr || !cloned) return NextResponse.json({ error: cErr?.message ?? "Clone failed" }, { status: 500 });

  // Clone pages
  if (pages && pages.length > 0) {
    const clonedPages = pages.map((p: Record<string, unknown>) => ({
      funnel_id: cloned.id,
      name: p.name,
      slug: p.slug,
      step_order: p.step_order,
      page_type: p.page_type,
      status: "draft",
      blocks: p.blocks,
      settings: p.settings,
      connection: p.connection,
    }));
    await db.from("funnel_pages").insert(clonedPages);
  }

  return NextResponse.json({ funnel: cloned }, { status: 201 });
}
