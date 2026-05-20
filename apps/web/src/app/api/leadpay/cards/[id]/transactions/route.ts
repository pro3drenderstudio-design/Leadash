import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  // Verify card belongs to workspace
  const { data: card } = await db
    .from("leadpay_cards")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const page  = Math.max(1, parseInt(searchParams.get("page")  ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "25"));

  const { data: transactions, count, error } = await db
    .from("leadpay_card_transactions")
    .select("*", { count: "exact" })
    .eq("card_id", id)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transactions: transactions ?? [], total: count ?? 0 });
}
