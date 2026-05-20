"use client";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { wsGet, wsFetch, wsDelete } from "@/lib/workspace/client";
import type { LeadPayClient } from "@/types/leadpay";

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(cents / 100);
}

// ── Client modal ──────────────────────────────────────────────────────────────
function ClientModal({ client, onClose, onSaved }: { client?: LeadPayClient | null; onClose: () => void; onSaved: (c: LeadPayClient) => void }) {
  const isEdit = !!client;
  const [firstName, setFirstName] = useState(client?.first_name ?? "");
  const [lastName, setLastName]   = useState(client?.last_name ?? "");
  const [company, setCompany]     = useState(client?.company ?? "");
  const [email, setEmail]         = useState(client?.email ?? "");
  const [country, setCountry]     = useState(client?.country ?? "");
  const [notes, setNotes]         = useState(client?.notes ?? "");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    try {
      const body = { first_name: firstName, last_name: lastName || null, company: company || null, email, country: country || null, notes: notes || null };
      const res = isEdit
        ? await wsFetch(`/api/leadpay/clients/${client!.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await wsFetch("/api/leadpay/clients", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json() as { error: string }; setError(d.error); return; }
      const { client: saved } = await res.json() as { client: LeadPayClient };
      onSaved(saved);
    } catch (e) { setError(String(e)); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111] border border-white/10 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h2 className="text-base font-semibold text-white">{isEdit ? "Edit Client" : "Add Client"}</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/70">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1.5">First name</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Last name</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@company.com"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Company <span className="text-white/20">(optional)</span></label>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Inc."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Country <span className="text-white/20">(optional)</span></label>
            <input value={country} onChange={e => setCountry(e.target.value)} placeholder="United States"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Notes <span className="text-white/20">(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any notes about this client…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 resize-none" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/8">
          <button onClick={onClose} className="px-4 py-2 text-sm text-white/40 hover:text-white/70">Cancel</button>
          <button onClick={save} disabled={saving || !firstName || !email}
            className="px-5 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors">
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Client"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function ClientsClient() {
  const params = useSearchParams();
  const [clients, setClients]   = useState<LeadPayClient[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [showModal, setShowModal] = useState(params.get("new") === "1");
  const [editing, setEditing]   = useState<LeadPayClient | null>(null);

  const load = useCallback(async () => {
    const data = await wsGet<{ clients: LeadPayClient[] }>("/api/leadpay/clients").catch(() => ({ clients: [] }));
    setClients(data.clients ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function onSaved(c: LeadPayClient) {
    setClients(prev => {
      const exists = prev.find(x => x.id === c.id);
      return exists ? prev.map(x => x.id === c.id ? c : x) : [c, ...prev];
    });
    setShowModal(false); setEditing(null);
  }

  const filtered = clients.filter(c =>
    !search ||
    `${c.first_name} ${c.last_name ?? ""} ${c.company ?? ""} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  function initials(c: LeadPayClient) {
    return `${c.first_name[0] ?? ""}${c.last_name?.[0] ?? ""}`.toUpperCase();
  }
  const GRAD = ["from-blue-400 to-indigo-500","from-violet-400 to-purple-500","from-emerald-400 to-teal-500","from-orange-400 to-red-500","from-pink-400 to-rose-500"];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Clients</h1>
          <p className="text-white/40 text-sm mt-0.5">{clients.length} total</p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add Client
        </button>
      </div>

      <div className="relative mb-5 max-w-xs">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
          className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20" />
      </div>

      <div className="bg-white/4 border border-white/8 rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-5 py-2.5 border-b border-white/5 text-[10px] text-white/30 uppercase tracking-wider font-semibold">
          <div className="col-span-4">Client</div>
          <div className="col-span-3">Email</div>
          <div className="col-span-2">Country</div>
          <div className="col-span-2">Total Billed</div>
          <div className="col-span-1" />
        </div>
        {loading ? (
          <div className="space-y-px">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-white/2 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-white/30 text-sm">
            {clients.length === 0 ? "No clients yet. Add your first one." : "No clients match your search."}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((c, idx) => (
              <div key={c.id} className="grid grid-cols-12 gap-4 px-5 py-3.5 hover:bg-white/2 transition-colors items-center group">
                <div className="col-span-4 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${GRAD[idx % GRAD.length]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                    {initials(c)}
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">{c.first_name} {c.last_name ?? ""}</p>
                    {c.company && <p className="text-xs text-white/30">{c.company}</p>}
                  </div>
                </div>
                <div className="col-span-3 text-sm text-white/60 truncate">{c.email}</div>
                <div className="col-span-2 text-sm text-white/50">{c.country ?? "—"}</div>
                <div className="col-span-2 text-sm font-semibold text-white/70 tabular-nums">
                  {c.total_billed_cents != null ? fmt(c.total_billed_cents) : "—"}
                </div>
                <div className="col-span-1 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditing(c); setShowModal(true); }} className="p-1.5 text-white/30 hover:text-white/70 rounded transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(showModal || editing) && (
        <ClientModal client={editing} onClose={() => { setShowModal(false); setEditing(null); }} onSaved={onSaved} />
      )}
    </div>
  );
}
