"use client";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { wsGet, wsFetch, wsDelete } from "@/lib/workspace/client";
import type { LeadPayInvoice, LeadPayClient, InvoiceLineItem } from "@/types/leadpay";

// ── helpers ──────────────────────────────────────────────────────────────────
function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_CFG: Record<string, { label: string; dot: string; text: string }> = {
  draft:     { label: "Draft",     dot: "bg-white/20",    text: "text-white/40" },
  sent:      { label: "Sent",      dot: "bg-blue-400",    text: "text-blue-400" },
  viewed:    { label: "Viewed",    dot: "bg-violet-400",  text: "text-violet-400" },
  paid:      { label: "Paid",      dot: "bg-emerald-400", text: "text-emerald-400" },
  overdue:   { label: "Overdue",   dot: "bg-red-400",     text: "text-red-400" },
  cancelled: { label: "Cancelled", dot: "bg-white/20",    text: "text-white/30" },
};

const TABS = ["all","draft","sent","paid","overdue"] as const;

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.draft;
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span className={`text-[11px] font-medium ${cfg.text}`}>{cfg.label}</span>
    </span>
  );
}

// ── Invoice modal ─────────────────────────────────────────────────────────────
interface InvoiceModalProps {
  invoice?: LeadPayInvoice | null;
  clients: LeadPayClient[];
  onClose: () => void;
  onSaved: (inv: LeadPayInvoice) => void;
}

function InvoiceModal({ invoice, clients, onClose, onSaved }: InvoiceModalProps) {
  const isEdit = !!invoice;
  const [clientId, setClientId]       = useState(invoice?.client_id ?? "");
  const [clientEmail, setClientEmail] = useState(invoice?.client_email ?? "");
  const [clientName, setClientName]   = useState(invoice?.client_name ?? "");
  const [invoiceNum, setInvoiceNum]   = useState(invoice?.invoice_number ?? "");
  const [issueDate, setIssueDate]     = useState(invoice?.issue_date ?? new Date().toISOString().slice(0,10));
  const [dueDate, setDueDate]         = useState(invoice?.due_date ?? "");
  const [taxRate, setTaxRate]         = useState(invoice?.tax_rate ?? 0);
  const [notes, setNotes]             = useState(invoice?.notes ?? "");
  const [lines, setLines]             = useState<InvoiceLineItem[]>(
    invoice?.line_items?.length ? invoice.line_items : [{ description: "", quantity: 1, unit_price_cents: 0, total_cents: 0 }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const subtotal = lines.reduce((s, l) => s + l.total_cents, 0);
  const taxCents = Math.round(subtotal * taxRate / 100);
  const total    = subtotal + taxCents;

  function updateLine(i: number, field: keyof InvoiceLineItem, val: string | number) {
    setLines(prev => prev.map((l, idx) => {
      if (idx !== i) return l;
      const updated = { ...l, [field]: val };
      updated.total_cents = Math.round(updated.quantity * updated.unit_price_cents);
      return updated;
    }));
  }

  function onClientSelect(id: string) {
    setClientId(id);
    const c = clients.find(c => c.id === id);
    if (c) { setClientEmail(c.email); setClientName(`${c.first_name} ${c.last_name ?? ""}`.trim()); }
  }

  async function save(status: "draft" | "sent") {
    setSaving(true); setError(null);
    try {
      const body = { client_id: clientId || null, client_email: clientEmail, client_name: clientName, invoice_number: invoiceNum, issue_date: issueDate, due_date: dueDate || null, line_items: lines, tax_rate: taxRate, notes: notes || null, status };
      const res = isEdit
        ? await wsFetch(`/api/leadpay/invoices/${invoice!.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await wsFetch("/api/leadpay/invoices", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json() as { error: string }; setError(d.error); return; }
      const { invoice: saved } = await res.json() as { invoice: LeadPayInvoice };
      onSaved(saved);
    } catch (e) { setError(String(e)); } finally { setSaving(false); }
  }

  const INPUT = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-orange-500/40 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0e0e12] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-8 shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-semibold text-white">{isEdit ? "Edit Invoice" : "New Invoice"}</h2>
            <p className="text-xs text-white/35 mt-0.5">{isEdit ? "Update invoice details" : "Fill in the details to create a new invoice"}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Client section */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/35 font-semibold mb-3">Client</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Select client</label>
                <select value={clientId} onChange={e => onClientSelect(e.target.value)} className={INPUT + " bg-white/[0.04]"} style={{ colorScheme: "dark" }}>
                  <option value="">Choose a client…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name ?? ""} {c.company ? `(${c.company})` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Client email</label>
                <input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@company.com" className={INPUT} />
              </div>
            </div>
          </div>

          {/* Invoice details */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/35 font-semibold mb-3">Invoice Details</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Invoice #</label>
                <input value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} placeholder="INV-001" className={INPUT} />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Issue date</label>
                <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={INPUT} style={{ colorScheme: "dark" }} />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Due date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={INPUT} style={{ colorScheme: "dark" }} />
              </div>
            </div>
          </div>

          {/* Line items */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/35 font-semibold mb-3">Line Items</p>
            <div className="rounded-xl border border-white/[0.07] overflow-hidden">
              {/* Column headers */}
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-white/[0.02] border-b border-white/[0.06]">
                <div className="col-span-5 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Description</div>
                <div className="col-span-2 text-[10px] uppercase tracking-widest text-white/30 font-semibold text-center">Qty</div>
                <div className="col-span-3 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Unit Price</div>
                <div className="col-span-1 text-[10px] uppercase tracking-widest text-white/30 font-semibold text-right">Total</div>
                <div className="col-span-1" />
              </div>
              <div className="divide-y divide-white/[0.05]">
                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center px-3 py-2.5">
                    <input value={line.description} onChange={e => updateLine(i, "description", e.target.value)} placeholder="Service or product…"
                      className="col-span-5 bg-transparent border-0 text-sm text-white placeholder:text-white/20 focus:outline-none" />
                    <input type="number" value={line.quantity} onChange={e => updateLine(i, "quantity", Number(e.target.value))} min={1}
                      className="col-span-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-orange-500/40 tabular-nums" />
                    <div className="col-span-3 relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 text-xs">$</span>
                      <input type="number" value={line.unit_price_cents / 100} onChange={e => updateLine(i, "unit_price_cents", Math.round(Number(e.target.value) * 100))} placeholder="0.00" step="0.01" min={0}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-6 pr-2 py-1.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/40 tabular-nums" />
                    </div>
                    <div className="col-span-1 text-xs text-white/50 text-right tabular-nums font-medium">{fmt(line.total_cents)}</div>
                    <button onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))} className="col-span-1 flex justify-center text-white/15 hover:text-red-400 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="px-3 py-2.5 border-t border-white/[0.05]">
                <button onClick={() => setLines(prev => [...prev, { description: "", quantity: 1, unit_price_cents: 0, total_cents: 0 }])}
                  className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-colors font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Add line item
                </button>
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] px-4 py-4 space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/40">Subtotal</span>
              <span className="text-white/70 tabular-nums font-medium">{fmt(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-white/40">Tax rate</span>
                <div className="relative">
                  <input type="number" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} min={0} max={100} step={0.5}
                    className="w-16 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-orange-500/40 text-center tabular-nums" />
                </div>
                <span className="text-white/30 text-xs">%</span>
              </div>
              <span className="text-white/70 tabular-nums font-medium">{fmt(taxCents)}</span>
            </div>
            <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.08]">
              <span className="text-sm font-bold text-white">Total (USD)</span>
              <span className="text-lg font-bold text-white tabular-nums">{fmt(total)}</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Notes <span className="text-white/20">(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Payment terms, thank you note, wire instructions…"
              className={INPUT + " resize-none"} />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06] bg-white/[0.01]">
          <button onClick={onClose} className="text-sm text-white/35 hover:text-white/60 transition-colors">Cancel</button>
          <div className="flex items-center gap-3">
            <button onClick={() => save("draft")} disabled={saving}
              className="px-4 py-2 text-sm border border-white/[0.12] text-white/60 hover:text-white hover:border-white/20 rounded-xl transition-all disabled:opacity-40">
              Save Draft
            </button>
            <button onClick={() => save("sent")} disabled={saving || !clientEmail}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-xl transition-colors disabled:opacity-40 shadow-lg shadow-orange-500/20">
              {saving ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Saving…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                  Send Invoice
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function InvoicesClient() {
  const router      = useRouter();
  const params      = useSearchParams();
  const [tab, setTab]           = useState<typeof TABS[number]>("all");
  const [invoices, setInvoices] = useState<LeadPayInvoice[]>([]);
  const [clients, setClients]   = useState<LeadPayClient[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal]   = useState(params.get("new") === "1");
  const [editing, setEditing]       = useState<LeadPayInvoice | null>(null);
  const [search, setSearch]         = useState("");

  const load = useCallback(async () => {
    const [invRes, clRes] = await Promise.all([
      wsGet<{ invoices: LeadPayInvoice[]; total: number }>("/api/leadpay/invoices"),
      wsGet<{ clients: LeadPayClient[] }>("/api/leadpay/clients"),
    ]).catch(() => [{ invoices: [], total: 0 }, { clients: [] }]);
    setInvoices((invRes as { invoices: LeadPayInvoice[] }).invoices ?? []);
    setClients((clRes as { clients: LeadPayClient[] }).clients ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = invoices.filter(inv => {
    if (tab !== "all" && inv.status !== tab) return false;
    if (search && !inv.invoice_number.toLowerCase().includes(search.toLowerCase()) &&
        !(inv.client_name?.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  async function deleteInvoice(id: string) {
    if (!confirm("Delete this invoice? This cannot be undone.")) return;
    await wsDelete(`/api/leadpay/invoices/${id}`);
    setInvoices(prev => prev.filter(i => i.id !== id));
  }

  function onSaved(inv: LeadPayInvoice) {
    setInvoices(prev => {
      const exists = prev.find(i => i.id === inv.id);
      return exists ? prev.map(i => i.id === inv.id ? inv : i) : [inv, ...prev];
    });
    setShowModal(false);
    setEditing(null);
  }

  // Tab counts
  const tabCounts = TABS.reduce((acc, t) => {
    acc[t] = t === "all" ? invoices.length : invoices.filter(i => i.status === t).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Invoices</h1>
          <p className="text-white/40 text-sm mt-1">Send professional invoices to your clients</p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          New Invoice
        </button>
      </div>

      {/* Tabs + search */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-0.5 p-1 bg-white/[0.04] border border-white/[0.06] rounded-xl">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                tab === t
                  ? "bg-white/[0.1] text-white shadow-sm"
                  : "text-white/40 hover:text-white/60"
              }`}>
              {t}
              {tabCounts[t] > 0 && (
                <span className={`text-[10px] tabular-nums ${tab === t ? "text-white/60" : "text-white/25"}`}>
                  {tabCounts[t]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative max-w-xs w-full">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices…"
            className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-orange-500/40 transition-colors" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/[0.05] bg-white/[0.02]">
          <div className="col-span-3 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Invoice</div>
          <div className="col-span-3 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Client</div>
          <div className="col-span-2 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Amount</div>
          <div className="col-span-2 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Due Date</div>
          <div className="col-span-1 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Status</div>
          <div className="col-span-1" />
        </div>

        {loading ? (
          <div className="divide-y divide-white/[0.04]">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="grid grid-cols-12 gap-4 px-5 py-4 items-center">
                <div className="col-span-3 space-y-1.5">
                  <div className="h-3.5 bg-white/[0.06] rounded animate-pulse w-24" />
                  <div className="h-2.5 bg-white/[0.04] rounded animate-pulse w-16" />
                </div>
                <div className="col-span-3"><div className="h-3.5 bg-white/[0.05] rounded animate-pulse w-32" /></div>
                <div className="col-span-2"><div className="h-3.5 bg-white/[0.05] rounded animate-pulse w-16" /></div>
                <div className="col-span-2"><div className="h-3.5 bg-white/[0.04] rounded animate-pulse w-20" /></div>
                <div className="col-span-1"><div className="h-3.5 bg-white/[0.04] rounded animate-pulse w-12" /></div>
                <div className="col-span-1" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
            </div>
            <p className="text-sm font-medium text-white/40">
              {tab === "all" ? "No invoices yet" : `No ${tab} invoices`}
            </p>
            <p className="text-xs text-white/25 mt-1">
              {tab === "all" ? "Create your first invoice to get started" : `Invoices with ${tab} status will appear here`}
            </p>
            {tab === "all" && (
              <button onClick={() => { setEditing(null); setShowModal(true); }}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-orange-500/20">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                New Invoice
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {filtered.map(inv => {
              const isPaid = inv.status === "paid";
              return (
                <div key={inv.id} className="grid grid-cols-12 gap-4 px-5 py-4 hover:bg-white/[0.025] transition-colors items-center group cursor-default">
                  {/* Invoice number + date */}
                  <div className="col-span-3">
                    <Link href={`/leadpay/invoices/${inv.id}`}
                      className="text-sm font-semibold text-white hover:text-orange-300 transition-colors">
                      {inv.invoice_number}
                    </Link>
                    <p className="text-xs text-white/30 mt-0.5">{fmtDate(inv.issue_date)}</p>
                  </div>

                  {/* Client */}
                  <div className="col-span-3">
                    <p className="text-sm text-white/70 truncate">{inv.client_name ?? inv.client_email ?? "—"}</p>
                    {inv.client_name && inv.client_email && (
                      <p className="text-xs text-white/25 truncate mt-0.5">{inv.client_email}</p>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="col-span-2">
                    <p className={`text-sm font-bold tabular-nums ${isPaid ? "text-emerald-400" : "text-white"}`}>
                      {fmt(inv.total_cents)}
                    </p>
                  </div>

                  {/* Due date */}
                  <div className="col-span-2">
                    <p className={`text-sm tabular-nums ${inv.status === "overdue" ? "text-red-400" : "text-white/45"}`}>
                      {fmtDate(inv.due_date)}
                    </p>
                  </div>

                  {/* Status */}
                  <div className="col-span-1">
                    <StatusDot status={inv.status} />
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditing(inv); setShowModal(true); }}
                      className="w-7 h-7 flex items-center justify-center text-white/25 hover:text-white/70 hover:bg-white/[0.07] rounded-lg transition-all"
                      title="Edit">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                    </button>
                    <button onClick={() => deleteInvoice(inv.id)}
                      className="w-7 h-7 flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                      title="Delete">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(showModal || editing) && (
        <InvoiceModal
          invoice={editing}
          clients={clients}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
