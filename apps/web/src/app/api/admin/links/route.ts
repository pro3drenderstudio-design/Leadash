import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? { db, userId: user.id } : null;
}

// GET /api/admin/links — list all links with recent click counts
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;

  const search = req.nextUrl.searchParams.get("search")?.trim() || null;

  let q = db
    .from("tracked_links")
    .select("*")
    .order("created_at", { ascending: false });

  if (search) q = q.or(`slug.ilike.%${search}%,title.ilike.%${search}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ links: data ?? [] });
}

// POST /api/admin/links — create a new tracked link
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;

  const body = await req.json() as {
    slug: string;
    title: string;
    destination_url: string;
    description?: string;
  };

  const { slug, title, destination_url } = body;
  if (!slug || !title || !destination_url) {
    return NextResponse.json({ error: "slug, title, and destination_url are required" }, { status: 400 });
  }

  // Validate slug (alphanumeric + hyphens only)
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "Slug can only contain lowercase letters, numbers, and hyphens" }, { status: 400 });
  }

  const { data, error } = await db
    .from("tracked_links")
    .insert({ slug, title, destination_url, description: body.description ?? null })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "A link with that slug already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ link: data }, { status: 201 });
}
