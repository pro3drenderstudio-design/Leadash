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
  notes:               string | null;
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

const ROLE_PRESETS = ["CEO", "CFO", "COO", "CTO", "VP Sales", "VP Marketing", "Managing Director", "President", "Founder", "General Manager"];

const SIZE_OPTIONS = [
  { value: "any",      label: "Any size" },
  { value: "1-10",     label: "1–10 employees" },
  { value: "11-50",    label: "11–50 employees" },
  { value: "51-200",   label: "51–200 employees" },
  { value: "201-500",  label: "201–500 employees" },
  { value: "501-1000", label: "501–1,000 employees" },
  { value: "1000+",    label: "1,000+ employees" },
];

const COUNT_OPTIONS = [10, 25, 50, 100];

const VERIFICATION_BADGE: Record<string, { label: string; className: string }> = {
  valid:             { label: "Valid",      className: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" },
  safe:              { label: "Safe",       className: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" },
  catch_all:         { label: "Catch-all",  className: "bg-amber-500/15 text-amber-400 border border-amber-500/25" },
  risky:             { label: "Risky",      className: "bg-orange-500/15 text-orange-400 border border-orange-500/25" },
  invalid:           { label: "Invalid",    className: "bg-red-500/15 text-red-400 border border-red-500/25" },
  unknown:           { label: "Unknown",    className: "bg-white/8 text-white/40 border border-white/10" },
};

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 shadow-2xl">
        <h3 className="text-white font-semibold text-base mb-1">Add to List</h3>
        <p className="text-white/50 text-sm mb-5">
          {count} lead{count !== 1 ? "s" : ""} · <span className="text-orange-400 font-medium">{count * creditsPerLead} credits</span>
        </p>
        <label className="block text-white/60 text-xs mb-1.5">List name</label>
        <input
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-orange-500/50 mb-5"
          value={listName}
          onChange={e => setListName(e.target.value)}
          placeholder="My Prospects"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-white/5 text-white/60 text-sm hover:bg-white/10 transition-colors">Cancel</button>
          <button
            onClick={() => listName.trim() && onExport(listName.trim())}
            disabled={!listName.trim()}
            className="flex-1 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-40"
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

  // Form state
  const [industry,    setIndustry]    = useState("");
  const [role,        setRole]        = useState("");
  const [geography,   setGeography]   = useState("");
  const [companySize, setCompanySize] = useState("any");
  const [count,       setCount]       = useState(25);
  const [model,       setModel]       = useState<AiProspectModel>("claude-haiku-4-5-20251001");

  // Results state
  const [search,    setSearch]    = useState<ProspectSearch | null>(null);
  const [results,   setResults]   = useState<ProspectResult[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [showExport, setShowExport] = useState(false);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Poll for enrichment progress
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

      // Start polling every 4s
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

    // Mark exported rows in local state
    setResults(prev => prev.map(r => selected.has(r.id) ? { ...r, exported_at: new Date().toISOString() } : r));
    setSelected(new Set());
  }

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const exportable = results.filter(r => !r.exported_at && r.best_email);
    if (selected.size === exportable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(exportable.map(r => r.id)));
    }
  }

  const creditsPerLead = AI_PROSPECT_MODELS[model].credits;
  const exportable = results.filter(r => !r.exported_at && r.best_email);
  const isGenerating = loading || search?.status === "generating";
  const isEnriching  = search?.status === "enriching";
  const isDone       = search?.status === "done";

  return (
    <div className="flex flex-col h-full">

      {/* ── Form ── */}
      <div className="flex-shrink-0 border-b border-white/8 bg-white/[0.02] px-6 py-5">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-white font-semibold text-base mb-4">AI Prospect Search</h1>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-white/50 text-xs mb-1">Industry / Niche</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-orange-500/50 transition-colors"
                placeholder="e.g. Texas Home Builders"
                value={industry}
                onChange={e => setIndustry(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-white/50 text-xs mb-1">Target Role</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-orange-500/50 transition-colors"
                placeholder="e.g. CEO, VP Sales"
                value={role}
                onChange={e => setRole(e.target.value)}
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {ROLE_PRESETS.map(p => (
                  <button
                    key={p}
                    onClick={() => setRole(p)}
                    className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                      role === p
                        ? "bg-orange-500/20 border-orange-500/40 text-orange-300"
                        : "bg-white/5 border-white/10 text-white/40 hover:text-white/60"
                    }`}
                  >{p}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-white/50 text-xs mb-1">Geography</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-orange-500/50 transition-colors"
                placeholder="e.g. Texas, USA"
                value={geography}
                onChange={e => setGeography(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-white/50 text-xs mb-1">Company Size</label>
              <select
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50 transition-colors appearance-none"
                value={companySize}
                onChange={e => setCompanySize(e.target.value)}
              >
                {SIZE_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-[#1a1a1a]">{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-white/50 text-xs mb-1">Number of leads</label>
              <div className="flex gap-1">
                {COUNT_OPTIONS.map(n => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      count === n
                        ? "bg-orange-500/20 border-orange-500/40 text-orange-300"
                        : "bg-white/5 border-white/10 text-white/50 hover:text-white/70"
                    }`}
                  >{n}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Model selector */}
          <div className="mb-4">
            <label className="block text-white/50 text-xs mb-2">AI Model</label>
            <div className="flex gap-2">
              {(Object.entries(AI_PROSPECT_MODELS) as [AiProspectModel, typeof AI_PROSPECT_MODELS[AiProspectModel]][]).map(([id, m]) => (
                <button
                  key={id}
                  onClick={() => setModel(id)}
                  className={`flex-1 px-3 py-2.5 rounded-xl border text-left transition-all ${
                    model === id
                      ? "bg-orange-500/15 border-orange-500/40"
                      : "bg-white/[0.03] border-white/8 hover:border-white/20"
                  }`}
                >
                  <div className={`text-sm font-medium mb-0.5 ${model === id ? "text-orange-300" : "text-white/70"}`}>{m.label}</div>
                  <div className="text-[10px] text-white/35">{m.description}</div>
                  <div className={`text-[11px] font-semibold mt-1 ${model === id ? "text-orange-400" : "text-white/40"}`}>{m.credits} cr/lead</div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !industry.trim() || !role.trim() || !geography.trim()}
            className="px-6 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGenerating ? "Generating…" : "Generate Leads"}
          </button>

          {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}
        </div>
      </div>

      {/* ── Results ── */}
      <div className="flex-1 overflow-y-auto">
        {!search && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-20">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <p className="text-white/40 text-sm max-w-xs">
              Fill in the form above and click <span className="text-white/60">Generate Leads</span> — Claude will find real decision makers from its training data.
            </p>
          </div>
        )}

        {(isGenerating || results.length > 0) && (
          <div className="max-w-7xl mx-auto px-4 py-4">

            {/* Progress bar */}
            {(isGenerating || isEnriching) && (
              <div className="flex items-center gap-3 mb-4 px-1">
                <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-500"
                    style={{ width: isGenerating ? "15%" : `${Math.round((search!.total_enriched / Math.max(search!.total_generated, 1)) * 100)}%` }}
                  />
                </div>
                <span className="text-white/40 text-xs flex-shrink-0">
                  {isGenerating
                    ? "Generating with Claude…"
                    : `Enriching ${search!.total_enriched}/${search!.total_generated}…`}
                </span>
              </div>
            )}

            {/* Selection bar */}
            {selected.size > 0 && (
              <div className="flex items-center gap-3 mb-3 px-3 py-2.5 bg-orange-500/8 border border-orange-500/20 rounded-xl">
                <span className="text-orange-300 text-sm font-medium flex-1">
                  {selected.size} selected · <span className="text-orange-400">{selected.size * creditsPerLead} credits</span>
                </span>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-white/40 text-xs hover:text-white/60 transition-colors"
                >Clear</button>
                <button
                  onClick={() => setShowExport(true)}
                  className="px-4 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors"
                >Add to List</button>
              </div>
            )}

            {/* Table */}
            <div className="border border-white/8 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 bg-white/[0.02]">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={exportable.length > 0 && selected.size === exportable.length}
                        onChange={toggleAll}
                        className="accent-orange-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-white/40 font-medium text-xs">Person</th>
                    <th className="px-4 py-3 text-left text-white/40 font-medium text-xs">Company</th>
                    <th className="px-4 py-3 text-left text-white/40 font-medium text-xs">AI Email</th>
                    <th className="px-4 py-3 text-left text-white/40 font-medium text-xs">Discover Email</th>
                    <th className="px-4 py-3 text-left text-white/40 font-medium text-xs">Best Email</th>
                    <th className="px-4 py-3 text-left text-white/40 font-medium text-xs">Verified</th>
                    <th className="w-10 px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Skeleton rows while generating */}
                  {isGenerating && results.length === 0 && Array.from({ length: count }).map((_, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="px-4 py-3"><div className="w-4 h-4 bg-white/8 rounded animate-pulse" /></td>
                      <td className="px-4 py-3">
                        <div className="h-3.5 bg-white/8 rounded animate-pulse w-32 mb-1.5" />
                        <div className="h-3 bg-white/5 rounded animate-pulse w-20" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-3.5 bg-white/8 rounded animate-pulse w-28 mb-1.5" />
                        <div className="h-3 bg-white/5 rounded animate-pulse w-20" />
                      </td>
                      <td colSpan={4} className="px-4 py-3">
                        <div className="h-3 bg-white/5 rounded animate-pulse w-40" />
                      </td>
                      <td />
                    </tr>
                  ))}

                  {results.map(r => {
                    const isExported = !!r.exported_at;
                    const isChecked  = selected.has(r.id);
                    const conf       = r.ai_email_confidence ?? 0;
                    const confBadge  = conf >= 60
                      ? "bg-white/8 text-white/40 border-white/10"
                      : "bg-orange-500/12 text-orange-400/70 border-orange-500/20";
                    const vBadge = r.verification_status ? (VERIFICATION_BADGE[r.verification_status] ?? VERIFICATION_BADGE.unknown) : null;

                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-white/5 transition-colors ${
                          isExported ? "opacity-40" : isChecked ? "bg-orange-500/5" : "hover:bg-white/[0.02]"
                        }`}
                      >
                        <td className="px-4 py-3">
                          {!isExported && r.best_email && (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleRow(r.id)}
                              className="accent-orange-500"
                            />
                          )}
                          {isExported && (
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-white/85 font-medium leading-none mb-1">{r.person_name ?? "—"}</div>
                          <div className="text-white/35 text-xs">{r.title ?? "—"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-white/70 leading-none mb-1">{r.company_name ?? "—"}</div>
                          <div className="text-white/30 text-xs">{r.domain ?? "—"}</div>
                        </td>
                        <td className="px-4 py-3">
                          {r.ai_email ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-white/50 text-xs font-mono truncate max-w-[160px]">{r.ai_email}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${confBadge}`}>
                                {conf}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-white/20 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.enrichment_status === "pending" ? (
                            <span className="text-white/20 text-xs animate-pulse">enriching…</span>
                          ) : r.discover_email ? (
                            <span className="text-emerald-400 text-xs font-mono truncate max-w-[160px] block">{r.discover_email}</span>
                          ) : (
                            <span className="text-white/20 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.best_email ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-white/70 text-xs font-mono truncate max-w-[160px]">{r.best_email}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${
                                r.best_email_source === "discover"
                                  ? "bg-emerald-500/12 text-emerald-400 border-emerald-500/25"
                                  : "bg-orange-500/10 text-orange-400/70 border-orange-500/20"
                              }`}>
                                {r.best_email_source === "discover" ? "DB" : "AI"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-white/20 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {vBadge ? (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${vBadge.className}`}>
                              {vBadge.label}
                            </span>
                          ) : (
                            <span className="text-white/20 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.linkedin_url && (
                            <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-white/25 hover:text-white/60 transition-colors">
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

              {results.length === 0 && !isGenerating && search?.status === "failed" && (
                <div className="py-12 text-center text-red-400 text-sm">
                  {search.error_message ?? "Generation failed. Please try again."}
                </div>
              )}
            </div>

            {isDone && results.length > 0 && (
              <p className="text-white/25 text-xs text-center mt-4">
                {results.filter(r => r.best_email_source === "discover").length} leads matched in Discover database ·{" "}
                {results.filter(r => r.verification_status === "valid" || r.verification_status === "safe").length} verified valid
              </p>
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
