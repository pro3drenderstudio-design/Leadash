import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

function genInvoiceNumber(existingCount: number): string {
  const num = String(existingCount + 1).padStart(4, "0");
  return `INV-${num}`;
}

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { searchParams } = new URL(req.url);
  const status  = searchParams.get("status");
  const search  = searchParams.get("search")?.trim();
  const page    = Math.max(1, parseInt(searchParams.get("page")  ?? "1"));
  const limit   = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
  const offset  = (page - 1) * limit;

  let query = db
    .from("leadpay_invoices")
    .select("*, client:leadpay_clients(*)", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && status !== "all") query = query.eq("status", status);
  if (search) {
    query = query.or(
      `invoice_number.ilike.%${search}%,client_name.ilike.%${search}%,client_email.ilike.%${search}%`
    );
  }

  const { data: invoices, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ invoices: invoices ?? [], total: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json() as Record<string, unknown>;

  // Validate line items
  const lineItems = body.line_items as Array<{ description: string; quantity: number; unit_price_cents: number }> | undefined;
  if (!lineItems || lineItems.length === 0) {
    return NextResponse.json({ error: "At least one line item required" }, { status: 400 });
  }

  // Compute totals
  const subtotalCents = lineItems.reduce((s, item) => {
    const total = Math.round(item.quantity * item.unit_price_cents);
    return s + total;
  }, 0);
  const taxRate   = parseFloat(String(body.tax_rate ?? "0"));
  const taxCents  = Math.round(subtotalCents * taxRate / 100);
  const totalCents = subtotalCents + taxCents;

  // Check fee settings
  const { data: feeRows } = await db
    .from("admin_settings")
    .select("key, value")
    .in("key", ["leadpay_platform_fee_pct", "leadpay_min_fee_cents", "leadpay_max_invoice_usd"]);
  const feeMap = Object.fromEntries((feeRows ?? []).map(r => [r.key, parseFloat(String(r.value))]));
  const maxInvoiceUsd = feeMap["leadpay_max_invoice_usd"] ?? 10000;
  const totalUsd = totalCents / 100;
  if (totalUsd > maxInvoiceUsd) {
    return NextResponse.json({ error: `Invoice maximum is $${maxInvoiceUsd}` }, { status: 400 });
  }

  const feePct      = feeMap["leadpay_platform_fee_pct"] ?? 3.0;
  const minFee      = feeMap["leadpay_min_fee_cents"]    ?? 100;
  const platformFee = Math.max(minFee, Math.round(totalCents * feePct / 100));
  const netUsd      = totalCents - platformFee;

  // Generate invoice number
  const { count: existing } = await db
    .from("leadpay_invoices")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  const invoiceNumber = genInvoiceNumber(existing ?? 0);

  // Look up client if client_id provided
  let clientName:  string | null = null;
  let clientEmail: string | null = null;
  if (body.client_id) {
    const { data: client } = await db
      .from("leadpay_clients")
      .select("first_name, last_name, email")
      .eq("id", body.client_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (client) {
      clientName  = [client.first_name, client.last_name].filter(Boolean).join(" ");
      clientEmail = client.email;
    }
  }

  const { data: invoice, error } = await db
    .from("leadpay_invoices")
    .insert({
      workspace_id:       workspaceId,
      client_id:          body.client_id ?? null,
      invoice_number:     invoiceNumber,
      status:             "draft",
      line_items:         lineItems.map(item => ({
        description:      item.description,
        quantity:         item.quantity,
        unit_price_cents: item.unit_price_cents,
        total_cents:      Math.round(item.quantity * item.unit_price_cents),
      })),
      subtotal_cents:     subtotalCents,
      tax_rate:           taxRate,
      tax_cents:          taxCents,
      total_cents:        totalCents,
      issue_date:         body.issue_date ?? new Date().toISOString().split("T")[0],
      due_date:           body.due_date   ?? null,
      client_name:        clientName,
      client_email:       clientEmail,
      platform_fee_cents: platformFee,
      net_usd_cents:      netUsd,
      notes:              (body.notes as string | undefined)?.trim() ?? null,
    })
    .select("*, client:leadpay_clients(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log creation event
  await db.from("leadpay_invoice_events").insert({
    invoice_id: invoice.id,
    event:      "created",
    metadata:   {},
  });

  // Log transaction record
  await db.from("leadpay_transactions").insert({
    workspace_id:     workspaceId,
    type:             "invoice_payment",
    invoice_id:       invoice.id,
    description:      `Invoice ${invoiceNumber} created`,
    usd_amount_cents: totalCents,
    status:           "pending",
    reference:        invoiceNumber,
  });

  return NextResponse.json({ invoice }, { status: 201 });
}
