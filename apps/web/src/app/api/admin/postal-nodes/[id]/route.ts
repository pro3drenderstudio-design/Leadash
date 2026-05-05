import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return db;
}

// PATCH /api/admin/postal-nodes/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;

  const allowed = ["label", "status", "inbox_limit", "postal_server_id", "postal_pool_id", "notes", "provisioned_at", "workspace_id"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await db
    .from("postal_nodes")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ node: data });
}

// DELETE /api/admin/postal-nodes/[id]  → retires the node (soft delete)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  // Safety check: don't retire a node that still has active inboxes
  const { count } = await db
    .from("outreach_inboxes")
    .select("id", { count: "exact", head: true })
    .eq("postal_node_id", id)
    .eq("status", "active");

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Cannot retire node with ${count} active inboxes. Migrate them first.` },
      { status: 409 },
    );
  }

  const { error } = await db
    .from("postal_nodes")
    .update({ status: "retired" })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
