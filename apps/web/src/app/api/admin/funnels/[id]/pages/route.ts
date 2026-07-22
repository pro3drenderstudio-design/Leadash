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

// GET — list pages for funnel
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { id } = await params;

  const { data, error } = await db
    .from("funnel_pages")
    .select("id, funnel_id, name, slug, step_order, page_type, status, published_at, created_at, updated_at")
    .eq("funnel_id", id)
    .order("step_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pages: data ?? [] });
}

// POST — create page
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { id: funnel_id } = await params;

  const body = await req.json() as { name: string; slug: string; page_type?: string; from_page_id?: string };
  const { name, slug, page_type = "landing", from_page_id } = body;
  if (!name || !slug) return NextResponse.json({ error: "name and slug required" }, { status: 400 });

  // Get next step_order
  const { data: existing } = await db
    .from("funnel_pages")
    .select("step_order")
    .eq("funnel_id", funnel_id)
    .order("step_order", { ascending: false })
    .limit(1);

  const step_order = (existing?.[0]?.step_order ?? 0) + 1;

  // Duplicate: copy the source page's content, not just its metadata.
  let blocks: unknown = [];
  let settings: unknown = {};
  let connection: unknown = {};
  let effectivePageType = page_type;
  if (from_page_id) {
    const { data: src } = await db
      .from("funnel_pages")
      .select("blocks, settings, connection, page_type")
      .eq("id", from_page_id)
      .eq("funnel_id", funnel_id)
      .maybeSingle();
    if (src) {
      blocks = src.blocks ?? [];
      settings = src.settings ?? {};
      connection = src.connection ?? {};
      effectivePageType = (src.page_type as string) ?? page_type;
    }
  }

  const { data, error } = await db
    .from("funnel_pages")
    .insert({ funnel_id, name, slug, step_order, page_type: effectivePageType, status: "draft", blocks, settings, connection })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ page: data }, { status: 201 });
}
