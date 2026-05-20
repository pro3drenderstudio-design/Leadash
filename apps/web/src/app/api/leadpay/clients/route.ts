import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim();

  let query = db
    .from("leadpay_clients")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`
    );
  }

  const { data: clients, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach invoice stats
  const enriched = await Promise.all((clients ?? []).map(async (c: { id: string; [key: string]: unknown }) => {
    const { data: invoices } = await db
      .from("leadpay_invoices")
      .select("total_cents, status")
      .eq("client_id", c.id)
      .neq("status", "draft")
      .neq("status", "cancelled");

    const totalBilled  = (invoices ?? []).reduce((s: number, i: { total_cents: number | null }) => s + (i.total_cents ?? 0), 0);
    const invoiceCount = (invoices ?? []).length;
    return { ...c, total_billed_cents: totalBilled, invoice_count: invoiceCount };
  }));

  return NextResponse.json({ clients: enriched });
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json() as Record<string, unknown>;
  const email     = (body.email      as string | undefined)?.trim().toLowerCase();
  const firstName = (body.first_name as string | undefined)?.trim();

  if (!email)     return NextResponse.json({ error: "email required" },      { status: 400 });
  if (!firstName) return NextResponse.json({ error: "first_name required" }, { status: 400 });

  const { data: client, error } = await db
    .from("leadpay_clients")
    .insert({
      workspace_id: workspaceId,
      first_name:   firstName,
      last_name:    (body.last_name as string | undefined)?.trim() ?? null,
      company:      (body.company   as string | undefined)?.trim() ?? null,
      email,
      country:      (body.country   as string | undefined)?.trim() ?? null,
      notes:        (body.notes     as string | undefined)?.trim() ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client }, { status: 201 });
}
