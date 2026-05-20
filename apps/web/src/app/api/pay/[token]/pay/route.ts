import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();

  const { data: invoice } = await db
    .from("leadpay_invoices")
    .select("id, workspace_id, invoice_number, status, total_cents, net_usd_cents, platform_fee_cents")
    .eq("payment_token", token)
    .maybeSingle();

  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.status === "paid")      return NextResponse.json({ error: "Invoice already paid" }, { status: 409 });
  if (invoice.status === "cancelled") return NextResponse.json({ error: "Invoice is cancelled" }, { status: 409 });

  const body = await req.json() as {
    provider_ref?:  string;
    payer_email?:   string;
    payer_name?:    string;
    fx_rate?:       number;
  };

  // Validate provider callback (Flutterwave webhook would call this)
  const providerRef = body.provider_ref;
  if (!providerRef) return NextResponse.json({ error: "provider_ref required" }, { status: 400 });

  const now = new Date().toISOString();

  // Mark invoice paid
  await db.from("leadpay_invoices").update({
    status:     "paid",
    paid_at:    now,
    fx_rate:    body.fx_rate ?? null,
    updated_at: now,
  }).eq("id", invoice.id);

  // Credit workspace account
  const { data: acct } = await db
    .from("leadpay_accounts")
    .select("usd_balance_cents")
    .eq("workspace_id", invoice.workspace_id)
    .maybeSingle();

  if (acct) {
    await db.from("leadpay_accounts").update({
      usd_balance_cents: acct.usd_balance_cents + invoice.net_usd_cents,
      updated_at:        now,
    }).eq("workspace_id", invoice.workspace_id);
  }

  // Log event
  await db.from("leadpay_invoice_events").insert({
    invoice_id: invoice.id,
    event:      "paid",
    metadata:   { provider_ref: providerRef, payer_email: body.payer_email, payer_name: body.payer_name },
  });

  // Update transaction
  await db.from("leadpay_transactions")
    .update({ status: "completed" })
    .eq("invoice_id", invoice.id)
    .eq("status", "pending");

  return NextResponse.json({ ok: true, invoice_number: invoice.invoice_number });
}
