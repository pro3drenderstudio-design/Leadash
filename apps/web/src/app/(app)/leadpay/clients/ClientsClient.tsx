"use client";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { wsGet, wsFetch, wsDelete } from "@/lib/workspace/client";
import type { LeadPayClient } from "@/types/leadpay";

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(cents / 100);
}

const GRAD = [
  "from-blue-500 to-indigo-600",
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-red-600",
  "from-pink-500 to-rose-600",
  "from-sky-500 to-blue-600",
  "from-amber-500 to-orange-600",
];

function Avatar({ client, idx }: { client: LeadPayClient; idx: number }) {
  const initials = `${client.first_name[0] ?? ""}${client.last_name?.[0] ?? ""}`.toUpperCase();
  return (
    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${GRAD[idx % GRAD.length]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-lg`}>
      {initials}
    </div>
  );
}

// ── Client modal ──────────────────────────────────────────────────────────────
function ClientModal({ client, onClose, onSaved }: {
  client?: LeadPayClient | null;
  onClose: () => void;
  onSaved: (c: LeadPayClient) => void;
}) {
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

  const INPUT = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-orange-500/40 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0e0e12] border border-white/[0.08] rounded-2xl w-full max-w-md shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-semibold text-white">{isEdit ? "Edit Client" : "Add Client"}</h2>
            <p className="text-xs text-white/35 mt-0.5">{isEdit ? "Update client information" : "Add a new client to your roster"}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1.5">First name</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John" className={INPUT} />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Last name <span className="text-white/20">(opt)</span></label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" className={INPUT} />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Email address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@company.com" className={INPUT} />
          </div>

          {/* Company + Country */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Company <span className="text-white/20">(opt)</span></label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Inc." className={INPUT} />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Country <span className="text-white/20">(opt)</span></label>
              <input value={country} onChange={e => setCountry(e.target.value)} placeholder="United States" className={INPUT} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Notes <span className="text-white/20">(opt)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any notes about this client…"
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
          <button onClick={save} disabled={saving || !firstName || !email}
            className="flex items-center gap-2 px-5 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-orange-500/20">
            {saving ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Saving…
              </>
            ) : isEdit ? "Save Changes" : "Add Client"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function ClientsClient() {
  const params = useSearchParams();
  const [clients, setClients]     = useState<LeadPayClient[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [showModal, setShowModal] = useState(params.get("new") === "1");
  const [editing, setEditing]     = useState<LeadPayClient | null>(null);

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
    setShowModal(false);
    setEditing(null);
  }

  const filtered = clients.filter(c =>
    !search ||
    `${c.first_name} ${c.last_name ?? ""} ${c.company ?? ""} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Clients</h1>
          <p className="text-white/40 text-sm mt-1">Manage your client relationships and billing history</p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add Client
        </button>
      </div>

      {/* Search + stats row */}
      <div className="flex items-center gap-4 mb-5">
        <div className="relative max-w-xs w-full">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
            className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-orange-500/40 transition-colors" />
        </div>
        {!loading && (
          <p className="text-xs text-white/30">
            {filtered.length} {filtered.length === 1 ? "client" : "clients"}
            {search && ` matching "${search}"`}
          </p>
        )}
      </div>

      {/* Table */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/[0.05] bg-white/[0.02]">
          <div className="col-span-4 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Client</div>
          <div className="col-span-3 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Email</div>
          <div className="col-span-2 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Country</div>
          <div className="col-span-2 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Total Billed</div>
          <div className="col-span-1" />
        </div>

        {loading ? (
          <div className="divide-y divide-white/[0.04]">
            {[1,2,3,4].map(i => (
              <div key={i} className="grid grid-cols-12 gap-4 px-5 py-4 items-center">
                <div className="col-span-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.06] animate-pulse flex-shrink-0" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 bg-white/[0.06] rounded animate-pulse w-24" />
                    <div className="h-2.5 bg-white/[0.04] rounded animate-pulse w-16" />
                  </div>
                </div>
                <div className="col-span-3"><div className="h-3.5 bg-white/[0.05] rounded animate-pulse w-32" /></div>
                <div className="col-span-2"><div className="h-3.5 bg-white/[0.04] rounded animate-pulse w-16" /></div>
                <div className="col-span-2"><div className="h-3.5 bg-white/[0.05] rounded animate-pulse w-16" /></div>
                <div className="col-span-1" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
            </div>
            <p className="text-sm font-medium text-white/40">
              {clients.length === 0 ? "No clients yet" : "No clients match your search"}
            </p>
            <p className="text-xs text-white/25 mt-1">
              {clients.length === 0 ? "Add your first client to start sending invoices" : "Try a different search term"}
            </p>
            {clients.length === 0 && (
              <button onClick={() => { setEditing(null); setShowModal(true); }}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-orange-500/20">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Add Client
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {filtered.map((c, idx) => (
              <div key={c.id} className="grid grid-cols-12 gap-4 px-5 py-4 hover:bg-white/[0.025] transition-colors items-center group">
                {/* Avatar + name */}
                <div className="col-span-4 flex items-center gap-3">
                  <Avatar client={c} idx={idx} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{c.first_name} {c.last_name ?? ""}</p>
                    {c.company && <p className="text-xs text-white/30 truncate mt-0.5">{c.company}</p>}
                  </div>
                </div>

                {/* Email */}
                <div className="col-span-3">
                  <p className="text-sm text-white/55 truncate">{c.email}</p>
                </div>

                {/* Country */}
                <div className="col-span-2">
                  <p className="text-sm text-white/40">{c.country ?? "—"}</p>
                </div>

                {/* Total billed */}
                <div className="col-span-2">
                  <p className={`text-sm tabular-nums font-semibold ${c.total_billed_cents ? "text-white/80" : "text-white/25"}`}>
                    {c.total_billed_cents != null && c.total_billed_cents > 0 ? fmt(c.total_billed_cents) : "—"}
                  </p>
                </div>

                {/* Actions */}
                <div className="col-span-1 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditing(c); setShowModal(true); }}
                    className="w-7 h-7 flex items-center justify-center text-white/25 hover:text-white/70 hover:bg-white/[0.07] rounded-lg transition-all"
                    title="Edit client">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(showModal || editing) && (
        <ClientModal
          client={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
