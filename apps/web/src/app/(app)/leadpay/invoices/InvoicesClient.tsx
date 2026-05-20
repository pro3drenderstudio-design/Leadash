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

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Draft",     cls: "bg-white/8 text-white/40" },
  sent:      { label: "Sent",      cls: "bg-blue-500/15 text-blue-400" },
  viewed:    { label: "Viewed",    cls: "bg-violet-500/15 text-violet-400" },
  paid:      { label: "Paid",      cls: "bg-emerald-500/15 text-emerald-400" },
  overdue:   { label: "Overdue",   cls: "bg-red-500/15 text-red-400" },
  cancelled: { label: "Cancelled", cls: "bg-white/8 text-white/30" },
};

const TABS = ["all","draft","sent","paid","overdue"] as const;

// ── Invoice modal ─────────────────────────────────────────────────────────────
interface InvoiceModalProps {
  invoice?: LeadPayInvoice | null;
  clients: LeadPayClient[];
  onClose: () => void;
  onSaved: (inv: LeadPayInvoice) => void;
}

function InvoiceModal({ invoice, clients, onClose, onSaved }: InvoiceModalProps) {
  const isEdit = !!invoice;
  const [clientId, setClientId]     = useState(invoice?.client_id ?? "");
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111] border border-white/10 rounded-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h2 className="text-base font-semibold text-white">{isEdit ? "Edit Invoice" : "New Invoice"}</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/70">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-5">
          {/* Client */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Client</label>
              <select value={clientId} onChange={e => onClientSelect(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50">
                <option value="">Select client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name ?? ""} {c.company ? `(${c.company})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Client email</label>
              <input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@company.com"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
            </div>
          </div>
          {/* Invoice details */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Invoice #</label>
              <input value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} placeholder="INV-001"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Issue date</label>
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
            </div>
          </div>
          {/* Line items */}
          <div>
            <label className="block text-xs text-white/40 mb-2">Line items</label>
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input value={line.description} onChange={e => updateLine(i, "description", e.target.value)} placeholder="Description"
                    className="col-span-5 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
                  <input type="number" value={line.quantity} onChange={e => updateLine(i, "quantity", Number(e.target.value))} min={1}
                    className="col-span-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-orange-500/50" />
                  <input type="number" value={line.unit_price_cents / 100} onChange={e => updateLine(i, "unit_price_cents", Math.round(Number(e.target.value) * 100))} placeholder="0.00" step="0.01" min={0}
                    className="col-span-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
                  <div className="col-span-1 text-xs text-white/40 text-right tabular-nums">{fmt(line.total_cents)}</div>
                  <button onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))} className="col-span-1 text-white/20 hover:text-red-400 transition-colors text-center">
                    <svg className="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setLines(prev => [...prev, { description: "", quantity: 1, unit_price_cents: 0, total_cents: 0 }])}
              className="mt-2 text-xs text-orange-400 hover:text-orange-300 transition-colors">+ Add line</button>
          </div>
          {/* Totals */}
          <div className="space-y-2 border-t border-white/8 pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/40">Subtotal</span>
              <span className="text-white/70 tabular-nums">{fmt(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-white/40">Tax</span>
                <input type="number" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} min={0} max={100} step={0.5}
                  className="w-16 bg-white/5 border border-white/10 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-orange-500/50 text-center" />
                <span className="text-white/30 text-xs">%</span>
              </div>
              <span className="text-white/70 tabular-nums">{fmt(taxCents)}</span>
            </div>
            <div className="flex items-center justify-between text-sm font-bold border-t border-white/8 pt-2">
              <span className="text-white">Total (USD)</span>
              <span className="text-white text-base tabular-nums">{fmt(total)}</span>
            </div>
          </div>
          {/* Notes */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Notes <span className="text-white/20">(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Payment terms, thank you note…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 resize-none" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/8">
          <button onClick={() => save("draft")} disabled={saving}
            className="px-4 py-2 text-sm border border-white/10 text-white/60 hover:text-white hover:border-white/20 rounded-lg transition-colors disabled:opacity-40">
            Save Draft
          </button>
          <button onClick={() => save("sent")} disabled={saving || !clientEmail}
            className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-lg transition-colors disabled:opacity-40">
            {saving ? "Saving…" : "Send Invoice"}
          </button>
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
    if (!confirm("Delete this invoice?")) return;
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

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Invoices</h1>
          <p className="text-white/40 text-sm mt-0.5">{invoices.length} total</p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          New Invoice
        </button>
      </div>

      {/* Tabs + search */}
      <div className="flex items-center gap-4 mb-5">
        <div className="flex items-center gap-1 p-1 bg-white/5 rounded-lg">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded text-xs font-medium capitalize transition-all ${tab === t ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices…"
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/4 border border-white/8 rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-5 py-2.5 border-b border-white/5 text-[10px] text-white/30 uppercase tracking-wider font-semibold">
          <div className="col-span-3">Invoice</div>
          <div className="col-span-3">Client</div>
          <div className="col-span-2">Amount</div>
          <div className="col-span-2">Due</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1" />
        </div>
        {loading ? (
          <div className="space-y-px">
            {[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-white/2 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-white/30 text-sm">
            {tab === "all" ? "No invoices yet. Create your first one." : `No ${tab} invoices.`}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map(inv => {
              const st = STATUS_CFG[inv.status] ?? STATUS_CFG.draft;
              return (
                <div key={inv.id} className="grid grid-cols-12 gap-4 px-5 py-3.5 hover:bg-white/2 transition-colors items-center group">
                  <div className="col-span-3">
                    <Link href={`/leadpay/invoices/${inv.id}`} className="text-sm text-white hover:text-orange-300 transition-colors font-medium">
                      {inv.invoice_number}
                    </Link>
                    <p className="text-xs text-white/30 mt-0.5">{fmtDate(inv.issue_date)}</p>
                  </div>
                  <div className="col-span-3">
                    <p className="text-sm text-white/70 truncate">{inv.client_name ?? inv.client_email ?? "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-semibold text-white tabular-nums">{fmt(inv.total_cents)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className={`text-sm ${inv.status === "overdue" ? "text-red-400" : "text-white/50"}`}>{fmtDate(inv.due_date)}</p>
                  </div>
                  <div className="col-span-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditing(inv); setShowModal(true); }} className="p-1.5 text-white/30 hover:text-white/70 rounded transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                    </button>
                    <button onClick={() => deleteInvoice(inv.id)} className="p-1.5 text-white/30 hover:text-red-400 rounded transition-colors">
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
