import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireVendorAuth } from "@/lib/vendor/auth";

export async function GET(req: NextRequest) {
  if (!requireVendorAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();

  const { data: invoices } = await db
    .from("vendor_invoices")
    .select("*")
    .order("invoice_date", { ascending: false })
    .limit(100);

  return NextResponse.json(invoices ?? []);
}

export async function PATCH(req: NextRequest) {
  if (!requireVendorAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db   = createAdminClient();
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Invoice id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.paypal_payment_id)  updates.paypal_payment_id  = body.paypal_payment_id;
  if (body.paypal_payment_url) updates.paypal_payment_url = body.paypal_payment_url;
  if (body.notes !== undefined) updates.notes = body.notes;

  const { error } = await db.from("vendor_invoices").update(updates).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
