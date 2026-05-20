import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { data: client, error } = await db
    .from("leadpay_clients")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ client });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const body = await req.json() as Record<string, unknown>;
  const allowed = ["first_name","last_name","company","email","country","notes"] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = typeof body[key] === "string" ? (body[key] as string).trim() : body[key];
  }
  if (updates.email) updates.email = (updates.email as string).toLowerCase();

  const { data: client, error } = await db
    .from("leadpay_clients")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  // Soft-block if client has paid invoices
  const { count } = await db
    .from("leadpay_invoices")
    .select("id", { count: "exact", head: true })
    .eq("client_id", id)
    .eq("workspace_id", workspaceId)
    .eq("status", "paid");

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Cannot delete client with paid invoices" },
      { status: 409 }
    );
  }

  const { error } = await db
    .from("leadpay_clients")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
