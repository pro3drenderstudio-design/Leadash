import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Offer } from "@/types/offers";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** POST /api/admin/offers/[id]/duplicate — clone an offer as a fresh draft. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { data: source, error: fetchErr } = await db.from("offers").select("*").eq("id", id).maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!source) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  const newName = `${source.name} (copy)`;
  const baseSlug = slugify(newName) || "offer";
  let slug = baseSlug;
  for (let i = 1; i <= 50; i++) {
    const { data: existing } = await db.from("offers").select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${i + 1}`;
  }

  const {
    id: _id, created_at: _createdAt, updated_at: _updatedAt, views_count: _viewsCount,
    ...rest
  } = source as Offer & Record<string, unknown>;

  const insert = {
    ...rest,
    name:        newName,
    slug,
    status:      "draft",
    views_count: 0,
  };

  const { data, error } = await db.from("offers").insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ offer: data as Offer }, { status: 201 });
}
