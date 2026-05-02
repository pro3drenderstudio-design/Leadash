"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { wsGet } from "@/lib/workspace/client";
import {
  DISCOVER_SENIORITY_OPTIONS,
  DISCOVER_COMPANY_SIZE_OPTIONS,
  type DiscoverResult,
  type DiscoverSearchResponse,
} from "@/types/discover";

// ── Helpers ───────────────────────────────────────────────────────────────────

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "New Zealand",
  "Germany", "France", "Netherlands", "Sweden", "Norway", "Denmark",
  "India", "Singapore", "United Arab Emirates", "South Africa", "Nigeria",
];

const INDUSTRIES = [
  "Technology", "Software", "Financial Services", "Healthcare", "Marketing",
  "Consulting", "Real Estate", "Education", "Media", "Retail", "Manufacturing",
  "Legal", "Construction", "Logistics", "Hospitality",
];

function LinkedInIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "verified"   ? "bg-green-500/15 text-green-400 border-green-500/25" :
    status === "invalid"    ? "bg-red-500/15 text-red-400 border-red-500/25" :
    status === "risky"      ? "bg-amber-500/15 text-amber-400 border-amber-500/25" :
                              "bg-white/8 text-white/30 border-white/10";
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
      {status}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="w-5 h-5 animate-spin text-orange-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DiscoverPage() {
  const [q,           setQ]           = useState("");
  const [country,     setCountry]     = useState("");
  const [seniority,   setSeniority]   = useState("");
  const [industry,    setIndustry]    = useState("");
  const [companySize, setCompanySize] = useState("");
  const [hasEmail,    setHasEmail]    = useState(true);
  const [page,        setPage]        = useState(1);

  const [results,  setResults]  = useState<DiscoverResult[]>([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [exporting,  setExporting]  = useState(false);
  const [exportDone, setExportDone] = useState<string | null>(null);
  const [balance,    setBalance]    = useState<number | null>(null);

  const limit = 25;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Fetch balance on mount
  useEffect(() => {
    wsGet<{ lead_credits_balance: number }>("/api/settings/workspace")
      .then(d => setBalance(d.lead_credits_balance ?? 0))
      .catch(() => {});
  }, []);

  const search = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    setExportDone(null);
    try {
      const params = new URLSearchParams();
      if (q)           params.set("q",           q);
      if (country)     params.set("country",     country);
      if (seniority)   params.set("seniority",   seniority);
      if (industry)    params.set("industry",    industry);
      if (companySize) params.set("company_size",companySize);
      if (hasEmail)    params.set("has_email",   "true");
      params.set("page",  String(p));
      params.set("limit", String(limit));
      const data = await wsGet<DiscoverSearchResponse>(`/api/discover/search?${params}`);
      setResults(data.results ?? []);
      setTotal(data.total ?? 0);
      setPage(p);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [q, country, seniority, industry, companySize, hasEmail]);

  function toggleSelect(id: string) {
    setSelected(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (selected.size === results.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map(r => r.id)));
    }
  }

  async function handleExport(format: "csv" | "campaign") {
    if (selected.size === 0) return;
    setExporting(true);
    setExportDone(null);
    try {
      const res = await fetch("/api/discover/export", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: Array.from(selected), format }),
      });
      if (format === "csv" && res.ok) {
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `leadash-discover-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setExportDone(`${selected.size} leads exported to CSV`);
        if (balance !== null) setBalance(b => (b ?? 0) - selected.size * 0.5);
        setSelected(new Set());
      } else if (format === "campaign" && res.ok) {
        setExportDone(`${selected.size} leads added to your Leads Pool`);
        if (balance !== null) setBalance(b => (b ?? 0) - selected.size * 0.5);
        setSelected(new Set());
      } else {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        setError(j.error ?? "Export failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const costPreview = Math.ceil(selected.size * 0.5 * 10) / 10;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-white/8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white/90">Leadash Discover</h1>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-orange-500/15 text-orange-400 border border-orange-500/25 px-1.5 py-0.5 rounded">New</span>
            </div>
            <p className="text-sm text-white/35 mt-0.5">
              Search our B2B database · 0.5 credits per lead exported
            </p>
          </div>
          {balance !== null && (
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-white/30">Credits</p>
              <p className="text-lg font-bold text-amber-400 tabular-nums">{balance.toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* Search bar */}
        <div className="flex gap-2 mt-4">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
            </svg>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search(1)}
              placeholder="Search by name, title, or company..."
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>
          <button
            onClick={() => search(1)}
            disabled={loading}
            className="px-5 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 flex-shrink-0"
          >
            {loading ? <Spinner /> : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
              </svg>
            )}
            Search
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mt-3">
          {[
            { label: "Country",      value: country,     set: setCountry,     opts: COUNTRIES },
            { label: "Seniority",    value: seniority,   set: setSeniority,   opts: [...DISCOVER_SENIORITY_OPTIONS] },
            { label: "Industry",     value: industry,    set: setIndustry,    opts: INDUSTRIES },
            { label: "Company Size", value: companySize, set: setCompanySize, opts: [...DISCOVER_COMPANY_SIZE_OPTIONS] },
          ].map(f => (
            <select
              key={f.label}
              value={f.value}
              onChange={e => f.set(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white/70 text-xs focus:outline-none focus:border-orange-500/50 transition-colors"
            >
              <option value="">{f.label}: Any</option>
              {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          <label className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 cursor-pointer hover:border-white/20 transition-colors">
            <input
              type="checkbox"
              checked={hasEmail}
              onChange={e => setHasEmail(e.target.checked)}
              className="w-3 h-3 accent-orange-500"
            />
            <span className="text-white/60 text-xs">Has Email</span>
          </label>
        </div>
      </div>

      {/* Toolbar (selection actions) */}
      {selected.size > 0 && (
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-2.5 bg-orange-500/10 border-b border-orange-500/20">
          <span className="text-sm text-orange-300 font-medium">
            {selected.size} selected · <span className="text-orange-400 font-bold">{costPreview} credits</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport("campaign")}
              disabled={exporting}
              className="px-3 py-1.5 text-xs font-semibold bg-white/10 hover:bg-white/15 border border-white/15 text-white/80 rounded-lg transition-colors disabled:opacity-50"
            >
              {exporting ? "..." : "Add to Leads Pool"}
            </button>
            <button
              onClick={() => handleExport("csv")}
              disabled={exporting}
              className="px-3 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
            <button onClick={() => setSelected(new Set())} className="text-white/30 hover:text-white/60 text-xs transition-colors">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Success toast */}
      {exportDone && (
        <div className="flex-shrink-0 mx-6 mt-3 px-4 py-2.5 bg-green-500/10 border border-green-500/25 rounded-xl text-green-400 text-sm flex items-center justify-between">
          <span>{exportDone}</span>
          <button onClick={() => setExportDone(null)} className="text-green-500/50 hover:text-green-400 ml-3">×</button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex-shrink-0 mx-6 mt-3 px-4 py-2.5 bg-red-500/10 border border-red-500/25 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!searched && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-white/20 gap-4">
            <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
            </svg>
            <div className="text-center">
              <p className="text-base font-medium text-white/30">Search our B2B database</p>
              <p className="text-sm text-white/20 mt-1">Filter by country, seniority, industry, and more</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-24">
            <Spinner />
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <svg className="w-10 h-10 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
            </svg>
            <p className="text-white/30 text-sm">No results found</p>
            <p className="text-white/20 text-xs max-w-xs">
              Our database is growing. Run Lead Campaigns to add data, or try broader filters.
            </p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-950 border-b border-white/8">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === results.length && results.length > 0}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 accent-orange-500"
                  />
                </th>
                <th className="text-left text-white/30 text-xs font-semibold uppercase tracking-wider px-3 py-3">Prospect</th>
                <th className="text-left text-white/30 text-xs font-semibold uppercase tracking-wider px-3 py-3">Company</th>
                <th className="text-left text-white/30 text-xs font-semibold uppercase tracking-wider px-3 py-3">Location</th>
                <th className="text-left text-white/30 text-xs font-semibold uppercase tracking-wider px-3 py-3">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {results.map(r => {
                const name     = [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unknown";
                const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
                const isSelected = selected.has(r.id);
                return (
                  <tr
                    key={r.id}
                    onClick={() => toggleSelect(r.id)}
                    className={`cursor-pointer transition-colors hover:bg-white/3 ${isSelected ? "bg-orange-500/5" : ""}`}
                  >
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(r.id)}
                        className="w-3.5 h-3.5 accent-orange-500"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-xs font-semibold text-white/50 flex-shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-white/85 font-medium text-xs truncate">{name}</p>
                            {r.linkedin_url && (
                              <a
                                href={r.linkedin_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-blue-400/60 hover:text-blue-400 flex-shrink-0 transition-colors"
                              >
                                <LinkedInIcon />
                              </a>
                            )}
                          </div>
                          <p className="text-white/35 text-xs truncate">{r.title || <span className="italic text-white/20">No title</span>}</p>
                          {r.seniority && (
                            <span className="text-[9px] font-medium text-white/25 uppercase tracking-wider">{r.seniority}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-white/70 text-xs font-medium truncate max-w-[140px]">
                        {r.company_name || <span className="text-white/20 italic">Unknown</span>}
                      </p>
                      <p className="text-white/30 text-xs truncate">
                        {r.company_industry || ""}
                        {r.company_industry && r.company_size ? " · " : ""}
                        {r.company_size || ""}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-white/35 text-xs">
                      {[r.city, r.country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-3">
                      {r.has_email ? (
                        <div className="space-y-0.5">
                          <p className="text-white/40 text-xs font-mono">{r.email_preview}</p>
                          <StatusPill status={r.email_status} />
                        </div>
                      ) : (
                        <span className="text-white/20 text-xs italic">No email</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && searched && total > limit && (
        <div className="flex-shrink-0 flex items-center justify-between border-t border-white/8 px-6 py-3">
          <p className="text-xs text-white/30">
            {((page - 1) * limit + 1).toLocaleString()}–{Math.min(page * limit, total).toLocaleString()} of {total.toLocaleString()} results
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => search(page - 1)}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 text-xs text-white/50 hover:text-white disabled:opacity-30 border border-white/10 hover:border-white/20 rounded-lg transition-colors disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <span className="px-3 text-xs text-white/30">{page} / {totalPages}</span>
            <button
              onClick={() => search(page + 1)}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 text-xs text-white/50 hover:text-white disabled:opacity-30 border border-white/10 hover:border-white/20 rounded-lg transition-colors disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
