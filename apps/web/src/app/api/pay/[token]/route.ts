import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();

  const { data: invoice, error } = await db
    .from("leadpay_invoices")
    .select(`
      invoice_number, status, line_items, subtotal_cents,
      tax_rate, tax_cents, total_cents, due_date, notes,
      client_name,
      account:leadpay_accounts!workspace_id (display_name, logo_url, brand_color)
    `)
    .eq("payment_token", token)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  // Don't return sensitive data
  return NextResponse.json({
    invoice_number: invoice.invoice_number,
    status:         invoice.status,
    line_items:     invoice.line_items,
    subtotal_cents: invoice.subtotal_cents,
    tax_rate:       invoice.tax_rate,
    tax_cents:      invoice.tax_cents,
    total_cents:    invoice.total_cents,
    due_date:       invoice.due_date,
    notes:          invoice.notes,
    client_name:    invoice.client_name,
    display_name:   (invoice.account as { display_name?: string } | null)?.display_name ?? null,
    logo_url:       (invoice.account as { logo_url?: string } | null)?.logo_url ?? null,
    brand_color:    (invoice.account as { brand_color?: string } | null)?.brand_color ?? "#6366f1",
  });
}
