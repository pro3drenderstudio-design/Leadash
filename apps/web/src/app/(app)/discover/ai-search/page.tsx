"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { wsFetch } from "@/lib/workspace/client";
import { AI_PROSPECT_MODELS } from "@/lib/discover/ai-prospects-prompt";
import type { AiProspectModel } from "@/lib/discover/ai-prospects-prompt";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProspectResult {
  id:                  string;
  person_name:         string | null;
  title:               string | null;
  company_name:        string | null;
  domain:              string | null;
  linkedin_url:        string | null;
  ai_email:            string | null;
  ai_email_confidence: number | null;
  discover_email:      string | null;
  best_email:          string | null;
  best_email_source:   "discover" | "ai" | null;
  enrichment_status:   "pending" | "done" | "failed";
  verification_status: string | null;
  exported_at:         string | null;
}

interface ProspectSearch {
  id:              string;
  model:           AiProspectModel;
  status:          "pending" | "generating" | "enriching" | "done" | "failed";
  error_message:   string | null;
  total_generated: number;
  total_enriched:  number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_PRESETS = ["CEO", "CFO", "COO", "CTO", "VP Sales", "VP Marketing", "Managing Director", "Founder", "GM"];

const SIZE_OPTIONS = [
  { value: "any",      label: "Any size" },
  { value: "1-10",     label: "1–10" },
  { value: "11-50",    label: "11–50" },
  { value: "51-200",   label: "51–200" },
  { value: "201-500",  label: "201–500" },
  { value: "501-1000", label: "501–1,000" },
  { value: "1000+",    label: "1,000+" },
];

const COUNT_PRESETS = [25, 50, 100, 250, 500, 1000];

const MODEL_LABELS: Record<AiProspectModel, { label: string; bestFor: string; credits: number }> = {
  "claude-haiku-4-5-20251001": { label: "Fast",         bestFor: "Major industries, well-known companies", credits: 3 },
  "claude-sonnet-4-6":         { label: "Balanced",     bestFor: "Regional markets, mid-size niches",      credits: 5 },
  "claude-opus-4-8":           { label: "Deep Recall",  bestFor: "Obscure niches, hyper-local markets",    credits: 9 },
};

const VERIFICATION_BADGE: Record<string, { label: string; className: string }> = {
  valid:     { label: "Valid",     className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  safe:      { label: "Safe",      className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  catch_all: { label: "Catch-all", className: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
  risky:     { label: "Risky",     className: "bg-orange-500/15 text-orange-400 border-orange-500/25" },
  invalid:   { label: "Invalid",   className: "bg-red-500/15 text-red-400 border-red-500/25" },
  unknown:   { label: "Unknown",   className: "bg-white/8 text-white/40 border-white/10" },
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function Spinner({ sm }: { sm?: boolean }) {
  return (
    <svg className={`animate-spin text-orange-500 ${sm ? "w-3.5 h-3.5" : "w-4 h-4"}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );
}

// ─── Export modal ─────────────────────────────────────────────────────────────

function ExportModal({
  count, creditsPerLead, onExport, onClose,
}: {
  count: number;
  creditsPerLead: number;
  onExport: (listName: string) => void;
  onClose: () => void;
}) {
  const [listName, setListName] = useState("AI Prospects");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-white font-semibold text-sm mb-1">Add to List</h3>
        <p className="text-white/45 text-xs mb-5">
          {count} lead{count !== 1 ? "s" : ""} · <span className="text-orange-400 font-medium">{count * creditsPerLead} credits</span>
        </p>
        <label className="block text-white/50 text-xs mb-1.5">List name</label>
        <input
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-orange-500/50 mb-5"
          value={listName}
          onChange={e => setListName(e.target.value)}
          placeholder="My Prospects"
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-white/5 text-white/50 text-xs hover:bg-white/10 transition-colors">Cancel</button>
          <button
            onClick={() => listName.trim() && onExport(listName.trim())}
            disabled={!listName.trim()}
            className="flex-1 px-4 py-2 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors disabled:opacity-40"
          >
            Add to List
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AiSearchPage() {
  // Form
  const [industry,    setIndustry]    = useState("");
  const [role,        setRole]        = useState("");
  const [geography,   setGeography]   = useState("");
  const [companySize, setCompanySize] = useState("any");
  const [count,       setCount]       = useState(50);
  const [countInput,  setCountInput]  = useState("50");
  const [model,       setModel]       = useState<AiProspectModel>("claude-haiku-4-5-20251001");

  // Results
  const [search,     setSearch]     = useState<ProspectSearch | null>(null);
  const [results,    setResults]    = useState<ProspectResult[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [showExport, setShowExport] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const pollSearch = useCallback(async (searchId: string) => {
    try {
      const res = await wsFetch(`/api/discover/ai-prospects/${searchId}`);
      if (!res.ok) return;
      const data = await res.json();
      setSearch(data.search);
      setResults(data.results ?? []);
      if (data.search.status === "done" || data.search.status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function handleGenerate() {
    if (!industry.trim() || !role.trim() || !geography.trim()) return;
    setLoading(true);
    setError(null);
    setSearch(null);
    setResults([]);
    setSelected(new Set());

    try {
      const res = await wsFetch("/api/discover/ai-prospects", {
        method: "POST",
        body: JSON.stringify({ industry, role, geography, company_size: companySize, count, model }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Generation failed"); return; }
      await pollSearch(data.search_id);
      pollRef.current = setInterval(() => pollSearch(data.search_id), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(listName: string) {
    setShowExport(false);
    if (!search || selected.size === 0) return;
    const res = await wsFetch(`/api/discover/ai-prospects/${search.id}/export`, {
      method: "POST",
      body: JSON.stringify({ result_ids: Array.from(selected), list_name: listName }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Export failed"); return; }
    setResults(prev => prev.map(r => selected.has(r.id) ? { ...r, exported_at: new Date().toISOString() } : r));
    setSelected(new Set());
  }

  function toggleRow(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleAll() {
    const exportable = results.filter(r => !r.exported_at && r.best_email);
    if (selected.size === exportable.length && exportable.length > 0) setSelected(new Set());
    else setSelected(new Set(exportable.map(r => r.id)));
  }

  function handleCountInput(val: string) {
    setCountInput(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1 && n <= 1000) setCount(n);
  }

  const creditsPerLead = AI_PROSPECT_MODELS[model].credits;
  const exportable     = results.filter(r => !r.exported_at && r.best_email);
  const isGenerating   = loading || search?.status === "generating";
  const isEnriching    = search?.status === "enriching";
  const isDone         = search?.status === "done";
  const canGenerate    = !isGenerating && industry.trim() && role.trim() && geography.trim();

  // ── Sidebar contents ──────────────────────────────────────────────────────

  const sidebarInner = (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/8">
        <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Search Parameters</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Industry */}
        <div>
          <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Industry / Niche</label>
          <input
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/25 outline-none focus:border-orange-500/40 transition-colors"
            placeholder="e.g. Texas Home Builders"
            value={industry}
            onChange={e => setIndustry(e.target.value)}
          />
        </div>

        {/* Role */}
        <div>
          <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Target Role</label>
          <input
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/25 outline-none focus:border-orange-500/40 transition-colors"
            placeholder="e.g. CEO, VP Sales"
            value={role}
            onChange={e => setRole(e.target.value)}
          />
          <div className="flex flex-wrap gap-1 mt-2">
            {ROLE_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => setRole(p)}
                className={`px-2 py-0.5 rounded text-[9px] border transition-colors ${
                  role === p
                    ? "bg-orange-500/20 border-orange-500/40 text-orange-300"
                    : "bg-white/4 border-white/8 text-white/35 hover:text-white/60 hover:border-white/20"
                }`}
              >{p}</button>
            ))}
          </div>
        </div>

        {/* Geography */}
        <div>
          <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Geography</label>
          <input
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/25 outline-none focus:border-orange-500/40 transition-colors"
            placeholder="e.g. Texas, USA"
            value={geography}
            onChange={e => setGeography(e.target.value)}
          />
        </div>

        {/* Company size */}
        <div>
          <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Company Size</label>
          <div className="flex flex-wrap gap-1">
            {SIZE_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => setCompanySize(o.value)}
                className={`px-2 py-1 rounded text-[9px] border transition-colors ${
                  companySize === o.value
                    ? "bg-orange-500/20 border-orange-500/40 text-orange-300"
                    : "bg-white/4 border-white/8 text-white/35 hover:text-white/60"
                }`}
              >{o.label}</button>
            ))}
          </div>
        </div>

        {/* Count */}
        <div>
          <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Number of Leads</label>
          <div className="flex flex-wrap gap-1 mb-2">
            {COUNT_PRESETS.map(n => (
              <button
                key={n}
                onClick={() => { setCount(n); setCountInput(String(n)); }}
                className={`px-2.5 py-1 rounded text-[9px] border transition-colors ${
                  count === n
                    ? "bg-orange-500/20 border-orange-500/40 text-orange-300"
                    : "bg-white/4 border-white/8 text-white/35 hover:text-white/60"
                }`}
              >{n.toLocaleString()}</button>
            ))}
          </div>
          <input
            type="number"
            min={1}
            max={1000}
            value={countInput}
            onChange={e => handleCountInput(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-orange-500/40 transition-colors"
            placeholder="Custom (max 1,000)"
          />
        </div>

        {/* Model */}
        <div>
          <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">AI Model</label>
          <div className="space-y-1.5">
            {(Object.entries(MODEL_LABELS) as [AiProspectModel, typeof MODEL_LABELS[AiProspectModel]][]).map(([id, m]) => (
              <button
                key={id}
                onClick={() => setModel(id)}
                className={`w-full px-3 py-2.5 rounded-xl border text-left transition-all ${
                  model === id
                    ? "bg-orange-500/12 border-orange-500/35"
                    : "bg-white/[0.02] border-white/8 hover:border-white/18"
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-xs font-semibold ${model === id ? "text-orange-300" : "text-white/65"}`}>{m.label}</span>
                  <span className={`text-[10px] font-bold ${model === id ? "text-orange-400" : "text-white/35"}`}>{m.credits} cr/lead</span>
                </div>
                <div className="text-[9px] text-white/30 leading-tight">{m.bestFor}</div>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Generate button pinned at bottom */}
      <div className="flex-shrink-0 px-4 py-4 border-t border-white/8">
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full py-2.5 rounded-xl bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isGenerating ? <><Spinner sm /> Generating…</> : "Generate Leads"}
        </button>
        {error && <p className="mt-2 text-red-400 text-[10px] text-center">{error}</p>}
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex overflow-hidden">

      {/* Mobile filter overlay */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[280px] bg-[#0a0f1e] flex flex-col border-r border-white/10 shadow-2xl z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 flex-shrink-0">
              <span className="text-sm font-bold text-white/80">Search</span>
              <button onClick={() => setMobileFiltersOpen(false)} className="text-white/40 hover:text-white/70 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            {sidebarInner}
          </div>
        </div>
      )}

      {/* Left sidebar (desktop) */}
      <div className="hidden lg:flex w-[240px] flex-shrink-0 border-r border-white/8 flex-col">
        {sidebarInner}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">

        {/* Toolbar */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 lg:px-5 py-2.5 border-b border-white/8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileFiltersOpen(true)}
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/>
              </svg>
            </button>
            <h1 className="text-sm font-bold text-white/80">AI Prospect Search</h1>
            {isDone && results.length > 0 && (
              <span className="text-xs text-white/30 tabular-nums">{results.length.toLocaleString()} results</span>
            )}
            {(isGenerating || isEnriching) && (
              <div className="flex items-center gap-2">
                <Spinner sm />
                <span className="text-xs text-white/40">
                  {isGenerating
                    ? "Generating with Claude…"
                    : `Enriching ${search!.total_enriched}/${search!.total_generated}`}
                </span>
                {isEnriching && (
                  <div className="w-24 h-1 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((search!.total_enriched / Math.max(search!.total_generated, 1)) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Selection bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-orange-300 font-medium">
                {selected.size} selected · <span className="text-orange-400">{selected.size * creditsPerLead} credits</span>
              </span>
              <button onClick={() => setSelected(new Set())} className="text-white/35 text-xs hover:text-white/60 transition-colors">Clear</button>
              <button
                onClick={() => setShowExport(true)}
                className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors"
              >Add to List</button>
            </div>
          )}
        </div>

        {/* Empty state */}
        {!search && !loading && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
              </svg>
            </div>
            <p className="text-white/35 text-sm max-w-xs">
              Fill in the search parameters and click <span className="text-white/55">Generate Leads</span> — Claude finds real decision makers from its training knowledge.
            </p>
          </div>
        )}

        {/* Table */}
        {(search || loading) && (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#0a0f1e]">
                <tr className="border-b border-white/8">
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={exportable.length > 0 && selected.size === exportable.length}
                      onChange={toggleAll}
                      className="accent-orange-500"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-white/35 uppercase tracking-wider">Person</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-white/35 uppercase tracking-wider">Company</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-white/35 uppercase tracking-wider">AI Email</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-white/35 uppercase tracking-wider">Discover</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-white/35 uppercase tracking-wider">Best Email</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-white/35 uppercase tracking-wider">Verified</th>
                  <th className="w-8 px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {/* Skeleton rows while generating */}
                {isGenerating && results.length === 0 && Array.from({ length: Math.min(count, 10) }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.04]">
                    <td className="px-4 py-3"><div className="w-4 h-4 bg-white/8 rounded animate-pulse" /></td>
                    <td className="px-3 py-3">
                      <div className="h-3 bg-white/8 rounded animate-pulse w-28 mb-1.5" />
                      <div className="h-2.5 bg-white/5 rounded animate-pulse w-20" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="h-3 bg-white/8 rounded animate-pulse w-24 mb-1.5" />
                      <div className="h-2.5 bg-white/5 rounded animate-pulse w-16" />
                    </td>
                    <td colSpan={4} className="px-3 py-3">
                      <div className="h-2.5 bg-white/5 rounded animate-pulse w-36" />
                    </td>
                    <td />
                  </tr>
                ))}

                {results.map(r => {
                  const isExported = !!r.exported_at;
                  const isChecked  = selected.has(r.id);
                  const conf       = r.ai_email_confidence ?? 0;
                  const confCls    = conf >= 60 ? "bg-white/8 text-white/35 border-white/10" : "bg-orange-500/10 text-orange-400/60 border-orange-500/20";
                  const vBadge     = r.verification_status ? (VERIFICATION_BADGE[r.verification_status] ?? VERIFICATION_BADGE.unknown) : null;

                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-white/[0.04] transition-colors ${
                        isExported ? "opacity-35" : isChecked ? "bg-orange-500/[0.04]" : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        {isExported ? (
                          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                          </svg>
                        ) : r.best_email ? (
                          <input type="checkbox" checked={isChecked} onChange={() => toggleRow(r.id)} className="accent-orange-500" />
                        ) : null}
                      </td>

                      <td className="px-3 py-2.5">
                        <div className="text-xs font-medium text-white/80 leading-none mb-1 truncate max-w-[140px]">{r.person_name ?? "—"}</div>
                        <div className="text-[10px] text-white/35 truncate max-w-[140px]">{r.title ?? "—"}</div>
                      </td>

                      <td className="px-3 py-2.5">
                        <div className="text-xs text-white/65 leading-none mb-1 truncate max-w-[130px]">{r.company_name ?? "—"}</div>
                        <div className="text-[10px] text-white/25 truncate max-w-[130px]">{r.domain ?? "—"}</div>
                      </td>

                      <td className="px-3 py-2.5">
                        {r.ai_email ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-white/45 font-mono truncate max-w-[150px]">{r.ai_email}</span>
                            <span className={`flex-shrink-0 px-1 py-0.5 rounded text-[8px] font-bold uppercase border ${confCls}`}>{conf}%</span>
                          </div>
                        ) : <span className="text-white/18 text-xs">—</span>}
                      </td>

                      <td className="px-3 py-2.5">
                        {r.enrichment_status === "pending"
                          ? <span className="text-[10px] text-white/20 animate-pulse">…</span>
                          : r.discover_email
                          ? <span className="text-[11px] text-emerald-400 font-mono truncate max-w-[150px] block">{r.discover_email}</span>
                          : <span className="text-white/18 text-xs">—</span>}
                      </td>

                      <td className="px-3 py-2.5">
                        {r.best_email ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-white/65 font-mono truncate max-w-[150px]">{r.best_email}</span>
                            <span className={`flex-shrink-0 px-1 py-0.5 rounded text-[8px] font-bold uppercase border ${
                              r.best_email_source === "discover"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-orange-500/8 text-orange-400/60 border-orange-500/18"
                            }`}>
                              {r.best_email_source === "discover" ? "DB" : "AI"}
                            </span>
                          </div>
                        ) : <span className="text-white/18 text-xs">—</span>}
                      </td>

                      <td className="px-3 py-2.5">
                        {vBadge
                          ? <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide border ${vBadge.className}`}>{vBadge.label}</span>
                          : <span className="text-white/18 text-xs">—</span>}
                      </td>

                      <td className="px-3 py-2.5">
                        {r.linkedin_url && (
                          <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-white/20 hover:text-white/55 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                            </svg>
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {isDone && results.length > 0 && (
              <p className="text-white/20 text-[10px] text-center py-4">
                {results.filter(r => r.best_email_source === "discover").length} matched in Discover DB ·{" "}
                {results.filter(r => r.verification_status === "valid" || r.verification_status === "safe").length} verified valid
              </p>
            )}

            {search?.status === "failed" && (
              <div className="py-12 text-center text-red-400 text-sm">
                {search.error_message ?? "Generation failed. Please try again."}
              </div>
            )}
          </div>
        )}
      </div>

      {showExport && search && (
        <ExportModal
          count={selected.size}
          creditsPerLead={creditsPerLead}
          onExport={handleExport}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
