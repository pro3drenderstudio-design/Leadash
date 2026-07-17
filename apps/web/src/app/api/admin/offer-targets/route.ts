/**
 * Admin offer targeting — activate any offer for any workspace, with an
 * optional expiry window. Powers "show this offer on user X's billing page".
 *
 * GET    /api/admin/offer-targets?offer_id=   — list targets (with names)
 * POST   /api/admin/offer-targets             — { offer_id, workspace_id|email, expires_at? }
 * DELETE /api/admin/offer-targets?id=         — remove a target
 */
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

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const offerId = req.nextUrl.searchParams.get("offer_id");
  let q = db.from("offer_targets")
    .select("id, offer_id, workspace_id, source, expires_at, created_at, offers(name, slug), workspaces(name)")
    .order("created_at", { ascending: false });
  if (offerId) q = q.eq("offer_id", offerId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ targets: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db, userId } = ctx;

  const body = await req.json() as { offer_id?: string; offer_slug?: string; workspace_id?: string; email?: string; expires_at?: string | null };

  // Resolve the offer.
  let offerId = body.offer_id ?? null;
  if (!offerId && body.offer_slug) {
    const { data: o } = await db.from("offers").select("id").eq("slug", body.offer_slug).maybeSingle();
    offerId = (o?.id as string) ?? null;
  }
  if (!offerId) return NextResponse.json({ error: "offer_id or offer_slug required" }, { status: 400 });

  // Resolve the workspace (by id or by owner email).
  let wsId = body.workspace_id ?? null;
  if (!wsId && body.email) {
    const email = body.email.trim().toLowerCase();
    const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
    const u = users?.users?.find((x: { email?: string }) => x.email === email);
    if (u) {
      const { data: m } = await db.from("workspace_members").select("workspace_id").eq("user_id", u.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
      wsId = (m?.workspace_id as string) ?? null;
    }
    if (!wsId) {
      const { data: ws } = await db.from("workspaces").select("id").eq("billing_email", email).limit(1).maybeSingle();
      wsId = (ws?.id as string) ?? null;
    }
  }
  if (!wsId) return NextResponse.json({ error: "Could not resolve a workspace for that user." }, { status: 400 });

  const { data, error } = await db.from("offer_targets").upsert({
    offer_id:     offerId,
    workspace_id: wsId,
    source:       "manual",
    expires_at:   body.expires_at ?? null,
    created_by:   userId,
  }, { onConflict: "offer_id,workspace_id" }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ target: data });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await db.from("offer_targets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
