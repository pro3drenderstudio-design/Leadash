import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { data: account } = await db
    .from("leadpay_bank_accounts")
    .select("is_default")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (account.is_default) {
    return NextResponse.json({ error: "Cannot delete default bank account" }, { status: 409 });
  }

  const { error } = await db
    .from("leadpay_bank_accounts")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  // Only allowed action is setting as default
  const { data: account } = await db
    .from("leadpay_bank_accounts")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .from("leadpay_bank_accounts")
    .update({ is_default: false })
    .eq("workspace_id", workspaceId);

  await db
    .from("leadpay_bank_accounts")
    .update({ is_default: true })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  return NextResponse.json({ ok: true });
}
