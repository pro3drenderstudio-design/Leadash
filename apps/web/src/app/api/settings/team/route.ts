import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const [{ data: members }, { data: invites }] = await Promise.all([
    db.from("workspace_members")
      .select("id, role, joined_at, user_id")
      .eq("workspace_id", workspaceId),
    db.from("workspace_invites")
      .select("id, email, role, created_at, expires_at, accepted_at")
      .eq("workspace_id", workspaceId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);

  // Enrich members with email from auth.users via admin client
  const adminDb = createAdminClient();
  type RawMember = { id: string; role: string; joined_at: string; user_id: string };
  const enriched = await Promise.all(
    (members as RawMember[] ?? []).map(async (m) => {
      const { data } = await adminDb.auth.admin.getUserById(m.user_id);
      return {
        id:        m.id,
        user_id:   m.user_id,
        role:      m.role,
        joined_at: m.joined_at,
        email:     data.user?.email ?? "",
        full_name: data.user?.user_metadata?.full_name ?? "",
      };
    }),
  );

  return NextResponse.json({ members: enriched, invites: invites ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { email, role = "member" } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const { data, error } = await db.from("workspace_invites").upsert(
    {
      workspace_id: workspaceId,
      email:        email.toLowerCase().trim(),
      role,
      invited_by:   user!.id,
      expires_at:   new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      accepted_at:  null,
    },
    { onConflict: "workspace_id,email" },
  ).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, userId, db } = auth;

  const { member_id, invite_id } = await req.json() as { member_id?: string; invite_id?: string };

  // Delete a pending invite
  if (invite_id) {
    await db.from("workspace_invites")
      .delete()
      .eq("id", invite_id)
      .eq("workspace_id", workspaceId);
    return NextResponse.json({ ok: true });
  }

  if (!member_id) return NextResponse.json({ error: "member_id required" }, { status: 400 });

  // Fetch target member
  const { data: target } = await db
    .from("workspace_members")
    .select("user_id, role")
    .eq("id", member_id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Block removing the last owner — workspace would become ownerless
  if (target.role === "owner") {
    const { count } = await db
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the only owner. Transfer ownership first." },
        { status: 400 },
      );
    }
  }

  // Block non-owners from removing others (only admins/owners can remove members)
  const { data: actor } = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  const actorRole = actor?.role ?? "member";
  const canRemove = actorRole === "owner" || actorRole === "admin" || target.user_id === userId;
  if (!canRemove) {
    return NextResponse.json({ error: "Not authorized to remove this member." }, { status: 403 });
  }

  await db.from("workspace_members")
    .delete()
    .eq("id", member_id)
    .eq("workspace_id", workspaceId);

  return NextResponse.json({ ok: true });
}
