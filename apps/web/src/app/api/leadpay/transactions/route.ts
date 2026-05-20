import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { searchParams } = new URL(req.url);
  const page   = Math.max(1, parseInt(searchParams.get("page")   ?? "1"));
  const limit  = Math.min(100, parseInt(searchParams.get("limit") ?? "25"));
  const type   = searchParams.get("type");
  const status = searchParams.get("status");
  const search = searchParams.get("search")?.trim();

  let query = db
    .from("leadpay_transactions")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (type   && type   !== "all") query = query.eq("type",   type);
  if (status && status !== "all") query = query.eq("status", status);
  if (search) {
    query = query.or(`description.ilike.%${search}%,reference.ilike.%${search}%`);
  }

  const { data: transactions, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transactions: transactions ?? [], total: count ?? 0 });
}
