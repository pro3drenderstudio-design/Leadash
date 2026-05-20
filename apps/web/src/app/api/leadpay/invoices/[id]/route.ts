import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const [invoiceRes, eventsRes] = await Promise.all([
    db.from("leadpay_invoices")
      .select("*, client:leadpay_clients(*)")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    db.from("leadpay_invoice_events")
      .select("*")
      .eq("invoice_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (invoiceRes.error) return NextResponse.json({ error: invoiceRes.error.message }, { status: 500 });
  if (!invoiceRes.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ invoice: invoiceRes.data, events: eventsRes.data ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { data: invoice } = await db
    .from("leadpay_invoices")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json() as { action?: string; [key: string]: unknown };
  const action = body.action;

  if (action === "cancel") {
    if (!["draft","sent","viewed","overdue"].includes(invoice.status)) {
      return NextResponse.json({ error: "Invoice cannot be cancelled in current state" }, { status: 409 });
    }
    const { data: updated } = await db
      .from("leadpay_invoices")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    await db.from("leadpay_invoice_events").insert({ invoice_id: id, event: "cancelled", metadata: {} });
    await db.from("leadpay_transactions").update({ status: "failed" }).eq("invoice_id", id).eq("status", "pending");
    return NextResponse.json({ invoice: updated });
  }

  if (action === "mark_paid") {
    if (invoice.status === "paid") return NextResponse.json({ error: "Already paid" }, { status: 409 });
    const now = new Date().toISOString();
    const { data: updated } = await db
      .from("leadpay_invoices")
      .update({ status: "paid", paid_at: now, updated_at: now })
      .eq("id", id)
      .select()
      .single();

    await db.from("leadpay_invoice_events").insert({ invoice_id: id, event: "paid", metadata: { manual: true } });

    // Update transaction to completed and credit account
    await db.from("leadpay_transactions").update({ status: "completed" }).eq("invoice_id", id).eq("status", "pending");

    // Credit balance
    const { data: acct } = await db.from("leadpay_accounts").select("usd_balance_cents").eq("workspace_id", workspaceId).maybeSingle();
    if (acct) {
      await db.from("leadpay_accounts")
        .update({ usd_balance_cents: acct.usd_balance_cents + invoice.net_usd_cents, updated_at: now })
        .eq("workspace_id", workspaceId);
    }

    return NextResponse.json({ invoice: updated });
  }

  // General edit (draft only)
  if (invoice.status !== "draft") {
    return NextResponse.json({ error: "Only draft invoices can be edited" }, { status: 409 });
  }

  const allowed = ["due_date","notes","client_id","line_items","tax_rate","issue_date"] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (updates.line_items) {
    const items = updates.line_items as Array<{ description: string; quantity: number; unit_price_cents: number }>;
    const subtotal = items.reduce((s, it) => s + Math.round(it.quantity * it.unit_price_cents), 0);
    const taxRate  = updates.tax_rate ? parseFloat(String(updates.tax_rate)) : invoice.tax_rate;
    const tax      = Math.round(subtotal * taxRate / 100);
    updates.subtotal_cents = subtotal;
    updates.tax_cents      = tax;
    updates.total_cents    = subtotal + tax;
    updates.line_items     = items.map(it => ({ ...it, total_cents: Math.round(it.quantity * it.unit_price_cents) }));
  }

  const { data: updated, error } = await db
    .from("leadpay_invoices")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*, client:leadpay_clients(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: updated });
}
