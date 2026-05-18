"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import LeadDrawer from "./LeadDrawer";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Lead {
  id:                  string;
  email:               string;
  first_name:          string | null;
  last_name:           string | null;
  company:             string | null;
  title:               string | null;
  website:             string | null;
  status:              string;
  verification_status: string | null;
  verification_score:  number | null;
  verified_at:         string | null;
  first_line:          string | null;
  custom_fields:       Record<string, unknown> | null;
  created_at:          string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PER_PAGE = 50;
const MAX_GENERATE = 200;

const STATUS_FILTERS = [
  { key: "all",         label: "All" },
  { key: "deliverable", label: "Deliverable" },
  { key: "catch_all",   label: "Catch-all" },
  { key: "unknown",     label: "Unknown" },
  { key: "invalid",     label: "Invalid" },
  { key: "unverified",  label: "Unverified" },
];

export const VERIFY_BADGE: Record<string, { label: string; cls: string }> = {
  safe:              { label: "Deliverable", cls: "bg-emerald-500/15 text-emerald-400" },
  valid:             { label: "Deliverable", cls: "bg-emerald-500/15 text-emerald-400" },
  verified_external: { label: "Deliverable", cls: "bg-emerald-500/15 text-emerald-400" },
  catch_all:         { label: "Catch-all",   cls: "bg-amber-500/15 text-amber-400" },
  unknown:           { label: "Unknown",     cls: "bg-white/8 text-white/40" },
  risky:             { label: "Risky",       cls: "bg-orange-500/15 text-orange-400" },
  invalid:           { label: "Invalid",     cls: "bg-red-500/15 text-red-400" },
  dangerous:         { label: "Invalid",     cls: "bg-red-500/15 text-red-400" },
  disposable:        { label: "Disposable",  cls: "bg-red-500/15 text-red-400" },
};

// ─── Pagination helper ────────────────────────────────────────────────────────

function getPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, Math.min(current - 2, total - 5));
  const end   = Math.min(total - 1, start + 4);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ col, active, order }: { col: string; active: string; order: "asc" | "desc" }) {
  if (active !== col) return <span className="text-white/15 ml-1 text-[10px]">↕</span>;
  return <span className="text-indigo-400 ml-1 text-[10px]">{order === "asc" ? "↑" : "↓"}</span>;
}

// ─── Export helper ────────────────────────────────────────────────────────────

function leadsToCSV(leads: Lead[]): string {
  const headers = ["email","first_name","last_name","company","title","website","status","verification_status","verification_score","first_line","created_at"];
  const rows = leads.map(l =>
    headers.map(h => {
      const v = (l as unknown as Record<string, unknown>)[h];
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ListDetailClient({
  listId,
  listName,
}: {
  listId:   string;
  listName: string;
}) {
  const [leads,       setLeads]       = useState<Lead[]>([]);
  const [total,       setTotal]       = useState(0);
  const [pages,       setPages]       = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [page,        setPage]        = useState(1);
  const [search,      setSearch]      = useState("");
  const [debouncedQ,  setDebouncedQ]  = useState("");
  const [statusFilter,setStatusFilter]= useState("all");
  const [sortCol,     setSortCol]     = useState("created_at");
  const [sortOrder,   setSortOrder]   = useState<"asc" | "desc">("desc");
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [drawerLead,  setDrawerLead]  = useState<Lead | null>(null);
  const [copied,      setCopied]      = useState<string | null>(null);
  const [confirmDel,  setConfirmDel]  = useState(false);

  // First-line generation state
  const [generating,      setGenerating]      = useState(false);
  const [genError,        setGenError]        = useState<string | null>(null);
  const [firstLineModal,  setFirstLineModal]  = useState<{ id: string; first_name: string | null; email: string; first_line: string }[] | null>(null);
  const [editedLines,     setEditedLines]     = useState<Record<string, string>>({});
  const [saving,          setSaving]          = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 on filter change
  useEffect(() => { setPage(1); }, [debouncedQ, statusFilter]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({
      page:     String(page),
      per_page: String(PER_PAGE),
      search:   debouncedQ,
      status:   statusFilter,
      sort:     sortCol,
      order:    sortOrder,
    });
    const res = await fetch(`/api/outreach/lists/${listId}/leads?${sp}`);
    if (res.ok) {
      const d = await res.json();
      setLeads(d.leads ?? []);
      setTotal(d.total  ?? 0);
      setPages(d.pages  ?? 1);
    }
    setLoading(false);
  }, [listId, page, debouncedQ, statusFilter, sortCol, sortOrder]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // ── Selection ──────────────────────────────────────────────────────────────

  const allSelected  = leads.length > 0 && leads.every(l => selected.has(l.id));
  const someSelected = !allSelected && leads.some(l => selected.has(l.id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) leads.forEach(l => next.delete(l.id));
    else             leads.forEach(l => next.add(l.id));
    setSelected(next);
  };

  const toggleLead = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  // ── Sort ───────────────────────────────────────────────────────────────────

  const handleSort = (col: string) => {
    if (sortCol === col) setSortOrder(o => o === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortOrder("asc"); }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    const ids = Array.from(selected);
    await fetch(`/api/outreach/lists/${listId}/leads`, {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ids }),
    });
    setSelected(new Set());
    setConfirmDel(false);
    fetchLeads();
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = () => {
    const target = selected.size > 0 ? leads.filter(l => selected.has(l.id)) : leads;
    downloadCSV(leadsToCSV(target), `${listName.replace(/\s+/g,"_")}_leads.csv`);
  };

  // ── AI First Lines ────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    const ids = Array.from(selected).slice(0, MAX_GENERATE);
    setGenerating(true);
    setGenError(null);
    const res = await fetch(`/api/outreach/lists/${listId}/leads/first-lines`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setGenError((d as { error?: string }).error ?? "Generation failed");
      setGenerating(false);
      return;
    }
    const data = await res.json();
    setFirstLineModal(data.results);
    setEditedLines(Object.fromEntries(data.results.map((r: { id: string; first_line: string }) => [r.id, r.first_line])));
    setGenerating(false);
  };

  const handleSaveLines = async () => {
    if (!firstLineModal) return;
    setSaving(true);
    const updates = firstLineModal.map(r => ({ id: r.id, first_line: editedLines[r.id] ?? r.first_line }));
    await fetch(`/api/outreach/lists/${listId}/leads/first-lines`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ updates }),
    });
    setSaving(false);
    setFirstLineModal(null);
    // Refresh so first_line values show in table
    fetchLeads();
  };

  // ── Copy ───────────────────────────────────────────────────────────────────

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const pageNumbers = getPageNumbers(page, pages);

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0a]">

      {/* ── Header ── */}
      <div className="border-b border-white/6 px-6 py-4 flex items-center gap-3 shrink-0">
        <Link href="/leads" className="text-white/35 hover:text-white/65 text-sm transition-colors">← Leads</Link>
        <span className="text-white/15">/</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-semibold truncate">{listName}</h1>
          <p className="text-white/35 text-xs mt-0.5">{total.toLocaleString()} leads</p>
        </div>
        <button
          onClick={handleExport}
          className="px-3 py-1.5 text-white/45 hover:text-white/75 text-xs border border-white/10 hover:border-white/20 rounded-lg transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* ── Filter bar ── */}
      <div className="border-b border-white/6 px-6 py-3 flex items-center gap-3 flex-wrap shrink-0">
        {/* Search */}
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, company…"
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-8 py-1.5 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors text-xs">✕</button>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex gap-0.5 bg-white/4 rounded-lg p-0.5">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                statusFilter === f.key
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/40 hover:text-white/65"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && (
        <div className="border-b border-indigo-500/20 bg-indigo-500/8 px-6 py-2.5 flex items-center gap-3 shrink-0">
          <span className="text-indigo-300 text-sm font-medium">{selected.size.toLocaleString()} selected</span>
          <div className="flex items-center gap-2 ml-1">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-3 py-1.5 bg-violet-500/15 hover:bg-violet-500/25 disabled:opacity-50 text-violet-400 text-xs font-semibold rounded-lg border border-violet-500/20 transition-colors flex items-center gap-1.5"
            >
              <span>{generating ? "Generating…" : "✨ Generate First Lines"}</span>
              {selected.size > MAX_GENERATE && !generating && (
                <span className="text-violet-500/60 font-normal">(first {MAX_GENERATE})</span>
              )}
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/8 text-white/55 text-xs font-semibold rounded-lg border border-white/8 transition-colors"
            >
              Export
            </button>
            <button
              onClick={() => setConfirmDel(true)}
              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/18 text-red-400 text-xs font-semibold rounded-lg border border-red-500/15 transition-colors"
            >
              Remove
            </button>
          </div>
          {genError && <span className="text-red-400 text-xs ml-2">{genError}</span>}
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-white/25 hover:text-white/55 transition-colors text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 px-6 py-4 overflow-x-auto">
        <div className="border border-white/8 rounded-xl overflow-hidden min-w-[800px]">

          {/* Header row */}
          <div className="grid grid-cols-[28px_2fr_1.5fr_2fr_140px_2fr_80px] gap-x-4 px-4 py-2.5 bg-white/[0.03] border-b border-white/6">
            {/* Checkbox */}
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleAll}
                className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 accent-indigo-500 cursor-pointer"
              />
            </div>
            {[
              { col: "email",               label: "Email" },
              { col: "first_name",          label: "Name" },
              { col: "company",             label: "Company / Title" },
              { col: "verification_status", label: "Verified" },
              { col: null,                  label: "First Line" },
              { col: "created_at",          label: "Added" },
            ].map(({ col, label }) => (
              <div
                key={label}
                onClick={() => col && handleSort(col)}
                className={`text-white/35 text-xs font-semibold uppercase tracking-wider select-none flex items-center ${col ? "cursor-pointer hover:text-white/60 transition-colors" : ""}`}
              >
                {label}
                {col && <SortIcon col={col} active={sortCol} order={sortOrder} />}
              </div>
            ))}
          </div>

          {/* Body */}
          {loading ? (
            <div className="py-16 text-center text-white/25 text-sm">Loading…</div>
          ) : leads.length === 0 ? (
            <div className="py-16 text-center text-white/25 text-sm">No leads found</div>
          ) : (
            leads.map((lead, i) => {
              const name  = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
              const badge = VERIFY_BADGE[lead.verification_status ?? ""];
              const isSel = selected.has(lead.id);
              return (
                <div
                  key={lead.id}
                  onClick={() => setDrawerLead(lead)}
                  className={`grid grid-cols-[28px_2fr_1.5fr_2fr_140px_2fr_80px] gap-x-4 px-4 py-3 border-b border-white/[0.04] last:border-0 cursor-pointer group transition-colors ${
                    isSel ? "bg-indigo-500/[0.06]" : i % 2 === 1 ? "bg-white/[0.012] hover:bg-white/[0.025]" : "hover:bg-white/[0.02]"
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className="flex items-center"
                    onClick={e => { e.stopPropagation(); toggleLead(lead.id); }}
                  >
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => {}}
                      className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Email */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-white/80 text-sm truncate">{lead.email}</span>
                    <button
                      onClick={e => { e.stopPropagation(); copyText(lead.email); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-white/25 hover:text-white/60 text-[11px] shrink-0"
                      title="Copy"
                    >
                      {copied === lead.email ? "✓" : "⎘"}
                    </button>
                  </div>

                  {/* Name */}
                  <div className="text-white/55 text-sm truncate flex items-center">{name || "—"}</div>

                  {/* Company · Title */}
                  <div className="text-white/45 text-sm truncate flex items-center">
                    {[lead.company, lead.title].filter(Boolean).join(" · ") || "—"}
                  </div>

                  {/* Verified */}
                  <div className="flex items-center">
                    {badge ? (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${badge.cls}`}>
                        {badge.label}
                        {lead.verification_score != null && ` ${Math.round(lead.verification_score)}`}
                      </span>
                    ) : (
                      <span className="text-white/20 text-xs">—</span>
                    )}
                  </div>

                  {/* First Line */}
                  <div className="flex items-center min-w-0">
                    {lead.first_line ? (
                      <span className="text-white/40 text-xs truncate">{lead.first_line}</span>
                    ) : (
                      <span className="text-white/15 text-xs">—</span>
                    )}
                  </div>

                  {/* Added */}
                  <div className="text-white/30 text-xs flex items-center">
                    {new Date(lead.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Pagination ── */}
        {pages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-white/30 text-xs">
              {((page - 1) * PER_PAGE + 1).toLocaleString()}–{Math.min(page * PER_PAGE, total).toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-2.5 py-1.5 text-xs text-white/40 hover:text-white/70 disabled:opacity-25 border border-white/8 hover:border-white/15 rounded-lg transition-colors"
              >
                ← Prev
              </button>
              {pageNumbers.map((p, i) =>
                p === "…" ? (
                  <span key={`e${i}`} className="w-7 text-center text-white/25 text-xs">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`w-7 h-7 text-xs rounded-lg transition-colors ${
                      page === p ? "bg-white/10 text-white font-medium" : "text-white/35 hover:text-white/65 hover:bg-white/5"
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                disabled={page === pages}
                onClick={() => setPage(p => p + 1)}
                className="px-2.5 py-1.5 text-xs text-white/40 hover:text-white/70 disabled:opacity-25 border border-white/8 hover:border-white/15 rounded-lg transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Lead Drawer ── */}
      {drawerLead && (
        <LeadDrawer
          lead={drawerLead}
          listId={listId}
          onClose={() => setDrawerLead(null)}
          onDelete={() => { setDrawerLead(null); fetchLeads(); }}
          onUpdate={updated => {
            setLeads(ls => ls.map(l => l.id === updated.id ? updated : l));
            setDrawerLead(updated);
          }}
        />
      )}

      {/* ── Delete confirmation modal ── */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-white font-semibold">Remove {selected.size.toLocaleString()} lead{selected.size !== 1 ? "s" : ""}?</h2>
            <p className="text-white/45 text-sm">This permanently removes them from this list. It cannot be undone.</p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setConfirmDel(false)} className="flex-1 px-4 py-2 text-white/50 hover:text-white/80 text-sm border border-white/10 hover:border-white/20 rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} className="flex-1 px-4 py-2 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-sm font-semibold rounded-xl border border-red-500/20 transition-colors">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── First Line Preview Modal ── */}
      {firstLineModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl w-full max-w-2xl my-8 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/8 shrink-0">
              <div>
                <h2 className="text-white font-semibold">AI First Lines</h2>
                <p className="text-white/40 text-xs mt-0.5">
                  {firstLineModal.length} generated — review and edit before saving
                </p>
              </div>
              <button onClick={() => setFirstLineModal(null)} className="text-white/30 hover:text-white/65 transition-colors">✕</button>
            </div>

            {/* List */}
            <div className="overflow-y-auto max-h-[60vh] divide-y divide-white/[0.05]">
              {firstLineModal.map(r => (
                <div key={r.id} className="p-4 space-y-1.5">
                  <p className="text-white/40 text-xs truncate">
                    {r.first_name || r.email}
                  </p>
                  <textarea
                    value={editedLines[r.id] ?? r.first_line}
                    onChange={e => setEditedLines(prev => ({ ...prev, [r.id]: e.target.value }))}
                    rows={2}
                    className="w-full bg-white/[0.04] border border-white/8 hover:border-white/15 focus:border-white/20 rounded-xl px-3 py-2 text-sm text-white/80 focus:outline-none resize-none transition-colors"
                  />
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-white/8 shrink-0">
              <button
                onClick={() => setFirstLineModal(null)}
                className="px-4 py-2 text-white/40 hover:text-white/70 text-sm transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleSaveLines}
                disabled={saving}
                className="px-4 py-2 bg-violet-500/20 hover:bg-violet-500/30 disabled:opacity-50 text-violet-300 text-sm font-semibold rounded-xl border border-violet-500/25 transition-colors"
              >
                {saving ? "Saving…" : `Save ${firstLineModal.length} line${firstLineModal.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
