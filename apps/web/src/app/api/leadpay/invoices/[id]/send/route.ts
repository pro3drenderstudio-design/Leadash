import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

const APP_URL  = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";
const FROM     = process.env.RESEND_FROM_EMAIL   ?? "payments@leadash.com";
const RESEND   = process.env.RESEND_API_KEY;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { data: invoice } = await db
    .from("leadpay_invoices")
    .select("*, client:leadpay_clients(*)")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invoice.status === "paid" || invoice.status === "cancelled") {
    return NextResponse.json({ error: "Cannot send a paid or cancelled invoice" }, { status: 409 });
  }

  const body = await req.json() as { to?: string; subject?: string; message?: string; is_reminder?: boolean };
  const isReminder = Boolean(body.is_reminder);
  const toEmail   = (body.to ?? invoice.client_email ?? "")?.trim();
  if (!toEmail) return NextResponse.json({ error: "Recipient email required" }, { status: 400 });

  const { data: account } = await db
    .from("leadpay_accounts")
    .select("display_name, brand_color")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const displayName  = account?.display_name ?? "Your service provider";
  const brandColor   = account?.brand_color  ?? "#6366f1";
  const paymentLink  = `${APP_URL}/pay/${invoice.payment_token}`;
  const amountStr    = `$${(invoice.total_cents / 100).toFixed(2)}`;

  const subject = body.subject ?? (isReminder
    ? `Reminder: Invoice ${invoice.invoice_number} for ${amountStr} is due`
    : `Invoice ${invoice.invoice_number} from ${displayName} — ${amountStr}`);

  const message = body.message ?? (isReminder
    ? `This is a friendly reminder that your invoice of ${amountStr} is due. Please click the button below to pay.`
    : `Please find your invoice attached. Click the button below to view and pay securely.`);

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:20px}
  .card{max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .header{background:${brandColor};padding:24px 28px;color:#fff}
  .header h1{margin:0;font-size:18px;font-weight:600}
  .header p{margin:4px 0 0;font-size:13px;opacity:.85}
  .body{padding:28px}
  .amount{font-size:32px;font-weight:700;color:#111;margin:0 0 16px}
  .msg{color:#444;font-size:14px;line-height:1.6;margin-bottom:24px}
  .btn{display:inline-block;background:${brandColor};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600}
  .footer{background:#f9f9fb;padding:16px 28px;font-size:12px;color:#888;border-top:1px solid #eee}
</style></head>
<body>
<div class="card">
  <div class="header">
    <h1>${displayName}</h1>
    <p>Invoice ${invoice.invoice_number}</p>
  </div>
  <div class="body">
    <div class="amount">${amountStr}</div>
    <p class="msg">${message.replace(/\n/g, "<br>")}</p>
    <a href="${paymentLink}" class="btn">View & Pay Invoice</a>
  </div>
  <div class="footer">
    Or copy this link: ${paymentLink}<br>
    ${invoice.due_date ? `Due: ${new Date(invoice.due_date).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}` : ""}
  </div>
</div>
</body></html>`;

  if (!RESEND) {
    return NextResponse.json({ error: "Email service not configured" }, { status: 503 });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from:    `${displayName} via LeadPay <${FROM}>`,
      to:      [toEmail],
      subject,
      html,
      text: `${message}\n\nPay here: ${paymentLink}`,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Email failed: ${err}` }, { status: 500 });
  }

  const now = new Date().toISOString();
  await db.from("leadpay_invoices").update({
    status:       invoice.status === "draft" ? "sent" : invoice.status,
    last_sent_at: now,
    client_email: toEmail,
    updated_at:   now,
  }).eq("id", id);

  await db.from("leadpay_invoice_events").insert({
    invoice_id: id,
    event:      isReminder ? "reminded" : "sent",
    metadata:   { to: toEmail, subject },
  });

  return NextResponse.json({ ok: true, sent_to: toEmail });
}
