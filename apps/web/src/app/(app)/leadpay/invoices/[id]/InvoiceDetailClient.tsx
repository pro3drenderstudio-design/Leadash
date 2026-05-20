"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { wsGet, wsFetch } from "@/lib/workspace/client";
import type { LeadPayInvoice, LeadPayInvoiceEvent } from "@/types/leadpay";

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtTs(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Draft",     cls: "bg-white/8 text-white/40" },
  sent:      { label: "Sent",      cls: "bg-blue-500/15 text-blue-400" },
  viewed:    { label: "Viewed",    cls: "bg-violet-500/15 text-violet-400" },
  paid:      { label: "Paid",      cls: "bg-emerald-500/15 text-emerald-400" },
  overdue:   { label: "Overdue",   cls: "bg-red-500/15 text-red-400" },
  cancelled: { label: "Cancelled", cls: "bg-white/8 text-white/30" },
};

const EVENT_LABELS: Record<string, string> = {
  created:           "Invoice created",
  sent:              "Invoice sent",
  viewed:            "Client viewed invoice",
  payment_attempted: "Payment attempted",
  paid:              "Payment received",
  reminded:          "Reminder sent",
  cancelled:         "Invoice cancelled",
};

// ── Send modal ────────────────────────────────────────────────────────────────
function SendModal({ invoice, onClose, onSent }: { invoice: LeadPayInvoice; onClose: () => void; onSent: () => void }) {
  const [to, setTo]           = useState(invoice.client_email ?? "");
  const [subject, setSubject] = useState(`Invoice ${invoice.invoice_number} from LeadPay`);
  const [message, setMessage] = useState(`Hi${invoice.client_name ? ` ${invoice.client_name.split(" ")[0]}` : ""},\n\nPlease find your invoice attached. You can pay securely via the link below.\n\nThank you for your business.`);
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function send() {
    setSending(true); setError(null);
    try {
      const res = await wsFetch(`/api/leadpay/invoices/${invoice.id}/send`, {
        method: "POST", body: JSON.stringify({ to, subject, message }),
      });
      if (!res.ok) { const d = await res.json() as { error: string }; setError(d.error); return; }
      onSent();
    } catch (e) { setError(String(e)); } finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111] border border-white/10 rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h2 className="text-base font-semibold text-white">Send Invoice</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/70">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-white/40 mb-1.5">To</label>
            <input value={to} onChange={e => setTo(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50 resize-none" />
          </div>
          {/* Copy link */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white/4 border border-white/8 rounded-lg">
            <svg className="w-3.5 h-3.5 text-white/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
            <span className="text-xs text-white/40 flex-1 truncate font-mono">
              {typeof window !== "undefined" ? `${window.location.origin}/pay/${invoice.payment_token}` : `…/pay/${invoice.payment_token}`}
            </span>
            <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/pay/${invoice.payment_token}`)}
              className="text-xs text-orange-400 hover:text-orange-300 flex-shrink-0">Copy</button>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-white/8">
          <button onClick={send} disabled={sending || !to}
            className="px-5 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors">
            {sending ? "Sending…" : "Send Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function InvoiceDetailClient() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const [invoice, setInvoice] = useState<LeadPayInvoice | null>(null);
  const [events, setEvents]   = useState<LeadPayInvoiceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSend, setShowSend] = useState(false);
  const [actioning, setActioning] = useState(false);

  useEffect(() => {
    async function load() {
      const data = await wsGet<{ invoice: LeadPayInvoice; events: LeadPayInvoiceEvent[] }>(`/api/leadpay/invoices/${id}`).catch(() => null);
      if (data) { setInvoice(data.invoice); setEvents(data.events); }
      setLoading(false);
    }
    load();
  }, [id]);

  async function action(act: "remind" | "cancel" | "mark_paid") {
    setActioning(true);
    try {
      const res = await wsFetch(`/api/leadpay/invoices/${id}`, {
        method: "PATCH", body: JSON.stringify({ action: act }),
      });
      const { invoice: updated } = await res.json() as { invoice: LeadPayInvoice };
      setInvoice(updated);
    } finally { setActioning(false); }
  }

  if (loading) return <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-white/4 rounded-xl animate-pulse" />)}</div>;
  if (!invoice) return <div className="max-w-4xl mx-auto px-6 py-8 text-center text-white/40">Invoice not found</div>;

  const st = STATUS_CFG[invoice.status] ?? STATUS_CFG.draft;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/leadpay/invoices" className="text-white/30 hover:text-white/70 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
        </Link>
        <h1 className="text-xl font-bold text-white flex-1">{invoice.invoice_number}</h1>
        <span className={`text-xs px-2 py-1 rounded font-semibold uppercase ${st.cls}`}>{st.label}</span>
        {invoice.status === "draft" && (
          <button onClick={() => setShowSend(true)}
            className="px-3 py-1.5 text-sm bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-lg transition-colors">
            Send
          </button>
        )}
        {invoice.status === "sent" && (
          <>
            <button onClick={() => action("remind")} disabled={actioning}
              className="px-3 py-1.5 text-sm border border-white/10 text-white/60 hover:border-white/20 hover:text-white rounded-lg transition-colors">
              Send Reminder
            </button>
            <button onClick={() => action("mark_paid")} disabled={actioning}
              className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors">
              Mark Paid
            </button>
          </>
        )}
        {["draft","sent"].includes(invoice.status) && (
          <button onClick={() => action("cancel")} disabled={actioning}
            className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-lg transition-colors">
            Cancel
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice preview */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-8 shadow-xl">
          <div className="flex items-start justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">INVOICE</h2>
              <p className="text-gray-500 text-sm mt-1">{invoice.invoice_number}</p>
            </div>
            <div className="text-right text-sm text-gray-600">
              <p><span className="font-semibold text-gray-900">Issued:</span> {fmtDate(invoice.issue_date)}</p>
              <p><span className="font-semibold text-gray-900">Due:</span> {fmtDate(invoice.due_date)}</p>
            </div>
          </div>
          {invoice.client_name && (
            <div className="mb-8">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Bill To</p>
              <p className="font-semibold text-gray-900">{invoice.client_name}</p>
              {invoice.client_email && <p className="text-sm text-gray-500">{invoice.client_email}</p>}
            </div>
          )}
          {/* Line items */}
          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-gray-500 font-medium">Description</th>
                <th className="text-center py-2 text-gray-500 font-medium">Qty</th>
                <th className="text-right py-2 text-gray-500 font-medium">Unit</th>
                <th className="text-right py-2 text-gray-500 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.line_items.map((l, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-3 text-gray-800">{l.description}</td>
                  <td className="py-3 text-center text-gray-600">{l.quantity}</td>
                  <td className="py-3 text-right text-gray-600 tabular-nums">{fmt(l.unit_price_cents)}</td>
                  <td className="py-3 text-right text-gray-900 font-medium tabular-nums">{fmt(l.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-1.5 text-sm ml-auto w-56">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span className="tabular-nums">{fmt(invoice.subtotal_cents)}</span></div>
            {invoice.tax_rate > 0 && <div className="flex justify-between text-gray-600"><span>Tax ({invoice.tax_rate}%)</span><span className="tabular-nums">{fmt(invoice.tax_cents)}</span></div>}
            <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5 text-base"><span>Total</span><span className="tabular-nums">{fmt(invoice.total_cents)}</span></div>
          </div>
          {invoice.notes && <p className="text-xs text-gray-400 mt-8 border-t border-gray-100 pt-4">{invoice.notes}</p>}
          {invoice.status === "paid" && (
            <div className="mt-6 text-center">
              <span className="inline-flex items-center gap-1.5 text-emerald-600 font-bold text-sm border-2 border-emerald-400 px-4 py-1.5 rounded-full opacity-80">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                PAID
              </span>
            </div>
          )}
        </div>

        {/* Sidebar: timeline + payment info */}
        <div className="space-y-4">
          {/* Payment details (if paid) */}
          {invoice.status === "paid" && invoice.fx_rate && (
            <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-4 space-y-2 text-sm">
              <p className="text-emerald-400 font-semibold text-xs uppercase tracking-wider">Payment Received</p>
              <div className="flex justify-between text-white/70"><span>Gross</span><span>{fmt(invoice.total_cents)}</span></div>
              <div className="flex justify-between text-white/50"><span>Platform fee</span><span>-{fmt(invoice.platform_fee_cents)}</span></div>
              <div className="flex justify-between text-white font-semibold border-t border-white/10 pt-2"><span>Net credited</span><span>{fmt(invoice.net_usd_cents)}</span></div>
              <div className="flex justify-between text-white/30 text-xs"><span>FX rate</span><span>{invoice.fx_rate?.toFixed(4)}</span></div>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white/4 border border-white/8 rounded-xl p-4">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">Timeline</p>
            <div className="space-y-3">
              {events.map((ev, i) => (
                <div key={ev.id} className="flex items-start gap-3">
                  <div className="mt-0.5 w-5 h-5 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                  </div>
                  <div>
                    <p className="text-xs text-white/70">{EVENT_LABELS[ev.event] ?? ev.event}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{fmtTs(ev.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment link */}
          {invoice.status !== "paid" && invoice.status !== "cancelled" && (
            <div className="bg-white/4 border border-white/8 rounded-xl p-4">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Payment Link</p>
              <div className="flex items-center gap-2">
                <input readOnly value={typeof window !== "undefined" ? `${window.location.origin}/pay/${invoice.payment_token}` : `…/pay/${invoice.payment_token}`}
                  className="flex-1 text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/50 font-mono" />
                <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/pay/${invoice.payment_token}`)}
                  className="p-2 text-orange-400 hover:text-orange-300 border border-orange-500/20 rounded-lg transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showSend && <SendModal invoice={invoice} onClose={() => setShowSend(false)} onSent={() => { setShowSend(false); router.refresh(); }} />}
    </div>
  );
}
