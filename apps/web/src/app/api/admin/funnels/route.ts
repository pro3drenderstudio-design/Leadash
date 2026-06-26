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

  // Get page counts
  const ids = (funnels ?? []).map((f: { id: string }) => f.id);
  let pageCounts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: pages } = await db
      .from("funnel_pages")
      .select("funnel_id")
      .in("funnel_id", ids);
    for (const p of pages ?? []) {
      pageCounts[p.funnel_id] = (pageCounts[p.funnel_id] ?? 0) + 1;
    }
  }

  const result = (funnels ?? []).map((f: Record<string, unknown>) => ({
    ...f,
    page_count: pageCounts[f.id as string] ?? 0,
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
