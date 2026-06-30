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

// GET — list all funnels with page count
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;

  const { data: funnels, error } = await db
    .from("funnels")
    .select("id, name, slug, custom_domain, status, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get page counts + an entry page (lowest step_order, preferring published) per funnel —
  // used both for the admin-preview link and for building the funnel's real public URL.
  const ids = (funnels ?? []).map((f: { id: string }) => f.id);
  const pageCounts: Record<string, number> = {};
  const entryPages: Record<string, { id: string; slug: string }> = {};
  const entryPageIsPublished: Record<string, boolean> = {};
  if (ids.length > 0) {
    const { data: pages } = await db
      .from("funnel_pages")
      .select("id, slug, funnel_id, status, step_order")
      .in("funnel_id", ids)
      .order("step_order", { ascending: true });
    for (const p of pages ?? []) {
      pageCounts[p.funnel_id] = (pageCounts[p.funnel_id] ?? 0) + 1;
      const alreadyHasPublished = entryPageIsPublished[p.funnel_id] ?? false;
      if (!entryPages[p.funnel_id] || (p.status === "published" && !alreadyHasPublished)) {
        entryPages[p.funnel_id] = { id: p.id, slug: p.slug };
        entryPageIsPublished[p.funnel_id] = p.status === "published";
      }
    }
  }

  const result = (funnels ?? []).map((f: Record<string, unknown>) => ({
    ...f,
    page_count: pageCounts[f.id as string] ?? 0,
    preview_page_id: entryPages[f.id as string]?.id ?? null,
    entry_page_slug: entryPages[f.id as string]?.slug ?? null,
  }));

  return NextResponse.json({ funnels: result });
}

// POST — create funnel
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db, userId } = auth;

  const body = await req.json() as { name: string; slug: string };
  const { name, slug } = body;
  if (!name || !slug) return NextResponse.json({ error: "name and slug required" }, { status: 400 });

  const { data, error } = await db
    .from("funnels")
    .insert({ name, slug, status: "draft", created_by: userId })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ funnel: data }, { status: 201 });
}
