"use client";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { wsGet, wsFetch } from "@/lib/workspace/client";
import "@/v2-app/v2-app.css";
import {
  type DiscoverResult, type DiscoverSearchResponse,
  type DiscoverCompanyResult, type DiscoverCompanySearchResponse,
  type SavedSearch,
} from "@/types/discover";
import {
  cacheKey as discoverCacheKey,
  getCachedResult, setCachedResult,
  getInflight, registerInflight,
  getLastSearchKey,
  type CacheEntry as DiscoverCacheEntry,
} from "@/lib/discover/search-cache";
import { emitCreditsChanged } from "@/lib/credits/events";
import {
  PeopleSidebar, CompanySidebar,
  DEFAULT_PEOPLE_FILTERS, DEFAULT_COMPANY_FILTERS,
  PEOPLE_QUICK_FILTERS, COMPANY_QUICK_FILTERS,
  type PeopleFilters, type CompanyFilters,
} from "./DiscoverFilters";

// ── URL helpers ───────────────────────────────────────────────────────────────

/**
 * Retry a batch POST once on transient failure (5xx / network / 429).
 * Returns the parsed JSON body on success, or null when the batch has hard-
 * failed (auth, 4xx-except-429, or exhausted retries). The caller decides
 * whether to keep going with the next batch — we don't want one hiccup to
 * lose 5,000 already-selected leads.
 */
async function postBatchWithRetry(
  url: string,
  body: unknown,
  isBlob: boolean = false,
): Promise<{ ok: true; res: Response; json: Record<string, unknown> | null; blob: Blob | null } | { ok: false; error: string; retryable: boolean }> {
  const attempts = 2;
  let lastErr = "Failed";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await wsFetch(url, { method: "POST", body: JSON.stringify(body) });
      if (res.ok) {
        if (isBlob) return { ok: true, res, json: null, blob: await res.blob() };
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        return { ok: true, res, json, blob: null };
      }
      // 4xx (except 429) is hard-failed — retry won't help.
      const retryable = res.status >= 500 || res.status === 429;
      const errBody = await res.json().catch(() => ({ error: res.statusText }));
      lastErr = (errBody as { error?: string }).error ?? `HTTP ${res.status}`;
      if (!retryable || attempt === attempts) return { ok: false, error: lastErr, retryable };
      // Backoff before retry (2s, then give up).
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "Network error";
      if (attempt === attempts) return { ok: false, error: lastErr, retryable: true };
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return { ok: false, error: lastErr, retryable: false };
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const s = url.trim();
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `https://${s}`;
}

// ── URL / localStorage helpers ───────────────────────────────────────────────

type RecentSearch = { id: string; label: string; paramsStr: string; ts: number };
const RECENT_KEY = "ld_discover_recent";

function loadRecent(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as RecentSearch[]; }
  catch { return []; }
}

function pushRecent(item: RecentSearch) {
  const list = loadRecent().filter(r => r.paramsStr !== item.paramsStr).slice(0, 7);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...list])); } catch { /* quota */ }
}

function timeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function filtersToParams(
  mode: "people" | "companies",
  pf: PeopleFilters,
  cf: CompanyFilters,
): URLSearchParams {
  const p = new URLSearchParams();
  if (mode !== "people")                p.set("mode",  mode);
  if (pf.keyword)                       p.set("q",     pf.keyword);
  if (pf.titleIncludes.length)          p.set("ti",    pf.titleIncludes.join(","));
  if (pf.titleExcludes.length)          p.set("te",    pf.titleExcludes.join(","));
  if (pf.seniorities.length)            p.set("sen",   pf.seniorities.join(","));
  if (pf.senioritiesExclude.length)     p.set("sene",  pf.senioritiesExclude.join(","));
  if (pf.departments.length)            p.set("dept",  pf.departments.join(","));
  if (pf.departmentsExclude.length)     p.set("depte", pf.departmentsExclude.join(","));
  if (pf.countryIncludes.length)        p.set("ctry",  pf.countryIncludes.join(","));
  if (pf.countryExcludes.length)        p.set("ctrye", pf.countryExcludes.join(","));
  if (pf.locationIncludes.length)       p.set("loc",   pf.locationIncludes.join(","));
  if (pf.locationExcludes.length)       p.set("loce",  pf.locationExcludes.join(","));
  if (pf.companyIncludes.length)        p.set("co",    pf.companyIncludes.join(","));
  if (pf.companyExcludes.length)        p.set("coe",   pf.companyExcludes.join(","));
  if (pf.industryIncludes.length)       p.set("ind",   pf.industryIncludes.join(","));
  if (pf.industryExcludes.length)       p.set("inde",  pf.industryExcludes.join(","));
  if (pf.companySizes.length)           p.set("sz",    pf.companySizes.join(","));
  if (pf.emailStatus !== "has_email")   p.set("em",    pf.emailStatus);
  if (pf.companyKeywordIncludes.length) p.set("cokw",  pf.companyKeywordIncludes.join(","));
  if (pf.companyKeywordExcludes.length) p.set("cokwe", pf.companyKeywordExcludes.join(","));
  if (pf.netNew)                        p.set("nn",    "1");
  if (cf.coKeyword)                     p.set("cq",    cf.coKeyword);
  if (cf.coCountryIncludes.length)      p.set("cctry", cf.coCountryIncludes.join(","));
  if (cf.coCountryExcludes.length)      p.set("cctrye",cf.coCountryExcludes.join(","));
  if (cf.coLocationIncludes.length)     p.set("cloc",  cf.coLocationIncludes.join(","));
  if (cf.coLocationExcludes.length)     p.set("cloce", cf.coLocationExcludes.join(","));
  if (cf.coIndustryIncludes.length)     p.set("cind",  cf.coIndustryIncludes.join(","));
  if (cf.coIndustryExcludes.length)     p.set("cinde", cf.coIndustryExcludes.join(","));
  if (cf.coSizes.length)                p.set("csz",   cf.coSizes.join(","));
  if (cf.coFundingStages.length)        p.set("fund",  cf.coFundingStages.join(","));
  if (cf.coEmployeeRange)             { p.set("emin",  String(cf.coEmployeeRange.min)); p.set("emax", String(cf.coEmployeeRange.max)); }
  if (cf.coRevenueRange)              { p.set("rmin",  String(cf.coRevenueRange.min));  p.set("rmax", String(cf.coRevenueRange.max)); }
  if (cf.coHasPeople)                   p.set("hp",    "1");
  if (cf.coKeywordIncludes.length)      p.set("ckw",   cf.coKeywordIncludes.join(","));
  if (cf.coKeywordExcludes.length)      p.set("ckwe",  cf.coKeywordExcludes.join(","));
  return p;
}

function filtersFromParams(p: { get(key: string): string | null }): {
  mode: "people" | "companies"; pf: PeopleFilters; cf: CompanyFilters;
} {
  function csv(k: string) { return p.get(k)?.split(",").filter(Boolean) ?? []; }
  const mode = (p.get("mode") === "companies" ? "companies" : "people") as "people" | "companies";
  return {
    mode,
    pf: {
      keyword:              p.get("q")   ?? "",
      titleIncludes:        csv("ti"),
      titleExcludes:        csv("te"),
      seniorities:          csv("sen"),
      senioritiesExclude:   csv("sene"),
      departments:          csv("dept"),
      departmentsExclude:   csv("depte"),
      countryIncludes:      csv("ctry"),
      countryExcludes:      csv("ctrye"),
      locationIncludes:     csv("loc"),
      locationExcludes:     csv("loce"),
      companyIncludes:      csv("co"),
      companyExcludes:      csv("coe"),
      industryIncludes:     csv("ind"),
      industryExcludes:     csv("inde"),
      companySizes:         csv("sz"),
      emailStatus:          (p.get("em") as PeopleFilters["emailStatus"]) ?? "has_email",
      companyKeywordIncludes: csv("cokw"),
      companyKeywordExcludes: csv("cokwe"),
      netNew:                 p.get("nn") === "1",
    },
    cf: {
      coKeyword:          p.get("cq")   ?? "",
      coCountryIncludes:  csv("cctry"),
      coCountryExcludes:  csv("cctrye"),
      coLocationIncludes: csv("cloc"),
      coLocationExcludes: csv("cloce"),
      coIndustryIncludes: csv("cind"),
      coIndustryExcludes: csv("cinde"),
      coSizes:            csv("csz"),
      coFundingStages:    csv("fund"),
      coEmployeeRange:    p.get("emin") ? { min: +(p.get("emin")!), max: +(p.get("emax") ?? "0") } : null,
      coRevenueRange:     p.get("rmin") ? { min: +(p.get("rmin")!), max: +(p.get("rmax") ?? "0") } : null,
      coHasPeople:        p.get("hp") === "1",
      coKeywordIncludes:  csv("ckw"),
      coKeywordExcludes:  csv("ckwe"),
    },
  };
}

function makeSearchLabel(mode: "people" | "companies", pf: PeopleFilters, cf: CompanyFilters): string {
  const parts: string[] = [];
  if (mode === "people") {
    if (pf.countryIncludes.length)  parts.push(pf.countryIncludes.slice(0, 2).join(", "));
    if (pf.titleIncludes.length)    parts.push(pf.titleIncludes.slice(0, 2).join(", "));
    if (pf.seniorities.length)      parts.push(pf.seniorities[0]);
    if (pf.departments.length)      parts.push(pf.departments[0]);
    if (pf.industryIncludes.length) parts.push(pf.industryIncludes[0]);
    if (pf.companyIncludes.length)  parts.push(pf.companyIncludes[0]);
  } else {
    if (cf.coCountryIncludes.length)  parts.push(cf.coCountryIncludes.slice(0, 2).join(", "));
    if (cf.coIndustryIncludes.length) parts.push(cf.coIndustryIncludes[0]);
    if (cf.coSizes.length)            parts.push(cf.coSizes[0]);
    if (cf.coFundingStages.length)    parts.push(cf.coFundingStages.slice(0, 2).join(", "));
  }
  return parts.filter(Boolean).join(" · ") || (mode === "people" ? "All people" : "All companies");
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function Spinner({ sm }: { sm?: boolean }) {
  return (
    <svg className={`animate-spin text-orange-500 ${sm ? "w-3.5 h-3.5" : "w-5 h-5"}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );
}

function LinkedInIcon({ size = "sm" }: { size?: "sm" | "xs" }) {
  const cls = size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3";
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

function LockIcon({ open }: { open?: boolean }) {
  return open ? (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path strokeLinecap="round" d="M7 11V7a5 5 0 019.9-1"/>
    </svg>
  ) : (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path strokeLinecap="round" d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  );
}

function XIcon({ sm }: { sm?: boolean }) {
  return (
    <svg className={sm ? "w-3 h-3" : "w-4 h-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
    </svg>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function EmailPill({ status }: { status: string }) {
  const cls =
    status === "verified"     ? "bg-green-500/15 text-green-400 border-green-500/25" :
    status === "extrapolated" ? "bg-blue-500/15 text-blue-400 border-blue-500/25" :
    status === "invalid"      ? "bg-red-500/15 text-red-400 border-red-500/25" :
    status === "risky"        ? "bg-amber-500/15 text-amber-400 border-amber-500/25" :
                                "bg-white/8 text-white/25 border-white/10";
  const label = status === "extrapolated" ? "guessed" : status;
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}

function Avatar({ first, last, size = "md" }: { first: string | null; last: string | null; size?: "sm" | "md" | "lg" }) {
  const initials = `${(first ?? "?")[0]}${(last ?? "")[0] ?? ""}`.toUpperCase();
  const colors = ["bg-orange-500/25 text-orange-300", "bg-blue-500/25 text-blue-300", "bg-purple-500/25 text-purple-300", "bg-green-500/25 text-green-300", "bg-pink-500/25 text-pink-300"];
  const color  = colors[(first?.charCodeAt(0) ?? 0) % colors.length];
  const sz = size === "lg" ? "w-10 h-10 text-sm" : size === "sm" ? "w-6 h-6 text-[9px]" : "w-8 h-8 text-[11px]";
  return <div className={`${sz} rounded-full ${color} flex items-center justify-center font-bold flex-shrink-0`}>{initials}</div>;
}

function CompanyLogo({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const sz = size === "md" ? "w-8 h-8 text-xs" : "w-6 h-6 text-[9px]";
  return (
    <div className={`${sz} rounded bg-white/8 border border-white/6 flex items-center justify-center font-bold text-white/40 flex-shrink-0`}>
      {(name[0] ?? "?").toUpperCase()}
    </div>
  );
}

// ── Sequence picker modal ─────────────────────────────────────────────────────

type Campaign = { id: string; name: string; total_enrolled: number; status?: string };

function SequenceModal({ count, onClose, onConfirm }: {
  count: number;
  onClose: () => void;
  onConfirm: (campaignId: string | null, campaignName: string | null) => void;
}) {
  const [campaigns, setCampaigns]   = useState<Campaign[]>([]);
  const [loading, setLoading]       = useState(true);
  const [q, setQ]                   = useState("");
  const [selected, setSelected]     = useState<string | null>(null);
  const [newName, setNewName]       = useState("");
  const [creating, setCreating]     = useState(false);

  useEffect(() => {
    wsGet<Campaign[]>("/api/outreach/campaigns")
      .then(d => setCampaigns(d ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = campaigns.filter(c => c.name.toLowerCase().includes(q.toLowerCase()));

  function handleConfirm() {
    if (creating && newName.trim()) onConfirm(null, newName.trim());
    else if (selected) onConfirm(selected, null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#1a1a1a] border border-white/10 rounded-xl w-[420px] max-h-[520px] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div>
            <h2 className="text-sm font-bold text-white">Add to Sequence</h2>
            <p className="text-xs text-white/35 mt-0.5">{count} lead{count !== 1 ? "s" : ""} will be enrolled</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors"><XIcon /></button>
        </div>
        <div className="px-5 py-3 border-b border-white/8">
          {!creating ? (
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search sequences…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 placeholder-white/25 focus:outline-none focus:border-orange-500/40" />
          ) : (
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New sequence name…" autoFocus
              className="w-full bg-white/5 border border-orange-500/40 rounded-lg px-3 py-1.5 text-xs text-white/70 placeholder-white/25 focus:outline-none" />
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {!creating && (
            <button onClick={() => setCreating(true)} className="w-full flex items-center gap-2.5 px-5 py-2.5 hover:bg-white/4 transition-colors text-left">
              <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-sm">+</div>
              <span className="text-xs text-orange-400 font-medium">Create new sequence</span>
            </button>
          )}
          {creating && (
            <button onClick={() => setCreating(false)} className="w-full flex items-center gap-2 px-5 py-2 hover:bg-white/4 transition-colors text-left text-xs text-white/40">
              ← Back to existing sequences
            </button>
          )}
          {!creating && (loading ? (
            <div className="flex justify-center py-6"><Spinner sm /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs text-white/25 py-6">No sequences found</p>
          ) : (
            filtered.map(c => (
              <button key={c.id} onClick={() => setSelected(c.id)}
                className={`w-full flex items-center justify-between px-5 py-2.5 hover:bg-white/4 transition-colors text-left ${selected === c.id ? "bg-orange-500/10" : ""}`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${selected === c.id ? "bg-orange-500" : "bg-white/15"}`} />
                  <span className="text-xs text-white/70 truncate max-w-[220px]">{c.name}</span>
                </div>
                <span className="text-[10px] text-white/30 flex-shrink-0">{c.total_enrolled} enrolled</span>
              </button>
            ))
          ))}
        </div>
        <div className="px-5 py-3 border-t border-white/8 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">Cancel</button>
          <button onClick={handleConfirm} disabled={creating ? !newName.trim() : !selected}
            className="px-4 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white rounded-lg transition-colors disabled:opacity-40">
            {creating ? "Create & Add" : "Add to Sequence"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── List picker modal ─────────────────────────────────────────────────────────

type LeadList = { id: string; name: string; description: string | null; lead_count: number };

function ListModal({ count, onClose, onConfirm }: {
  count: number;
  onClose: () => void;
  onConfirm: (listId: string | null, listName: string | null) => void;
}) {
  const [lists, setLists]         = useState<LeadList[]>([]);
  const [loading, setLoading]     = useState(true);
  const [q, setQ]                 = useState("");
  const [selected, setSelected]   = useState<string | null>(null);
  const [newName, setNewName]     = useState("");
  const [creating, setCreating]   = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    wsGet<LeadList[]>("/api/outreach/lists")
      .then(d => setLists(d ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = lists.filter(l => l.name.toLowerCase().includes(q.toLowerCase()));

  // Detect duplicate list name (case-insensitive)
  const duplicateList = creating && newName.trim()
    ? lists.find(l => l.name.toLowerCase() === newName.trim().toLowerCase()) ?? null
    : null;

  function handleConfirm() {
    if (submitting) return;
    if (creating) {
      if (!newName.trim()) return;
      setSubmitting(true);
      // If name matches an existing list, add to that one instead
      onConfirm(duplicateList?.id ?? null, duplicateList ? null : newName.trim());
    } else if (selected) {
      setSubmitting(true);
      onConfirm(selected, null);
    }
  }

  function handleKeyDown(e: { key: string }) {
    if (e.key === "Enter") handleConfirm();
  }

  const canConfirm = creating ? newName.trim().length > 0 : !!selected;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#1a1a1a] border border-white/10 rounded-xl w-[420px] max-h-[540px] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div>
            <h2 className="text-sm font-bold text-white">Add to List</h2>
            <p className="text-xs text-white/35 mt-0.5">{count.toLocaleString()} lead{count !== 1 ? "s" : ""} selected</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors"><XIcon /></button>
        </div>

        <div className="px-5 py-3 border-b border-white/8 space-y-1.5">
          {!creating ? (
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search lists…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 placeholder-white/25 focus:outline-none focus:border-orange-500/40" />
          ) : (
            <>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="New list name…"
                autoFocus
                className={`w-full bg-white/5 border rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none transition-colors ${
                  newName.trim() ? "border-orange-500/60 bg-orange-500/5" : "border-white/15"
                }`}
              />
              {duplicateList && (
                <p className="text-[11px] text-amber-400/80 flex items-center gap-1">
                  <span>⚠</span>
                  <span>"{duplicateList.name}" already exists — leads will be added to it ({duplicateList.lead_count.toLocaleString()} leads)</span>
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {!creating && (
            <button onClick={() => setCreating(true)} className="w-full flex items-center gap-2.5 px-5 py-2.5 hover:bg-white/4 transition-colors text-left">
              <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-sm">+</div>
              <span className="text-xs text-orange-400 font-medium">Create new list</span>
            </button>
          )}
          {creating && (
            <button onClick={() => { setCreating(false); setNewName(""); }} className="w-full flex items-center gap-2 px-5 py-2 hover:bg-white/4 transition-colors text-left text-xs text-white/40">
              ← Back to existing lists
            </button>
          )}
          {!creating && (loading ? (
            <div className="flex justify-center py-6"><Spinner sm /></div>
          ) : filtered.length === 0 && !q ? (
            <p className="text-center text-xs text-white/25 py-6">No lists yet — create one above</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs text-white/25 py-4">No lists match "{q}"</p>
          ) : (
            filtered.map(l => (
              <button key={l.id} onClick={() => setSelected(l.id)}
                className={`w-full flex items-center justify-between px-5 py-2.5 hover:bg-white/4 transition-colors text-left ${selected === l.id ? "bg-orange-500/10" : ""}`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${selected === l.id ? "bg-orange-400" : "bg-white/15"}`} />
                  <span className={`text-xs truncate max-w-[220px] transition-colors ${selected === l.id ? "text-white font-medium" : "text-white/70"}`}>{l.name}</span>
                </div>
                <span className="text-[10px] text-white/30 flex-shrink-0">{l.lead_count.toLocaleString()} leads</span>
              </button>
            ))
          ))}
        </div>

        <div className="px-5 py-3 border-t border-white/8 flex items-center justify-between gap-2">
          <p className="text-[11px] text-white/25">
            {!creating && selected && (() => { const l = lists.find(x => x.id === selected); return l ? `Adding to "${l.name}"` : ""; })()}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={submitting} className="px-3 py-1.5 text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-40">Cancel</button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm || submitting}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                submitting
                  ? "bg-orange-500/30 border-orange-500/30 text-orange-300 cursor-not-allowed"
                  : canConfirm
                  ? "bg-orange-500 hover:bg-orange-400 border-orange-400 text-white shadow-sm shadow-orange-500/20"
                  : "bg-white/6 border-white/10 text-white/30 cursor-not-allowed"
              }`}
            >
              {submitting
                ? <span className="flex items-center gap-1.5"><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />Adding…</span>
                : creating
                ? (duplicateList ? "Add to Existing List" : "Create & Add")
                : "Add to List"
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Person drawer ─────────────────────────────────────────────────────────────

type DrawerTarget = { type: "person"; id: string } | { type: "company"; id: string };

function PersonDrawer({ id, onClose, onReveal, onViewCompany, onViewPerson, onAddToList, onAddToSequence, revealRate }: {
  id: string;
  onClose: () => void;
  onReveal: (id: string) => Promise<void>;
  onViewCompany: (companyId: string) => void;
  onViewPerson: (id: string) => void;
  onAddToList: (id: string) => void;
  onAddToSequence: (id: string) => void;
  revealRate: number;
}) {
  const [data, setData]         = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading]   = useState(true);
  const [revealing, setRevealing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await wsGet<Record<string, unknown>>(`/api/discover/people/${id}`)); }
    catch { /* ignore */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleReveal() {
    setRevealing(true);
    await onReveal(id);
    await load();
    setRevealing(false);
  }

  if (loading) return <div className="flex items-center justify-center h-40"><Spinner /></div>;
  if (!data)   return <div className="px-5 py-4 text-xs text-white/30">Could not load profile</div>;

  const revealed    = data.revealed as boolean;
  const email       = data.email_preview as string | null;
  const emailAlts   = (data.email_alts as string[] | null) ?? [];
  const phone       = data.phone_preview as string | null;
  const coworkers   = (data.coworkers as DiscoverResult[]) ?? [];
  const skills      = (data.skills as string | null)?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
  const interests   = (data.interests as string | null)?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
  const fullName    = [data.first_name as string | null, data.last_name as string | null].filter(Boolean).join(" ") || "Unknown";

  const liUrl  = normalizeUrl(data.linkedin_url as string | null);
  const fbUrl  = normalizeUrl(data.facebook_url as string | null);
  const twUrl  = normalizeUrl(data.twitter_url as string | null);
  const ghUrl  = normalizeUrl(data.github_url as string | null);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-4 border-b border-white/8">
        <div className="flex items-start gap-3">
          <Avatar first={data.first_name as string | null} last={data.last_name as string | null} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white">{fullName}</h3>
              {!!data.gender && <span className="text-[9px] text-white/30 uppercase tracking-wider">{data.gender as string}</span>}
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              {[data.title as string | null, data.sub_role as string | null].filter(Boolean).join(" · ") || "—"}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {!!data.seniority && (
                <span className="px-1.5 py-0.5 rounded bg-white/6 border border-white/8 text-[9px] text-white/40 uppercase tracking-wider">
                  {data.seniority as string}
                </span>
              )}
              {!!data.department && (
                <span className="px-1.5 py-0.5 rounded bg-white/6 border border-white/8 text-[9px] text-white/40">
                  {data.department as string}
                </span>
              )}
              {(data.years_experience as number | null) != null && (
                <span className="text-[10px] text-white/30">{data.years_experience as number} yrs exp</span>
              )}
              {(data.linkedin_connections as number | null) != null && (
                <span className="text-[10px] text-white/25">{(data.linkedin_connections as number).toLocaleString()} connections</span>
              )}
            </div>
            {/* Social links */}
            <div className="flex items-center gap-2.5 mt-2">
              {liUrl && (
                <a href={liUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-[10px] text-blue-400/60 hover:text-blue-400 transition-colors">
                  <LinkedInIcon /> LinkedIn
                </a>
              )}
              {fbUrl && (
                <a href={fbUrl} target="_blank" rel="noreferrer"
                  className="text-blue-600/60 hover:text-blue-400 transition-colors" title="Facebook">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
              )}
              {twUrl && (
                <a href={twUrl} target="_blank" rel="noreferrer"
                  className="text-sky-400/60 hover:text-sky-400 transition-colors" title="Twitter/X">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
              )}
              {ghUrl && (
                <a href={ghUrl} target="_blank" rel="noreferrer"
                  className="text-white/40 hover:text-white/70 transition-colors" title="GitHub">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                </a>
              )}
            </div>
          </div>
        </div>
        {!!(data.summary as string | null) && (
          <p className="mt-3 text-[11px] text-white/45 leading-relaxed line-clamp-4 italic">
            "{data.summary as string}"
          </p>
        )}
      </div>

      {/* ── Contact info ── */}
      <div className="px-5 py-4 border-b border-white/8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Contact Info</span>
          {!revealed ? (
            <button onClick={handleReveal} disabled={revealing}
              className="flex items-center gap-1.5 text-[10px] text-orange-400 hover:text-orange-300 font-semibold transition-colors disabled:opacity-50">
              {revealing ? <Spinner sm /> : <LockIcon />}
              Unlock · {revealRate} cr
            </button>
          ) : (
            <span className="text-[10px] text-green-400 font-semibold flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              Unlocked
            </span>
          )}
        </div>
        <div className="space-y-2.5">
          {(data.has_email as boolean) && (
            <div className="flex items-start gap-2.5">
              <svg className="w-3.5 h-3.5 text-white/25 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-mono ${revealed ? "text-white/80" : "text-white/30"}`}>{email ?? "—"}</span>
                </div>
                {emailAlts.map((alt, i) => (
                  <div key={i} className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[10px] font-mono ${revealed ? "text-white/55" : "text-white/20"}`}>{alt}</span>
                    <span className="text-[8px] text-white/20 uppercase tracking-wider">alt {i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(data.has_phone as boolean) && (
            <div className="flex items-center gap-2.5">
              <svg className="w-3.5 h-3.5 text-white/25 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
              <span className={`text-xs font-mono ${revealed ? "text-white/80" : "text-white/30"}`}>{phone ?? "—"}</span>
            </div>
          )}
          {!data.has_email && !data.has_phone && (
            <p className="text-xs text-white/20">No contact data available</p>
          )}
        </div>
      </div>

      {/* ── Current company ── */}
      {!!data.company_name && (
        <div className="px-5 py-4 border-b border-white/8">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider block mb-2.5">Current Company</span>
          <button onClick={() => data.company_id && onViewCompany(data.company_id as string)}
            className="flex items-center gap-2.5 hover:bg-white/4 rounded-xl px-3 py-2.5 -mx-3 transition-colors w-full text-left group">
            <CompanyLogo name={data.company_name as string} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-white/80 truncate">{data.company_name as string}</p>
                {!!data.company_id && <ChevronRightIcon />}
              </div>
              <p className="text-[10px] text-white/35 truncate">
                {[data.company_industry as string | null, data.company_size as string | null].filter(Boolean).join(" · ")}
              </p>
            </div>
            {!!(data.company_domain ?? data.company_website) && (
              <a href={normalizeUrl((data.company_domain ?? data.company_website) as string) ?? "#"}
                target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                className="text-[10px] text-blue-400/50 hover:text-blue-400 transition-colors flex-shrink-0 flex items-center gap-0.5">
                <ExternalLinkIcon />
              </a>
            )}
          </button>
          {!!(data.job_summary as string | null) && (
            <p className="text-[11px] text-white/35 leading-relaxed line-clamp-2 mt-2 px-1">{data.job_summary as string}</p>
          )}
          {!!(data.start_date as string | null) && (
            <p className="text-[10px] text-white/20 mt-1 px-1">Since {data.start_date as string}</p>
          )}
        </div>
      )}

      {/* ── Location ── */}
      {!!(data.city || data.country) && (
        <div className="px-5 py-3 border-b border-white/8">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider block mb-1">Location</span>
          <div className="flex items-center gap-1.5 text-xs text-white/50">
            <svg className="w-3.5 h-3.5 text-white/20 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            {[data.city as string | null, data.state as string | null, data.country as string | null].filter(Boolean).join(", ")}
          </div>
        </div>
      )}

      {/* ── Career stats ── */}
      {((data.inferred_salary as string | null) || (data.years_experience as number | null) != null || (data.birth_year as number | null) != null) && (
        <div className="px-5 py-4 border-b border-white/8">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider block mb-3">Career</span>
          <div className="grid grid-cols-3 gap-3">
            {!!(data.inferred_salary as string | null) && (
              <div className="bg-white/4 rounded-lg px-3 py-2 text-center">
                <p className="text-[9px] text-white/25 uppercase tracking-wider mb-0.5">Est. Salary</p>
                <p className="text-xs text-white/70 font-semibold">${data.inferred_salary as string}</p>
              </div>
            )}
            {(data.years_experience as number | null) != null && (
              <div className="bg-white/4 rounded-lg px-3 py-2 text-center">
                <p className="text-[9px] text-white/25 uppercase tracking-wider mb-0.5">Experience</p>
                <p className="text-xs text-white/70 font-semibold">{data.years_experience as number} yrs</p>
              </div>
            )}
            {(data.birth_year as number | null) != null && (
              <div className="bg-white/4 rounded-lg px-3 py-2 text-center">
                <p className="text-[9px] text-white/25 uppercase tracking-wider mb-0.5">Birth Year</p>
                <p className="text-xs text-white/70 font-semibold">{data.birth_year as number}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Skills ── */}
      {skills.length > 0 && (
        <div className="px-5 py-4 border-b border-white/8">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider block mb-2">Skills</span>
          <div className="flex flex-wrap gap-1">
            {skills.slice(0, 20).map(skill => (
              <span key={skill} className="px-1.5 py-0.5 rounded bg-white/6 border border-white/8 text-[9px] text-white/50">{skill}</span>
            ))}
            {skills.length > 20 && <span className="text-[9px] text-white/25">+{skills.length - 20} more</span>}
          </div>
        </div>
      )}

      {/* ── Interests ── */}
      {interests.length > 0 && (
        <div className="px-5 py-4 border-b border-white/8">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider block mb-2">Interests</span>
          <div className="flex flex-wrap gap-1">
            {interests.slice(0, 12).map(interest => (
              <span key={interest} className="px-1.5 py-0.5 rounded bg-blue-500/8 border border-blue-500/15 text-[9px] text-blue-300/60">{interest}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Coworkers ── */}
      {coworkers.length > 0 && (
        <div className="px-5 py-4 border-b border-white/8">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider block mb-2">
            People at {data.company_name as string}
          </span>
          <div className="space-y-1.5">
            {coworkers.map(cw => (
              <button key={cw.id} onClick={() => onViewPerson(cw.id)}
                className="w-full flex items-center gap-2.5 py-1 rounded-lg hover:bg-white/5 px-2 -mx-2 transition-colors text-left cursor-pointer">
                <Avatar first={cw.first_name} last={cw.last_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white/70 truncate hover:text-orange-300 transition-colors">{[cw.first_name, cw.last_name].filter(Boolean).join(" ")}</p>
                  <p className="text-[10px] text-white/35 truncate">{cw.title ?? "—"}</p>
                </div>
                {cw.has_email && <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cw.revealed ? "bg-green-400" : "bg-white/15"}`} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="px-5 py-4 flex flex-col gap-2">
        <button onClick={() => onAddToSequence(id)}
          className="w-full px-4 py-2 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white rounded-xl transition-colors">
          Add to Sequence
        </button>
        <button onClick={() => onAddToList(id)}
          className="w-full px-4 py-2 text-xs font-semibold bg-white/8 hover:bg-white/12 border border-white/10 text-white/70 rounded-xl transition-colors">
          Add to List
        </button>
      </div>
    </div>
  );
}

// ── Company drawer ────────────────────────────────────────────────────────────

function CompanyDrawer({ id, onClose, onRevealPerson, onViewPerson }: {
  id: string;
  onClose: () => void;
  onRevealPerson: (personId: string) => Promise<void>;
  onViewPerson: (personId: string) => void;
}) {
  const [data, setData]         = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading]   = useState(true);
  const [descExpanded, setDescExpanded] = useState(false);
  const [descClamped,  setDescClamped]  = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setDescExpanded(false);
    try { setData(await wsGet<Record<string, unknown>>(`/api/discover/companies/${id}`)); }
    catch { /* ignore */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!descRef.current) return;
    setDescClamped(descRef.current.scrollHeight > descRef.current.clientHeight + 2);
  }, [data]);

  if (loading) return <div className="flex items-center justify-center h-40"><Spinner /></div>;
  if (!data)   return <div className="px-5 py-4 text-xs text-white/30">Could not load company</div>;

  const people   = (data.people as DiscoverResult[]) ?? [];
  const liUrl    = normalizeUrl(data.linkedin_url as string | null);
  const website  = normalizeUrl((data.website_url ?? data.domain) as string | null);
  const keywords = (data.keywords as string | null)?.split(",").map(s => s.trim()).filter(Boolean) ?? [];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-4 border-b border-white/8">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/8 border border-white/8 flex items-center justify-center text-sm font-bold text-white/50 flex-shrink-0">
            {((data.name as string)?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white">{data.name as string}</h3>
            <div className="flex items-center gap-2.5 mt-1 flex-wrap">
              {website && (
                <a href={website} target="_blank" rel="noreferrer"
                  className="text-[11px] text-blue-400/60 hover:text-blue-400 transition-colors flex items-center gap-1">
                  {(data.domain as string) ?? website}
                  <ExternalLinkIcon />
                </a>
              )}
              {liUrl && (
                <a href={liUrl} target="_blank" rel="noreferrer"
                  className="text-[11px] text-blue-400/60 hover:text-blue-400 transition-colors flex items-center gap-1">
                  <LinkedInIcon size="xs" /> LinkedIn
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Meta pills */}
        <div className="flex flex-wrap gap-2 mt-3">
          {!!data.industry && (
            <span className="px-2 py-1 rounded-lg bg-white/6 border border-white/8 text-[10px] text-white/50">{data.industry as string}</span>
          )}
          {!!data.size_range && (
            <span className="px-2 py-1 rounded-lg bg-white/6 border border-white/8 text-[10px] text-white/50">{data.size_range as string} employees</span>
          )}
          {!!(data.funding_stage as string | null) && (
            <span className="px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/15 text-[10px] text-purple-300/70">{data.funding_stage as string}</span>
          )}
          {!!(data.country as string | null) && (
            <span className="px-2 py-1 rounded-lg bg-white/6 border border-white/8 text-[10px] text-white/50">
              {[data.city as string | null, data.country as string | null].filter(Boolean).join(", ")}
            </span>
          )}
        </div>

        {!!(data.description as string | null) && (
          <div className="mt-3">
            <p
              ref={descRef}
              className={`text-[11px] text-white/45 leading-relaxed transition-all ${descExpanded ? "" : "line-clamp-4"}`}
            >
              {data.description as string}
            </p>
            {(descClamped || descExpanded) && (
              <button
                onClick={() => setDescExpanded(e => !e)}
                className="mt-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
              >
                {descExpanded ? "See less" : "See more"}
              </button>
            )}
          </div>
        )}

        {/* Funding */}
        {((data.funding_total as number | null) != null || (data.revenue_usd as number | null) != null) && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {(data.funding_total as number | null) != null && (
              <div className="bg-white/4 rounded-lg px-3 py-2">
                <p className="text-[9px] text-white/25 uppercase tracking-wider mb-0.5">Total Funding</p>
                <p className="text-xs text-white/70 font-semibold">${((data.funding_total as number) / 1e6).toFixed(1)}M</p>
              </div>
            )}
            {(data.revenue_usd as number | null) != null && (
              <div className="bg-white/4 rounded-lg px-3 py-2">
                <p className="text-[9px] text-white/25 uppercase tracking-wider mb-0.5">Revenue</p>
                <p className="text-xs text-white/70 font-semibold">${((data.revenue_usd as number) / 1e6).toFixed(1)}M</p>
              </div>
            )}
          </div>
        )}

        {/* Keywords */}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {keywords.slice(0, 16).map(kw => (
              <span key={kw} className="px-1.5 py-0.5 rounded bg-white/6 border border-white/10 text-[9px] text-white/40">{kw}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── People ── */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
            Contacts ({(data.people_total as number).toLocaleString()})
          </span>
        </div>
        <div className="space-y-0.5">
          {people.map(p => (
            <div key={p.id}
              className="flex items-center gap-2.5 py-2 px-2 -mx-2 rounded-lg hover:bg-white/3 transition-colors cursor-pointer"
              onClick={() => onViewPerson(p.id)}>
              <Avatar first={p.first_name} last={p.last_name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white/75 truncate">{[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}</p>
                <p className="text-[10px] text-white/35 truncate">{p.title ?? "—"}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                {p.has_email && !p.revealed && (
                  <button onClick={() => onRevealPerson(p.id)} className="text-[9px] text-orange-400/70 hover:text-orange-400 transition-colors">
                    <LockIcon />
                  </button>
                )}
                {p.revealed && <div className="w-1.5 h-1.5 rounded-full bg-green-400" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function DiscoverContent() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  // If the URL is empty but we cached a previous search this session, restore it.
  // This is what makes navigating away and back to /discover not "feel like you were never there".
  const [initState] = useState(() => {
    const hasUrlParams = searchParams.toString().length > 0;
    if (hasUrlParams) return { ...filtersFromParams(searchParams), restored: null as DiscoverCacheEntry | null };
    const lastKey = typeof window !== "undefined" ? getLastSearchKey() : null;
    const entry = lastKey ? getCachedResult(lastKey) : null;
    if (entry) {
      const restoredParams = new URLSearchParams(entry.urlSearch);
      return { ...filtersFromParams(restoredParams), restored: entry };
    }
    return { ...filtersFromParams(searchParams), restored: null as DiscoverCacheEntry | null };
  });

  const [mode, setMode] = useState<"people" | "companies">(initState.mode);
  const [peopleFilters,  setPeopleFilters]  = useState<PeopleFilters>(initState.pf);
  const [companyFilters, setCompanyFilters] = useState<CompanyFilters>(initState.cf);
  const [hasSearched,   setHasSearched]   = useState(() => searchParams.toString().length > 0 || !!initState.restored);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  const [peopleSortBy,  setPeopleSortBy]  = useState("created_at");
  const [peopleSortDir, setPeopleSortDir] = useState<"asc" | "desc">("desc");
  const [coSortBy,      setCoSortBy]      = useState("people_count");
  const [coSortDir,     setCoSortDir]     = useState<"asc" | "desc">("desc");

  // Seed results from the cached entry so the page renders populated instantly on remount.
  const [results,        setResults]        = useState<DiscoverResult[]>(
    initState.restored?.mode === "people" ? initState.restored.results : [],
  );
  const [companyResults, setCompanyResults] = useState<DiscoverCompanyResult[]>(
    initState.restored?.mode === "companies" ? initState.restored.results : [],
  );
  const [total,          setTotal]          = useState(initState.restored?.total ?? 0);
  const [resultsCapped,  setResultsCapped]  = useState(initState.restored?.capped ?? false);
  const [page,           setPage]           = useState(initState.restored?.page ?? 1);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  // When we restore from cache we already have results — block the debounced effect's first auto-fetch.
  const skipNextAutoSearch = useRef<boolean>(!!initState.restored);

  const [selected,      setSelected]      = useState<Set<string>>(new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [hoveredRow,    setHoveredRow]    = useState<string | null>(null);
  const [exporting,     setExporting]     = useState(false);
  const [revealing,     setRevealing]     = useState(false);
  const [exportMsg,     setExportMsg]     = useState<{ ok: boolean; text: string } | null>(null);
  const [bulkProgress,  setBulkProgress]  = useState<{ current: number; total: number; label: string } | null>(null);
  const isInitialRender = useRef(true);
  const selectNRef      = useRef<HTMLDivElement>(null);
  const [balance,       setBalance]       = useState<number | null>(null);
  const [discoverRate,  setDiscoverRate]  = useState<number>(0.5);
  const [drawer,        setDrawer]        = useState<DrawerTarget | null>(null);
  const [showCampaign,  setShowCampaign]  = useState(false);
  const [campaignIds,   setCampaignIds]   = useState<string[] | null>(null);
  const [showList,      setShowList]      = useState(false);
  const [listIds,       setListIds]       = useState<string[] | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savingSearch,  setSavingSearch]  = useState(false);
  const [saveNameVal,   setSaveNameVal]   = useState("");
  const [showSaveInput,    setShowSaveInput]    = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showSelectNPicker, setShowSelectNPicker] = useState(false);
  const [selectNCustom,     setSelectNCustom]     = useState("");
  const [selectNCount,      setSelectNCount]      = useState<number | null>(null);

  const limit      = 25;
  const SEARCH_CAP = 50_000;
  // Deep OFFSET pagination on the 400M-row leads DB gets slow past a few thousand
  // rows (and counts are often capped at "50,000+", which would otherwise imply
  // 2,000 phantom pages). Cap browsing to a range that always loads reliably;
  // bulk needs go through Select-all / Export (ids-only, up to 50k).
  const MAX_NAV_PAGE = 200;
  const rawTotalPages = Math.max(1, Math.ceil((resultsCapped ? SEARCH_CAP : total) / limit));
  const totalPages    = Math.min(rawTotalPages, MAX_NAV_PAGE);
  const pagesCapped   = rawTotalPages > MAX_NAV_PAGE;
  const totalLabel = resultsCapped ? "50,000+" : total.toLocaleString();

  const activePeopleFilterCount =
    (peopleFilters.keyword ? 1 : 0) +
    peopleFilters.titleIncludes.length + peopleFilters.titleExcludes.length +
    peopleFilters.seniorities.length + peopleFilters.departments.length +
    peopleFilters.countryIncludes.length + peopleFilters.countryExcludes.length +
    peopleFilters.locationIncludes.length + peopleFilters.locationExcludes.length +
    peopleFilters.companyIncludes.length + peopleFilters.companyExcludes.length +
    peopleFilters.industryIncludes.length + peopleFilters.industryExcludes.length +
    peopleFilters.companySizes.length +
    peopleFilters.companyKeywordIncludes.length + peopleFilters.companyKeywordExcludes.length +
    (peopleFilters.emailStatus !== "any" ? 1 : 0);

  const activeCoFilterCount =
    (companyFilters.coKeyword ? 1 : 0) +
    companyFilters.coCountryIncludes.length + companyFilters.coCountryExcludes.length +
    companyFilters.coLocationIncludes.length + companyFilters.coLocationExcludes.length +
    companyFilters.coIndustryIncludes.length + companyFilters.coIndustryExcludes.length +
    companyFilters.coSizes.length + companyFilters.coFundingStages.length +
    companyFilters.coKeywordIncludes.length + companyFilters.coKeywordExcludes.length +
    (companyFilters.coEmployeeRange ? 1 : 0) + (companyFilters.coRevenueRange ? 1 : 0) +
    (companyFilters.coHasPeople ? 1 : 0);

  const activeFilterCount = mode === "people" ? activePeopleFilterCount : activeCoFilterCount;

  useEffect(() => {
    if (!showSelectNPicker) return;
    function onOutsideClick(e: MouseEvent) {
      if (selectNRef.current && !selectNRef.current.contains(e.target as Node))
        setShowSelectNPicker(false);
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [showSelectNPicker]);

  useEffect(() => {
    wsGet<{ lead_credits_balance: number }>("/api/settings/workspace")
      .then(d => setBalance(d.lead_credits_balance ?? 0)).catch(() => {});
    wsGet<{ rates?: { discover?: number } }>("/api/lead-campaigns/credits")
      .then(d => { if (d.rates?.discover) setDiscoverRate(d.rates.discover); }).catch(() => {});
    wsGet<SavedSearch[]>("/api/discover/saved-searches")
      .then(d => setSavedSearches(d ?? [])).catch(() => {});
    setRecentSearches(loadRecent());
  }, []);

  const searchPeople = useCallback(async (p = 1, skipCount = false) => {
    setLoading(true); setError(null); setSelected(new Set()); setSelectAllMode(false); setSelectNCount(null); setExportMsg(null);
    try {
      const f = peopleFilters;
      const params = new URLSearchParams();
      if (f.keyword)                       params.set("q",               f.keyword);
      if (f.titleIncludes.length)          params.set("title_include",    f.titleIncludes.join(","));
      if (f.titleExcludes.length)          params.set("title_exclude",    f.titleExcludes.join(","));
      if (f.seniorities.length)            params.set("seniority",         f.seniorities.join(","));
      if (f.senioritiesExclude.length)     params.set("seniority_exclude", f.senioritiesExclude.join(","));
      if (f.departments.length)            params.set("department",        f.departments.join(","));
      if (f.departmentsExclude.length)     params.set("department_exclude",f.departmentsExclude.join(","));
      if (f.countryIncludes.length)        params.set("country_include",  f.countryIncludes.join(","));
      if (f.countryExcludes.length)        params.set("country_exclude",  f.countryExcludes.join(","));
      if (f.locationIncludes.length)       params.set("location_include", f.locationIncludes.join(","));
      if (f.locationExcludes.length)       params.set("location_exclude", f.locationExcludes.join(","));
      if (f.companyIncludes.length)        params.set("company_include",  f.companyIncludes.join(","));
      if (f.companyExcludes.length)        params.set("company_exclude",  f.companyExcludes.join(","));
      if (f.industryIncludes.length)       params.set("industry_include", f.industryIncludes.join(","));
      if (f.industryExcludes.length)       params.set("industry_exclude", f.industryExcludes.join(","));
      if (f.companySizes.length)           params.set("company_size",       f.companySizes.join(","));
      if (f.companyKeywordIncludes.length) params.set("co_keyword_include", f.companyKeywordIncludes.join(","));
      if (f.companyKeywordExcludes.length) params.set("co_keyword_exclude", f.companyKeywordExcludes.join(","));
      params.set("email_status", f.emailStatus);
      if (f.netNew) params.set("net_new", "true");
      params.set("sort", peopleSortBy); params.set("order", peopleSortDir);
      params.set("page", String(p)); params.set("limit", String(limit));
      if (skipCount) params.set("skip_count", "true");

      const ckey = discoverCacheKey("people", params.toString());
      const filterUrl = filtersToParams("people", f, companyFilters).toString();
      // If a request for this exact key is already mid-flight (e.g. user just remounted),
      // join it instead of issuing a duplicate.
      const existing = getInflight(ckey) as Promise<DiscoverSearchResponse> | undefined;
      const fetchPromise: Promise<DiscoverSearchResponse> = existing ?? (
        wsGet<DiscoverSearchResponse>(`/api/discover/search?${params}`)
          .then(data => {
            // Cache writes even if the React component unmounts mid-fetch
            if (p === 1 && !skipCount) {
              setCachedResult(ckey, {
                mode: "people",
                page: p,
                total: data.total ?? 0,
                capped: !!data.message,
                results: data.results ?? [],
                ts: Date.now(),
                urlSearch: filterUrl,
              });
            }
            return data;
          })
      );
      if (!existing && p === 1) registerInflight(ckey, fetchPromise);

      const data = await fetchPromise;
      setResults(data.results ?? []);
      if (!skipCount) { setTotal(data.total ?? 0); setResultsCapped(!!data.message); }
      setPage(p);
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed"); }
    finally { setLoading(false); }
  }, [peopleFilters, peopleSortBy, peopleSortDir, companyFilters]);

  const searchCompanies = useCallback(async (p = 1, skipCount = false) => {
    setLoading(true); setError(null); setSelected(new Set()); setSelectAllMode(false); setSelectNCount(null); setExportMsg(null);
    try {
      const f = companyFilters;
      const params = new URLSearchParams();
      if (f.coKeyword)                 params.set("q",               f.coKeyword);
      if (f.coCountryIncludes.length)  params.set("country_include",  f.coCountryIncludes.join(","));
      if (f.coCountryExcludes.length)  params.set("country_exclude",  f.coCountryExcludes.join(","));
      if (f.coLocationIncludes.length) params.set("location_include", f.coLocationIncludes.join(","));
      if (f.coLocationExcludes.length) params.set("location_exclude", f.coLocationExcludes.join(","));
      if (f.coIndustryIncludes.length) params.set("industry_include", f.coIndustryIncludes.join(","));
      if (f.coIndustryExcludes.length) params.set("industry_exclude", f.coIndustryExcludes.join(","));
      if (f.coSizes.length)            params.set("company_size",    f.coSizes.join(","));
      if (f.coFundingStages.length)    params.set("funding_stage",    f.coFundingStages.join(","));
      if (f.coKeywordIncludes.length)  params.set("keyword_include",  f.coKeywordIncludes.join(","));
      if (f.coKeywordExcludes.length)  params.set("keyword_exclude",  f.coKeywordExcludes.join(","));
      if (f.coEmployeeRange?.min)      params.set("employee_min",    String(f.coEmployeeRange.min));
      if (f.coEmployeeRange?.max)      params.set("employee_max",    String(f.coEmployeeRange.max));
      if (f.coRevenueRange?.min)       params.set("revenue_min",     String(f.coRevenueRange.min));
      if (f.coRevenueRange?.max)       params.set("revenue_max",     String(f.coRevenueRange.max));
      params.set("has_people", String(f.coHasPeople));
      params.set("sort", coSortBy); params.set("order", coSortDir);
      params.set("page", String(p)); params.set("limit", String(limit));
      if (skipCount) params.set("skip_count", "true");

      const ckey = discoverCacheKey("companies", params.toString());
      const filterUrl = filtersToParams("companies", peopleFilters, f).toString();
      const existing = getInflight(ckey) as Promise<DiscoverCompanySearchResponse> | undefined;
      const fetchPromise: Promise<DiscoverCompanySearchResponse> = existing ?? (
        wsGet<DiscoverCompanySearchResponse>(`/api/discover/companies/search?${params}`)
          .then(data => {
            if (p === 1 && !skipCount) {
              setCachedResult(ckey, {
                mode: "companies",
                page: p,
                total: data.total ?? 0,
                capped: false,
                results: data.results ?? [],
                ts: Date.now(),
                urlSearch: filterUrl,
              });
            }
            return data;
          })
      );
      if (!existing && p === 1) registerInflight(ckey, fetchPromise);

      const data = await fetchPromise;
      setCompanyResults(data.results ?? []);
      if (!skipCount) setTotal(data.total ?? 0);
      setPage(p); setResultsCapped(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed"); }
    finally { setLoading(false); }
  }, [companyFilters, coSortBy, coSortDir, peopleFilters]);

  const search = mode === "people" ? searchPeople : searchCompanies;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasSearched) return;
    // Just restored from cache — skip the auto-search, but let subsequent filter changes re-run.
    if (skipNextAutoSearch.current) {
      skipNextAutoSearch.current = false;
      isInitialRender.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Fire immediately on first render (e.g. arriving via saved-search URL); debounce after
    const delay = isInitialRender.current ? 0 : 600;
    isInitialRender.current = false;
    debounceRef.current = setTimeout(() => search(1), delay);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleFilters, peopleSortBy, peopleSortDir, companyFilters, coSortBy, coSortDir, mode, hasSearched]);

  // Sync active filters → URL (write-only, won't loop back into state)
  const urlSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasSearched) return;
    if (urlSyncRef.current) clearTimeout(urlSyncRef.current);
    urlSyncRef.current = setTimeout(() => {
      const params = filtersToParams(mode, peopleFilters, companyFilters);
      router.replace(`?${params.toString()}`, { scroll: false });
    }, 400);
    return () => { if (urlSyncRef.current) clearTimeout(urlSyncRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, peopleFilters, companyFilters, hasSearched]);

  function clearAll() {
    if (mode === "people") setPeopleFilters(DEFAULT_PEOPLE_FILTERS);
    else setCompanyFilters(DEFAULT_COMPANY_FILTERS);
    setHasSearched(false);
    setResults([]); setCompanyResults([]); setTotal(0); setPage(1);
    router.replace("?", { scroll: false });
  }

  function triggerSearch(overrideFilters?: Partial<PeopleFilters & CompanyFilters>) {
    const pf = overrideFilters ? { ...peopleFilters, ...(overrideFilters as Partial<PeopleFilters>) } : peopleFilters;
    const cf = overrideFilters ? { ...companyFilters, ...(overrideFilters as Partial<CompanyFilters>) } : companyFilters;
    if (overrideFilters) {
      if (mode === "people") setPeopleFilters(pf);
      else setCompanyFilters(cf);
    }
    const label = makeSearchLabel(mode, pf, cf);
    const paramsStr = filtersToParams(mode, pf, cf).toString();
    if (paramsStr) pushRecent({ id: crypto.randomUUID(), label, paramsStr, ts: Date.now() });
    setRecentSearches(loadRecent());
    setHasSearched(true);
  }

  function applyRecentSearch(r: RecentSearch) {
    const parsed = new URLSearchParams(r.paramsStr);
    const { mode: m, pf, cf } = filtersFromParams(parsed);
    setMode(m);
    setPeopleFilters(pf);
    setCompanyFilters(cf);
    setHasSearched(true);
  }

  const visibleResults = mode === "people" ? results : companyResults;
  function toggleSelect(id: string) {
    setSelectAllMode(false); setSelectNCount(null);
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    if (selectAllMode || selectNCount !== null) { setSelectAllMode(false); setSelectNCount(null); setSelected(new Set()); return; }
    setSelected(selected.size === visibleResults.length ? new Set() : new Set(visibleResults.map(r => r.id)));
  }

  const SELECT_ALL_CAP = 50_000;

  async function fetchAllMatchingIds(limitOverride?: number): Promise<string[]> {
    const f = peopleFilters;
    const params = new URLSearchParams();
    if (f.keyword)                       params.set("q",               f.keyword);
    if (f.titleIncludes.length)          params.set("title_include",    f.titleIncludes.join(","));
    if (f.titleExcludes.length)          params.set("title_exclude",    f.titleExcludes.join(","));
    if (f.seniorities.length)            params.set("seniority",         f.seniorities.join(","));
    if (f.senioritiesExclude.length)     params.set("seniority_exclude", f.senioritiesExclude.join(","));
    if (f.departments.length)            params.set("department",        f.departments.join(","));
    if (f.departmentsExclude.length)     params.set("department_exclude",f.departmentsExclude.join(","));
    if (f.countryIncludes.length)        params.set("country_include",  f.countryIncludes.join(","));
    if (f.countryExcludes.length)        params.set("country_exclude",  f.countryExcludes.join(","));
    if (f.locationIncludes.length)       params.set("location_include", f.locationIncludes.join(","));
    if (f.locationExcludes.length)       params.set("location_exclude", f.locationExcludes.join(","));
    if (f.companyIncludes.length)        params.set("company_include",  f.companyIncludes.join(","));
    if (f.companyExcludes.length)        params.set("company_exclude",  f.companyExcludes.join(","));
    if (f.industryIncludes.length)       params.set("industry_include", f.industryIncludes.join(","));
    if (f.industryExcludes.length)       params.set("industry_exclude", f.industryExcludes.join(","));
    if (f.companySizes.length)           params.set("company_size",       f.companySizes.join(","));
    if (f.companyKeywordIncludes.length) params.set("co_keyword_include", f.companyKeywordIncludes.join(","));
    if (f.companyKeywordExcludes.length) params.set("co_keyword_exclude", f.companyKeywordExcludes.join(","));
    params.set("email_status", f.emailStatus);
    if (f.netNew) params.set("net_new", "true");
    params.set("ids_only", "true");
    params.set("limit", String(limitOverride ?? SELECT_ALL_CAP));
    const data = await wsGet<{ ids?: string[]; results?: { id: string }[] }>(`/api/discover/search?${params}`);
    return data.ids ?? (data.results ?? []).map(r => r.id);
  }

  // Safe wrapper around the ids-only fetch: shows a progress banner while the
  // server collects matching ids (can take a minute+ on heavy filter combos)
  // and surfaces failures as a visible message instead of an unhandled
  // rejection that leaves modals stuck on their spinner forever.
  // The server may take a few minutes on heavy filter combos (it collects ids
  // in per-company batches); tick an estimated progress forward so the banner
  // doesn't sit frozen at 0% — it caps at 95% until the response lands.
  function startSelectionEstimate(n: number): () => void {
    setBulkProgress({ current: 0, total: n, label: "Selecting" });
    const timer = setInterval(() => {
      setBulkProgress(p => p && p.label === "Selecting"
        ? { ...p, current: Math.min(p.current + Math.max(1, Math.round(n / 240)), Math.round(n * 0.95)) }
        : p);
    }, 1000);
    return () => { clearInterval(timer); setBulkProgress(null); };
  }

  async function collectSelectedPeopleIds(overrideIds?: string[]): Promise<string[] | null> {
    if (overrideIds) return overrideIds;
    if (selectNCount === null && !selectAllMode) return Array.from(selected);
    const n = selectNCount ?? Math.min(total, SELECT_ALL_CAP);
    const stop = startSelectionEstimate(n);
    try {
      return selectNCount !== null ? await fetchAllMatchingIds(selectNCount) : await fetchAllMatchingIds();
    } catch (e) {
      setExportMsg({ ok: false, text: `Couldn't select the matching leads — ${e instanceof Error ? e.message : "please retry"}. Try fewer filters or a smaller count.` });
      return null;
    } finally { stop(); }
  }

  async function collectSelectedCompanyIds(): Promise<string[] | null> {
    if (selectNCount === null && !selectAllMode) return Array.from(selected);
    const n = selectNCount ?? Math.min(total, SELECT_ALL_CAP);
    const stop = startSelectionEstimate(n);
    try {
      return selectNCount !== null ? await fetchAllMatchingCompanyIds(selectNCount) : await fetchAllMatchingCompanyIds();
    } catch (e) {
      setExportMsg({ ok: false, text: `Couldn't select the matching companies — ${e instanceof Error ? e.message : "please retry"}. Try fewer filters or a smaller count.` });
      return null;
    } finally { stop(); }
  }

  async function fetchAllMatchingCompanyIds(limitOverride?: number): Promise<string[]> {
    const f = companyFilters;
    const params = new URLSearchParams();
    if (f.coKeyword)                 params.set("q",               f.coKeyword);
    if (f.coCountryIncludes.length)  params.set("country_include",  f.coCountryIncludes.join(","));
    if (f.coCountryExcludes.length)  params.set("country_exclude",  f.coCountryExcludes.join(","));
    if (f.coLocationIncludes.length) params.set("location_include", f.coLocationIncludes.join(","));
    if (f.coLocationExcludes.length) params.set("location_exclude", f.coLocationExcludes.join(","));
    if (f.coIndustryIncludes.length) params.set("industry_include", f.coIndustryIncludes.join(","));
    if (f.coIndustryExcludes.length) params.set("industry_exclude", f.coIndustryExcludes.join(","));
    if (f.coSizes.length)            params.set("company_size",     f.coSizes.join(","));
    if (f.coFundingStages.length)    params.set("funding_stage",    f.coFundingStages.join(","));
    if (f.coKeywordIncludes.length)  params.set("keyword_include",  f.coKeywordIncludes.join(","));
    if (f.coKeywordExcludes.length)  params.set("keyword_exclude",  f.coKeywordExcludes.join(","));
    if (f.coEmployeeRange?.min)      params.set("employee_min",     String(f.coEmployeeRange.min));
    if (f.coEmployeeRange?.max)      params.set("employee_max",     String(f.coEmployeeRange.max));
    if (f.coRevenueRange?.min)       params.set("revenue_min",      String(f.coRevenueRange.min));
    if (f.coRevenueRange?.max)       params.set("revenue_max",      String(f.coRevenueRange.max));
    params.set("has_people", String(f.coHasPeople));
    params.set("ids_only", "true");
    params.set("limit", String(limitOverride ?? SELECT_ALL_CAP));
    const data = await wsGet<{ ids?: string[] }>(`/api/discover/companies/search?${params}`);
    return data.ids ?? [];
  }

  function handleSelectN(n: number) {
    setShowSelectNPicker(false);
    setSelectNCustom("");
    setSelectAllMode(false);
    setSelected(new Set());
    setSelectNCount(Math.min(n, total));
  }

  async function handleFindPeopleAtSelected() {
    const ids = await collectSelectedCompanyIds();
    if (!ids) return;
    const names = companyResults.filter(c => ids.includes(c.id)).map(c => c.name).filter(Boolean);
    setSelectAllMode(false);
    setSelected(new Set());
    setMode("people");
    if (names.length > 0) {
      setPeopleFilters(f => ({ ...f, companyIncludes: names }));
      setHasSearched(true);
    }
  }

  async function handleCompanyExport() {
    const allIds = await collectSelectedCompanyIds();
    if (!allIds?.length) return;
    setExporting(true); setExportMsg(null);
    const COMPANY_BATCH = 5000;
    try {
      for (let start = 0; start < allIds.length; start += COMPANY_BATCH) {
        const batch = allIds.slice(start, start + COMPANY_BATCH);
        if (allIds.length > COMPANY_BATCH) {
          setBulkProgress({ current: start + batch.length, total: allIds.length, label: "Exporting" });
        }
        const res = await wsFetch("/api/discover/companies/export", {
          method: "POST",
          body: JSON.stringify({ ids: batch }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const url  = URL.createObjectURL(blob);
          const part = allIds.length > COMPANY_BATCH ? `-part${Math.floor(start / COMPANY_BATCH) + 1}` : "";
          Object.assign(document.createElement("a"), { href: url, download: `leadash-companies-${Date.now()}${part}.csv` }).click();
          URL.revokeObjectURL(url);
          if (start + batch.length < allIds.length) await new Promise(r => setTimeout(r, 400));
        } else {
          const j = await res.json().catch(() => ({ error: res.statusText }));
          setExportMsg({ ok: false, text: j.error ?? "Export failed" });
          return;
        }
      }
      const parts = Math.ceil(allIds.length / COMPANY_BATCH);
      setExportMsg({ ok: true, text: `${allIds.length.toLocaleString()} companies exported${parts > 1 ? ` in ${parts} files` : ""}` });
      setSelected(new Set());
    } catch (e) {
      setExportMsg({ ok: false, text: e instanceof Error ? e.message : "Export failed" });
    } finally { setExporting(false); setBulkProgress(null); }
  }

  async function revealIds(ids: string[]) {
    setRevealing(true);
    if (ids.length > 500) setBulkProgress({ current: 0, total: ids.length, label: "Unlocking" });
    const REVEAL_BATCH  = 500;
    const CONCURRENCY   = 5;
    let completed = 0;
    try {
      for (let i = 0; i < ids.length; i += REVEAL_BATCH * CONCURRENCY) {
        const window: string[][] = [];
        for (let c = 0; c < CONCURRENCY && i + c * REVEAL_BATCH < ids.length; c++) {
          window.push(ids.slice(i + c * REVEAL_BATCH, i + (c + 1) * REVEAL_BATCH));
        }
        const batchResults = await Promise.all(window.map(async batch => {
          const res = await wsFetch("/api/discover/reveal", { method: "POST", body: JSON.stringify({ ids: batch }) });
          if (!res.ok) {
            const j = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(j.error ?? "Reveal failed");
          }
          return res.json() as Promise<{ reveals: Record<string, { email: string | null; phone: string | null; email_status: string | null }>; credits_used: number }>;
        }));
        for (const data of batchResults) {
          setResults(prev => prev.map(r => {
            const rev = data.reveals[r.id];
            if (!rev) return r;
            return { ...r, email_preview: rev.email, phone_preview: rev.phone, email_status: (rev.email_status as DiscoverResult["email_status"]) ?? r.email_status, revealed: true };
          }));
          if (data.credits_used > 0) { setBalance(b => (b ?? 0) - data.credits_used); emitCreditsChanged(); }
        }
        completed += window.reduce((s, b) => s + b.length, 0);
        setBulkProgress(p => p ? { ...p, current: Math.min(completed, ids.length) } : null);
      }
      setExportMsg({ ok: true, text: `${ids.length.toLocaleString()} lead${ids.length !== 1 ? "s" : ""} unlocked` });
    } catch (e) {
      setExportMsg({ ok: false, text: e instanceof Error ? e.message : "Reveal failed" });
    } finally { setRevealing(false); setBulkProgress(null); }
  }

  async function revealSelected() {
    const ids = await collectSelectedPeopleIds();
    if (!ids?.length) return;
    await revealIds(ids);
  }

  async function handleExport(format: "csv" | "campaign", campaignId?: string | null, campaignName?: string | null, overrideIds?: string[]) {
    // Close the pickers before the (possibly slow) id collection so their
    // spinners never hang on a failure — the progress banner takes over.
    setShowCampaign(false); setCampaignIds(null); setShowList(false); setListIds(null);
    const allIds = await collectSelectedPeopleIds(overrideIds);
    if (!allIds?.length) return;
    setExporting(true); setExportMsg(null);
    const EXPORT_BATCH = 2500;
    try {
      if (format === "csv") {
        if (allIds.length > EXPORT_BATCH) setBulkProgress({ current: 0, total: allIds.length, label: "Exporting" });
        let downloaded = 0;
        let firstError = "";
        let failedLeads = 0;
        for (let start = 0; start < allIds.length; start += EXPORT_BATCH) {
          const batch = allIds.slice(start, start + EXPORT_BATCH);
          const result = await postBatchWithRetry("/api/discover/export", { ids: batch, format: "csv" }, true);
          if (!result.ok) {
            // Auth / plan-gate / bad-request — abort the whole run because it
            // won't succeed on later batches either.
            if (!result.retryable) {
              setExportMsg({ ok: false, text: result.error ?? "Export failed" });
              return;
            }
            // Transient — record the failed batch, keep going with the rest.
            firstError = firstError || result.error;
            failedLeads += batch.length;
            setBulkProgress(p => p ? { ...p, current: Math.min(downloaded + failedLeads, allIds.length) } : null);
            continue;
          }
          const blob = result.blob!;
          const url  = URL.createObjectURL(blob);
          const part = allIds.length > EXPORT_BATCH ? `-part${Math.floor(start / EXPORT_BATCH) + 1}` : "";
          Object.assign(document.createElement("a"), { href: url, download: `leadash-discover-${Date.now()}${part}.csv` }).click();
          URL.revokeObjectURL(url);
          downloaded += batch.length;
          setBulkProgress(p => p ? { ...p, current: Math.min(downloaded + failedLeads, allIds.length) } : null);
          if (start + batch.length < allIds.length) await new Promise(r => setTimeout(r, 400));
        }
        const parts = Math.ceil(downloaded / EXPORT_BATCH);
        if (failedLeads > 0) {
          setExportMsg({
            ok: downloaded > 0,
            text: `${downloaded.toLocaleString()} exported · ${failedLeads.toLocaleString()} failed (${firstError || "network"}) — reselect the failed leads and retry`,
          });
        } else {
          setExportMsg({ ok: true, text: `${allIds.length.toLocaleString()} leads exported${parts > 1 ? ` in ${parts} files` : ""}` });
        }
        setSelected(new Set());
        return;
      }

      // Campaign format — batch in 2500-lead chunks
      if (allIds.length > EXPORT_BATCH) setBulkProgress({ current: 0, total: allIds.length, label: "Adding" });
      let resolvedCampaignId = campaignId ?? null;
      let totalAdded = 0;
      let firstError = "";
      let failedBatches = 0;
      for (let start = 0; start < allIds.length; start += EXPORT_BATCH) {
        const batch = allIds.slice(start, start + EXPORT_BATCH);
        const result = await postBatchWithRetry("/api/discover/export", {
          ids:           batch,
          format:        "campaign",
          campaign_id:   resolvedCampaignId,
          campaign_name: start === 0 ? campaignName : null,
        });
        if (!result.ok) {
          if (!result.retryable) {
            setExportMsg({ ok: false, text: result.error ?? "Export failed" });
            return;
          }
          firstError = firstError || result.error;
          failedBatches++;
          setBulkProgress(p => p ? { ...p, current: Math.min(start + batch.length, allIds.length) } : null);
          continue;
        }
        const j = result.json as { leads_added?: number; credits_used?: number; campaign_id?: string } | null;
        totalAdded += j?.leads_added ?? 0;
        if (!resolvedCampaignId && j?.campaign_id) resolvedCampaignId = j.campaign_id;
        if ((j?.credits_used ?? 0) > 0) { setBalance(b => (b ?? 0) - (j!.credits_used ?? 0)); emitCreditsChanged(); }
        setBulkProgress(p => p ? { ...p, current: Math.min(start + batch.length, allIds.length) } : null);
      }
      if (failedBatches > 0) {
        setExportMsg({
          ok: totalAdded > 0,
          text: `${totalAdded.toLocaleString()} added · ${failedBatches} batch${failedBatches !== 1 ? "es" : ""} failed (${firstError || "network"}) — retry to pick up the rest`,
        });
      } else {
        setExportMsg({ ok: true, text: `${totalAdded.toLocaleString()} leads added to campaign` });
      }
      setSelected(new Set());
    } catch (e) {
      setExportMsg({ ok: false, text: e instanceof Error ? e.message : "Export failed" });
    } finally { setExporting(false); setBulkProgress(null); }
  }

  async function handleAddToList(listId: string | null, listName: string | null, overrideIds?: string[]) {
    // Close the modal before the (possibly slow) id collection so it never
    // hangs on "Adding…" — the progress banner takes over.
    setShowList(false); setListIds(null);
    const allIds = await collectSelectedPeopleIds(overrideIds);
    if (!allIds?.length) return;
    setExporting(true); setExportMsg(null);
    const EXPORT_BATCH = 2500;
    if (allIds.length > EXPORT_BATCH) setBulkProgress({ current: 0, total: allIds.length, label: "Adding" });
    let totalAdded = 0;
    let totalExisting = 0;
    let resolvedListId = listId;
    try {
      let firstError = "";
      let failedBatches = 0;
      for (let start = 0; start < allIds.length; start += EXPORT_BATCH) {
        const batch = allIds.slice(start, start + EXPORT_BATCH);
        const result = await postBatchWithRetry("/api/discover/export", {
          ids:       batch,
          format:    "list",
          list_id:   resolvedListId,
          list_name: start === 0 ? listName : null,
        });
        if (!result.ok) {
          if (!result.retryable) {
            setExportMsg({ ok: false, text: result.error ?? "Failed to add to list" });
            return;
          }
          firstError = firstError || result.error;
          failedBatches++;
          setBulkProgress(p => p ? { ...p, current: Math.min(start + batch.length, allIds.length) } : null);
          continue;
        }
        const j = (result.json ?? {}) as { leads_added?: number; already_existed?: number; credits_used?: number; list_id?: string };
        totalAdded    += j.leads_added     ?? 0;
        totalExisting += j.already_existed ?? 0;
        if (!resolvedListId && j.list_id) resolvedListId = j.list_id;
        if ((j.credits_used ?? 0) > 0) { setBalance(b => (b ?? 0) - (j.credits_used ?? 0)); emitCreditsChanged(); }
        setBulkProgress(p => p ? { ...p, current: Math.min(start + batch.length, allIds.length) } : null);
      }
      let msg: string;
      if (failedBatches > 0) {
        msg = `${totalAdded.toLocaleString()} added · ${failedBatches} batch${failedBatches !== 1 ? "es" : ""} failed (${firstError || "network"}) — retry to pick up the rest`;
      } else if (totalAdded === 0 && totalExisting > 0) {
        msg = `All ${totalExisting.toLocaleString()} leads already in list`;
      } else {
        const parts = [`${totalAdded.toLocaleString()} lead${totalAdded !== 1 ? "s" : ""} added`];
        if (totalExisting > 0) parts.push(`${totalExisting.toLocaleString()} already existed`);
        msg = parts.join(" · ");
      }
      setExportMsg({ ok: failedBatches === 0, text: msg });
      setSelected(new Set());
    } catch (e) {
      setExportMsg({ ok: false, text: e instanceof Error ? e.message : "Failed to add to list" });
    } finally { setExporting(false); setBulkProgress(null); }
  }

  async function saveSearch() {
    if (!saveNameVal.trim()) return;
    setSavingSearch(true);
    try {
      const filters = mode === "people" ? peopleFilters : companyFilters;
      const res = await wsFetch("/api/discover/saved-searches", {
        method: "POST",
        body: JSON.stringify({ name: saveNameVal.trim(), mode, filters }),
      });
      if (res.ok) {
        const s = await res.json() as SavedSearch;
        setSavedSearches(prev => [s, ...prev]);
        setSaveNameVal(""); setShowSaveInput(false);
      }
    } finally { setSavingSearch(false); }
  }

  function applySavedSearch(s: SavedSearch) {
    setMode(s.mode);
    if (s.mode === "people") setPeopleFilters({ ...DEFAULT_PEOPLE_FILTERS, ...(s.filters as Partial<PeopleFilters>) });
    else setCompanyFilters({ ...DEFAULT_COMPANY_FILTERS, ...(s.filters as Partial<CompanyFilters>) });
    setHasSearched(true);
  }

  async function deleteSavedSearch(id: string) {
    await wsFetch(`/api/discover/saved-searches/${id}`, { method: "DELETE" });
    setSavedSearches(prev => prev.filter(s => s.id !== id));
  }

  const unrevealed    = results.filter(r => selected.has(r.id) && !r.revealed);
  const selectedCount = selectNCount !== null ? selectNCount : selectAllMode ? Math.min(total, SELECT_ALL_CAP) : selected.size;
  const unrevealedCount = (selectNCount !== null || selectAllMode) ? selectedCount : unrevealed.length;
  const revealCost  = Math.ceil(unrevealedCount * discoverRate * 10) / 10;

  function SortTh({ label, col, sortBy, sortDir, onSort, className = "" }: {
    label: string; col: string | null;
    sortBy: string; sortDir: "asc" | "desc";
    onSort: (col: string) => void;
    className?: string;
  }) {
    return (
      <th className={`px-3 py-2.5 text-left font-semibold text-white/30 whitespace-nowrap ${className}`}>
        {col ? (
          <button onClick={() => onSort(col)} className="flex items-center gap-1 hover:text-white/60 transition-colors group">
            {label}
            <span className="text-[9px] opacity-50 group-hover:opacity-100">
              {sortBy === col ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
            </span>
          </button>
        ) : label}
      </th>
    );
  }

  function handlePeopleSort(col: string) {
    if (peopleSortBy === col) setPeopleSortDir(d => d === "asc" ? "desc" : "asc");
    else { setPeopleSortBy(col); setPeopleSortDir("asc"); }
  }
  function handleCoSort(col: string) {
    if (coSortBy === col) setCoSortDir(d => d === "asc" ? "desc" : "asc");
    else { setCoSortBy(col); setCoSortDir("desc"); }
  }

  const sidebarInner = (
    <>
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/8">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold text-white/70">Filters</span>
          <div className="flex items-center gap-2">
            {balance !== null && (
              <span className="text-[11px] text-amber-400 font-semibold tabular-nums">{balance.toLocaleString()} cr</span>
            )}
            {activeFilterCount > 0 && (
              <button onClick={clearAll} className="text-[10px] text-white/35 hover:text-orange-400 transition-colors">Clear all</button>
            )}
          </div>
        </div>
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
          </svg>
          <input
            value={mode === "people" ? peopleFilters.keyword : companyFilters.coKeyword}
            onChange={e => mode === "people"
              ? setPeopleFilters(f => ({ ...f, keyword: e.target.value }))
              : setCompanyFilters(f => ({ ...f, coKeyword: e.target.value }))
            }
            placeholder={mode === "people" ? "Name, title, company…" : "Company name, domain…"}
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white/70 placeholder-white/25 focus:outline-none focus:border-orange-500/40 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {mode === "people" ? (
          <PeopleSidebar filters={peopleFilters} onChange={setPeopleFilters}
            onAiApply={(partial) => setPeopleFilters(f => ({ ...f, ...partial }))} />
        ) : (
          <CompanySidebar filters={companyFilters} onChange={setCompanyFilters}
            onAiApply={(partial) => setCompanyFilters(f => ({ ...f, ...partial }))} />
        )}

        <div className="border-b border-white/6">
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[11px] font-semibold text-white/45 uppercase tracking-wider">Saved Searches</span>
            <button onClick={() => setShowSaveInput(s => !s)} className="text-[10px] text-white/30 hover:text-orange-400 transition-colors">
              {showSaveInput ? "Cancel" : "+ Save"}
            </button>
          </div>
          {showSaveInput && (
            <div className="px-3 pb-2 flex gap-1.5">
              <input value={saveNameVal} onChange={e => setSaveNameVal(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveSearch()} placeholder="Search name…"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white/70 placeholder-white/25 focus:outline-none focus:border-orange-500/40" />
              <button onClick={saveSearch} disabled={savingSearch || !saveNameVal.trim()}
                className="px-2 py-1 text-[10px] font-bold bg-orange-500 text-white rounded-lg disabled:opacity-40">
                {savingSearch ? "…" : "Save"}
              </button>
            </div>
          )}
          {savedSearches.length > 0 ? (
            <div className="pb-1">
              {savedSearches.map(s => (
                <div key={s.id} className="flex items-center group px-4 py-1.5 hover:bg-white/3 transition-colors">
                  <button onClick={() => applySavedSearch(s)} className="flex-1 text-left text-xs text-white/50 hover:text-white/80 truncate">{s.name}</button>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] text-white/25">{s.mode}</span>
                    <button onClick={() => deleteSavedSearch(s.id)} className="text-white/20 hover:text-red-400 transition-colors"><XIcon sm /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 pb-3 text-[10px] text-white/20">No saved searches yet</p>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="v2-app" style={{ position: "absolute", inset: 0, background: "var(--app-bg)" }}>
    <div className="absolute inset-0 flex overflow-hidden">

      {/* ── Mobile filter overlay ── */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[280px] bg-[#0E0E13] flex flex-col border-r border-white/10 shadow-2xl z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 flex-shrink-0">
              <span className="text-sm font-bold text-white/80">Filters</span>
              <button onClick={() => setMobileFiltersOpen(false)} className="text-white/40 hover:text-white/70 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {sidebarInner}
          </div>
        </div>
      )}

      {/* ── Left sidebar (desktop only) ── */}
      <div className="hidden lg:flex w-[240px] flex-shrink-0 border-r border-white/8 flex-col">
        {sidebarInner}
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">

        {/* Toolbar */}
        <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 lg:px-5 py-2.5 border-b border-white/8">
          <div className="flex items-center gap-2 lg:gap-3">
            {/* Mobile filter toggle */}
            <button
              onClick={() => setMobileFiltersOpen(true)}
              className="lg:hidden relative flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
              aria-label="Open filters"
            >
              <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 bg-orange-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <h1 className="text-sm font-bold text-white/80">Discover</h1>
            <span className="text-[10px] text-white/25 font-medium hidden sm:inline">400M+ contacts</span>
            <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
              {(["people", "companies"] as const).map(m => (
                <button key={m} onClick={() => { setMode(m); setSelected(new Set()); }}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors capitalize ${mode === m ? "bg-white/10 text-white" : "text-white/35 hover:text-white/60"}`}>
                  {m}
                </button>
              ))}
            </div>
            {loading ? <Spinner sm /> : (
              <span className="text-xs text-white/35 tabular-nums">{total > 0 ? `${totalLabel} ${mode}` : ""}</span>
            )}
            {hasSearched && total > 0 && !loading && (
              <div className="relative" ref={selectNRef}>
                <button
                  onClick={() => setShowSelectNPicker(s => !s)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-white/45 hover:text-white/75 hover:bg-white/6 border border-white/10 rounded-lg transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h8m-8 6h16"/>
                  </svg>
                  Custom select
                </button>
                {showSelectNPicker && (
                  <div className="absolute top-full left-0 mt-1 w-48 bg-[#15182a] border border-white/12 rounded-xl shadow-2xl z-30 py-1.5">
                    {([100, 500, 1000, 5000] as const).map(n => (
                      <button key={n} onClick={() => handleSelectN(n)}
                        disabled={n > total}
                        className="w-full text-left px-3 py-1.5 text-xs text-white/60 hover:bg-white/6 hover:text-white transition-colors disabled:opacity-25 disabled:cursor-not-allowed">
                        {n.toLocaleString()} {mode}
                      </button>
                    ))}
                    <div className="border-t border-white/8 mt-1 pt-1.5 px-2 pb-1.5">
                      <div className="flex gap-1.5">
                        <input
                          value={selectNCustom}
                          onChange={e => setSelectNCustom(e.target.value.replace(/\D/g, ""))}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              const n = Math.min(parseInt(selectNCustom) || 0, SELECT_ALL_CAP);
                              if (n > 0) handleSelectN(n);
                            }
                          }}
                          placeholder="Custom number…"
                          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/70 placeholder-white/25 focus:outline-none focus:border-orange-500/40"
                        />
                        <button
                          onClick={() => {
                            const n = Math.min(parseInt(selectNCustom) || 0, SELECT_ALL_CAP);
                            if (n > 0) handleSelectN(n);
                          }}
                          disabled={!selectNCustom || parseInt(selectNCustom) <= 0}
                          className="px-2.5 py-1 text-[10px] font-bold bg-orange-500 hover:bg-orange-400 text-white rounded-lg disabled:opacity-40 transition-colors"
                        >
                          Go
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {(selected.size > 0 || selectAllMode || selectNCount !== null) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-orange-300 font-medium whitespace-nowrap">{selectedCount.toLocaleString()} selected</span>
              {mode === "people" ? (
                <>
                  {unrevealedCount > 0 && (
                    <button onClick={revealSelected} disabled={revealing || exporting}
                      title="Already revealed leads cost 0 credits"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-300 rounded-lg transition-colors disabled:opacity-50">
                      {revealing ? <Spinner sm /> : <LockIcon open />}
                      <span className="hidden sm:inline">Unlock {unrevealedCount.toLocaleString()} · </span>{revealCost} cr
                    </button>
                  )}
                  <button onClick={() => { setCampaignIds(null); setShowCampaign(true); }} disabled={exporting || revealing}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-white/8 hover:bg-white/12 border border-white/12 text-white/70 rounded-lg transition-colors disabled:opacity-50">
                    <span className="hidden sm:inline">Add to </span>Sequence
                  </button>
                  <button onClick={() => { setListIds(null); setShowList(true); }} disabled={exporting || revealing}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-white/8 hover:bg-white/12 border border-white/12 text-white/70 rounded-lg transition-colors disabled:opacity-50">
                    <span className="hidden sm:inline">Add to </span>List
                  </button>
                  <button onClick={() => handleExport("csv")} disabled={exporting || revealing}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white rounded-lg transition-colors disabled:opacity-50">
                    {exporting ? "…" : "Export"}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={handleFindPeopleAtSelected} disabled={exporting || revealing}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-white/8 hover:bg-white/12 border border-white/12 text-white/70 rounded-lg transition-colors disabled:opacity-50">
                    Find People
                  </button>
                  <button onClick={handleCompanyExport} disabled={exporting || revealing}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white rounded-lg transition-colors disabled:opacity-50">
                    {exporting ? "…" : "Export CSV"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {bulkProgress && (
          <div className="flex-shrink-0 px-5 py-2.5 border-b border-white/8 bg-[#0E0E13]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-white/50">{bulkProgress.label} {bulkProgress.current.toLocaleString()} / {bulkProgress.total.toLocaleString()}</span>
              <span className="text-xs text-white/30 tabular-nums">{Math.round(bulkProgress.current / bulkProgress.total * 100)}%</span>
            </div>
            <div className="h-1 bg-white/8 rounded-full overflow-hidden">
              <div className="h-full bg-orange-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.round(bulkProgress.current / bulkProgress.total * 100)}%` }} />
            </div>
          </div>
        )}
        {exportMsg && (
          <div className={`flex-shrink-0 flex items-center justify-between px-5 py-2 text-xs ${exportMsg.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
            <span>{exportMsg.text}</span>
            <button onClick={() => setExportMsg(null)} className="opacity-60 hover:opacity-100"><XIcon sm /></button>
          </div>
        )}
        {error && <div className="flex-shrink-0 px-5 py-2 bg-red-500/10 text-red-400 text-xs">{error}</div>}

        {/* ── Empty state ── */}
        {!hasSearched && (
          <EmptyState
            mode={mode}
            activeFilterCount={activeFilterCount}
            recentSearches={recentSearches}
            savedSearches={savedSearches}
            onTriggerSearch={triggerSearch}
            onApplyRecent={applyRecentSearch}
            onApplySaved={applySavedSearch}
            onSetMode={m => { setMode(m); setSelected(new Set()); }}
          />
        )}

        {/* ── Select-N banner ── */}
        {selectNCount !== null && (
          <div className="flex-shrink-0 flex items-center justify-center gap-2 px-5 py-2 bg-orange-500/8 border-b border-orange-500/15 text-xs">
            <span className="text-orange-300 font-semibold">First {selectNCount.toLocaleString()} matching {mode} selected.</span>
            <button onClick={() => { setSelectNCount(null); setSelected(new Set()); }} className="text-white/40 hover:text-white/60 underline transition-colors">
              Clear selection
            </button>
          </div>
        )}
        {/* ── Select-all banner ── */}
        {mode === "people" && !selectAllMode && selectNCount === null && selected.size === results.length && results.length > 0 && total > results.length && (
          <div className="flex-shrink-0 flex items-center justify-center gap-2 px-5 py-2 bg-orange-500/8 border-b border-orange-500/15 text-xs">
            <span className="text-white/50">All {results.length} on this page selected.</span>
            <button onClick={() => setSelectAllMode(true)} className="text-orange-400 hover:text-orange-300 font-semibold transition-colors">
              Select all {Math.min(total, SELECT_ALL_CAP).toLocaleString()} matching leads
            </button>
          </div>
        )}
        {mode === "people" && selectAllMode && (
          <div className="flex-shrink-0 flex items-center justify-center gap-2 px-5 py-2 bg-orange-500/8 border-b border-orange-500/15 text-xs">
            <span className="text-orange-300 font-semibold">All {Math.min(total, SELECT_ALL_CAP).toLocaleString()} matching leads selected.</span>
            <button onClick={() => { setSelectAllMode(false); setSelected(new Set()); }} className="text-white/40 hover:text-white/60 underline transition-colors">
              Clear selection
            </button>
          </div>
        )}
        {mode === "companies" && !selectAllMode && selectNCount === null && selected.size === companyResults.length && companyResults.length > 0 && total > companyResults.length && (
          <div className="flex-shrink-0 flex items-center justify-center gap-2 px-5 py-2 bg-orange-500/8 border-b border-orange-500/15 text-xs">
            <span className="text-white/50">All {companyResults.length} on this page selected.</span>
            <button onClick={() => setSelectAllMode(true)} className="text-orange-400 hover:text-orange-300 font-semibold transition-colors">
              Select all {Math.min(total, SELECT_ALL_CAP).toLocaleString()} matching companies
            </button>
          </div>
        )}
        {mode === "companies" && selectAllMode && (
          <div className="flex-shrink-0 flex items-center justify-center gap-2 px-5 py-2 bg-orange-500/8 border-b border-orange-500/15 text-xs">
            <span className="text-orange-300 font-semibold">All {Math.min(total, SELECT_ALL_CAP).toLocaleString()} matching companies selected.</span>
            <button onClick={() => { setSelectAllMode(false); setSelected(new Set()); }} className="text-white/40 hover:text-white/60 underline transition-colors">
              Clear selection
            </button>
          </div>
        )}

        {/* ── People / Companies table ── */}
        <div className={`flex-1 min-h-0 overflow-auto ${!hasSearched ? "hidden" : ""}`}>
          {mode === "people" ? (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-[#0E0E13] border-b border-white/8">
                <tr>
                  <th className="w-10 px-3 py-2.5 sticky left-0 z-20 bg-[#0E0E13]">
                    <input type="checkbox" checked={results.length > 0 && (selectAllMode || selectNCount !== null || selected.size === results.length)}
                      onChange={toggleAll} className="accent-orange-500 w-3.5 h-3.5" />
                  </th>
                  <SortTh label="Name" col="name" sortBy={peopleSortBy} sortDir={peopleSortDir} onSort={handlePeopleSort}
                    className="sticky left-10 z-20 bg-[#0E0E13] relative after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-white/[0.06]" />
                  <SortTh label="Title"    col="title"        sortBy={peopleSortBy} sortDir={peopleSortDir} onSort={handlePeopleSort} />
                  <SortTh label="Company"  col="company_name" sortBy={peopleSortBy} sortDir={peopleSortDir} onSort={handlePeopleSort} />
                  <SortTh label="Location" col="location"     sortBy={peopleSortBy} sortDir={peopleSortDir} onSort={handlePeopleSort} />
                  <th className="px-3 py-2.5 text-left font-semibold text-white/30">Keywords</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-white/30">Email</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-white/30">Size</th>
                  <th className="w-28 px-3 py-2.5 text-left font-semibold text-white/30">Actions</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 && !loading && (
                  <tr><td colSpan={9} className="px-5 py-16 text-center text-white/20 text-sm">
                    {activeFilterCount > 0 ? "No results for these filters" : "Search or apply filters to find leads"}
                  </td></tr>
                )}
                {results.map(r => {
                  const liUrl = normalizeUrl(r.linkedin_url);
                  const isHovered = hoveredRow === r.id;
                  const isSelected = selectAllMode || selectNCount !== null || selected.has(r.id);
                  const isActive = drawer?.type === "person" && drawer.id === r.id;
                  return (
                    <tr key={r.id}
                      onMouseEnter={() => setHoveredRow(r.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                      className={`border-b border-white/4 transition-colors ${isSelected ? "bg-orange-500/5" : isActive ? "bg-white/4" : isHovered ? "bg-white/3" : ""}`}>
                      <td className="px-3 py-2.5 sticky left-0 z-[5] bg-[#0E0E13]/80 backdrop-blur-md">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)} className="accent-orange-500 w-3.5 h-3.5" />
                      </td>

                      {/* Name */}
                      <td className="px-3 py-2.5 sticky left-10 z-[5] relative bg-[#0E0E13]/80 backdrop-blur-md after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-white/[0.06]">
                        <div className="flex items-center gap-2">
                          <Avatar first={r.first_name} last={r.last_name} size="sm" />
                          <button
                            onClick={() => setDrawer({ type: "person", id: r.id })}
                            className="font-medium text-white/85 hover:text-orange-300 transition-colors truncate max-w-[120px] text-left"
                          >
                            {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                          </button>
                          {liUrl && (
                            <a href={liUrl} target="_blank" rel="noreferrer"
                              className="text-blue-400/40 hover:text-blue-400 transition-colors flex-shrink-0">
                              <LinkedInIcon />
                            </a>
                          )}
                          {r.exported && (
                            <span className="text-[8px] text-green-400/60 font-bold uppercase tracking-wide flex-shrink-0">✓</span>
                          )}
                        </div>
                      </td>

                      {/* Title */}
                      <td className="px-3 py-2.5">
                        <span className="text-white/50 truncate block max-w-[160px]">{r.title ?? "—"}</span>
                        {r.seniority && (
                          <span className="text-white/25 text-[9px] uppercase tracking-wider">{r.seniority}</span>
                        )}
                      </td>

                      {/* Company */}
                      <td className="px-3 py-2.5">
                        {r.company_name ? (
                          <div className="flex items-center gap-1.5">
                            <CompanyLogo name={r.company_name} />
                            <div className="min-w-0">
                              <button
                                onClick={() => r.company_id && setDrawer({ type: "company", id: r.company_id })}
                                className={`text-white/65 truncate block max-w-[120px] text-left transition-colors ${r.company_id ? "hover:text-orange-300 cursor-pointer" : "cursor-default"}`}
                              >
                                {r.company_name}
                              </button>
                              {r.company_industry && (
                                <span className="text-white/25 text-[9px] truncate block max-w-[120px]">{r.company_industry}</span>
                              )}
                            </div>
                          </div>
                        ) : <span className="text-white/20">—</span>}
                      </td>

                      {/* Location */}
                      <td className="px-3 py-2.5">
                        <span className="text-white/40 truncate block max-w-[140px]">
                          {[r.city, r.country].filter(Boolean).join(", ") || "—"}
                        </span>
                      </td>

                      {/* Keywords */}
                      <td className="px-3 py-2.5 max-w-[160px]">
                        {r.company_keywords
                          ? <span className="text-white/35 text-[10px] truncate block" title={r.company_keywords}>{r.company_keywords}</span>
                          : <span className="text-white/15">—</span>}
                      </td>

                      {/* Email */}
                      <td className="px-3 py-2.5">
                        {r.has_email ? (
                          <div className="flex items-center gap-1.5">
                            {!r.revealed ? (
                              <button onClick={() => revealIds([r.id])} disabled={revealing}
                                className="flex items-center gap-1 text-white/20 hover:text-orange-400 transition-colors">
                                <LockIcon />
                                <span className="font-mono text-[10px]">{r.email_preview}</span>
                              </button>
                            ) : (
                              <span className="font-mono text-white/75 text-[11px]">{r.email_preview}</span>
                            )}
                          </div>
                        ) : <span className="text-white/15">—</span>}
                      </td>

                      {/* Company size */}
                      <td className="px-3 py-2.5">
                        {r.company_size
                          ? <span className="text-white/40 text-xs">{r.company_size}</span>
                          : <span className="text-white/15">—</span>}
                      </td>

                      {/* Actions — visible on hover */}
                      <td className="px-3 py-2.5">
                        <div className={`flex items-center gap-1 transition-opacity ${isHovered || isSelected ? "opacity-100" : "opacity-0"}`}>
                          <button
                            onClick={() => { setCampaignIds([r.id]); setShowCampaign(true); }}
                            title="Add to sequence"
                            className="px-2 py-1 text-[9px] font-semibold bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/20 text-orange-400 rounded transition-colors whitespace-nowrap">
                            + Sequence
                          </button>
                          <button
                            onClick={() => { setListIds([r.id]); setShowList(true); }}
                            title="Add to list"
                            className="px-2 py-1 text-[9px] font-semibold bg-white/6 hover:bg-white/10 border border-white/10 text-white/50 rounded transition-colors whitespace-nowrap">
                            + List
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            /* ── Companies table ── */
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-[#0E0E13] border-b border-white/8">
                <tr>
                  <th className="w-10 px-3 py-2.5 sticky left-0 z-20 bg-[#0E0E13]">
                    <input type="checkbox" checked={companyResults.length > 0 && (selectAllMode || selected.size === companyResults.length)}
                      onChange={toggleAll} className="accent-orange-500 w-3.5 h-3.5" />
                  </th>
                  <SortTh label="Company" col="name" sortBy={coSortBy} sortDir={coSortDir} onSort={handleCoSort}
                    className="sticky left-10 z-20 bg-[#0E0E13] relative after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-white/[0.06]" />
                  <SortTh label="Industry" col="industry"     sortBy={coSortBy} sortDir={coSortDir} onSort={handleCoSort} />
                  <SortTh label="Size"     col="size"         sortBy={coSortBy} sortDir={coSortDir} onSort={handleCoSort} />
                  <SortTh label="Location" col="location"     sortBy={coSortBy} sortDir={coSortDir} onSort={handleCoSort} />
                  <SortTh label="Funding"  col="funding"      sortBy={coSortBy} sortDir={coSortDir} onSort={handleCoSort} />
                  <SortTh label="Contacts" col="people_count" sortBy={coSortBy} sortDir={coSortDir} onSort={handleCoSort} />
                  <th className="w-24 px-3 py-2.5 text-left font-semibold text-white/30">Actions</th>
                </tr>
              </thead>
              <tbody>
                {companyResults.length === 0 && !loading && (
                  <tr><td colSpan={8} className="px-5 py-16 text-center text-white/20 text-sm">
                    {activeFilterCount > 0 ? "No companies for these filters" : "Search or apply filters to find companies"}
                  </td></tr>
                )}
                {companyResults.map(c => {
                  const liUrl = normalizeUrl(c.linkedin_url);
                  const isHovered  = hoveredRow === c.id;
                  const isSelected = selectAllMode || selectNCount !== null || selected.has(c.id);
                  const isActive   = drawer?.type === "company" && drawer.id === c.id;
                  return (
                    <tr key={c.id}
                      onMouseEnter={() => setHoveredRow(c.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                      className={`border-b border-white/4 transition-colors ${isSelected ? "bg-orange-500/5" : isActive ? "bg-white/4" : isHovered ? "bg-white/3" : ""}`}>
                      <td className="px-3 py-2.5 sticky left-0 z-[5] bg-[#0E0E13]/80 backdrop-blur-md">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(c.id)} className="accent-orange-500 w-3.5 h-3.5" />
                      </td>

                      {/* Company name */}
                      <td className="px-3 py-2.5 sticky left-10 z-[5] relative bg-[#0E0E13]/80 backdrop-blur-md after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-white/[0.06]">
                        <div className="flex items-center gap-2">
                          <CompanyLogo name={c.name} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setDrawer({ type: "company", id: c.id })}
                                className="font-medium text-white/85 hover:text-orange-300 transition-colors truncate max-w-[140px] text-left">
                                {c.name}
                              </button>
                              {liUrl && (
                                <a href={liUrl} target="_blank" rel="noreferrer"
                                  className="text-blue-400/40 hover:text-blue-400 transition-colors flex-shrink-0">
                                  <LinkedInIcon />
                                </a>
                              )}
                            </div>
                            {c.domain && <span className="text-white/25 text-[10px] truncate block">{c.domain}</span>}
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-2.5 text-white/50 max-w-[160px] truncate">{c.industry ?? "—"}</td>
                      <td className="px-3 py-2.5 text-white/40 whitespace-nowrap">{c.size_range ?? "—"}</td>
                      <td className="px-3 py-2.5"><span className="text-white/40 truncate block max-w-[140px]">{[c.city, c.country].filter(Boolean).join(", ") || "—"}</span></td>

                      {/* Funding */}
                      <td className="px-3 py-2.5">
                        {c.funding_stage ? (
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/15 text-[9px] text-purple-300/70">
                            {c.funding_stage}
                          </span>
                        ) : <span className="text-white/20">—</span>}
                      </td>

                      {/* Contacts */}
                      <td className="px-3 py-2.5">
                        <button onClick={() => {
                          setMode("people");
                          setPeopleFilters(f => ({ ...f, companyIncludes: [c.name] }));
                        }} className="flex items-center gap-1 text-orange-400/70 hover:text-orange-400 transition-colors">
                          <span className="font-semibold">{c.people_count.toLocaleString()}</span>
                          <span className="text-white/25 text-[10px]">contacts</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5">
                        <div className={`flex items-center gap-1 transition-opacity ${isHovered || isSelected ? "opacity-100" : "opacity-0"}`}>
                          <button
                            onClick={() => setDrawer({ type: "company", id: c.id })}
                            className="px-2 py-1 text-[9px] font-semibold bg-white/6 hover:bg-white/10 border border-white/10 text-white/50 rounded transition-colors">
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {hasSearched && totalPages > 1 && (
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-2.5 border-t border-white/8 bg-[#0E0E13]">
            <span className="text-xs text-white/25">
              Page {page} of {totalPages.toLocaleString()} · {totalLabel} total
              {pagesCapped && <span className="text-white/20"> · use Select all / Export for the rest</span>}
            </span>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1 || loading} onClick={() => search(1, true)}
                className="px-2 py-1 text-[11px] text-white/40 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed">«</button>
              <button disabled={page <= 1 || loading} onClick={() => search(page - 1, true)}
                className="px-2.5 py-1 text-xs text-white/40 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed">‹ Prev</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p2 = start + i;
                return (
                  <button key={p2} disabled={loading} onClick={() => search(p2, true)}
                    className={`w-7 h-7 text-xs rounded transition-colors ${p2 === page ? "bg-orange-500 text-white" : "text-white/40 hover:text-white hover:bg-white/8"}`}>
                    {p2}
                  </button>
                );
              })}
              <button disabled={page >= totalPages || loading} onClick={() => search(page + 1, true)}
                className="px-2.5 py-1 text-xs text-white/40 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed">Next ›</button>
              <button disabled={page >= totalPages || loading} onClick={() => search(totalPages, true)}
                className="px-2 py-1 text-[11px] text-white/40 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed">»</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Right drawer ── */}
      <div className="fixed inset-0 z-40 pointer-events-none">
        {/* Backdrop */}
        <div
          className={`absolute inset-0 backdrop-blur-[2px] bg-black/30 transition-opacity duration-200 ${drawer ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
          onClick={() => setDrawer(null)}
        />
        {/* Panel */}
        <div className={`absolute right-0 top-0 h-full w-[400px] border-l border-white/10 bg-[#0e0e0e]/90 backdrop-blur-xl flex flex-col shadow-2xl transition-transform duration-200 ease-out ${drawer ? "translate-x-0 pointer-events-auto" : "translate-x-full pointer-events-none"}`}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/8 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                {drawer?.type === "person" ? "Contact" : "Company"}
              </span>
            </div>
            <button onClick={() => setDrawer(null)} className="text-white/30 hover:text-white/60 transition-colors"><XIcon /></button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {drawer?.type === "person" ? (
              <PersonDrawer
                id={drawer.id}
                onClose={() => setDrawer(null)}
                onReveal={id => revealIds([id])}
                onViewCompany={cid => setDrawer({ type: "company", id: cid })}
                onViewPerson={pid => setDrawer({ type: "person", id: pid })}
                onAddToSequence={id => { setCampaignIds([id]); setShowCampaign(true); }}
                onAddToList={id => { setListIds([id]); setShowList(true); }}
                revealRate={discoverRate}
              />
            ) : drawer?.type === "company" ? (
              <CompanyDrawer
                id={drawer.id}
                onClose={() => setDrawer(null)}
                onRevealPerson={id => revealIds([id])}
                onViewPerson={id => setDrawer({ type: "person", id })}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showCampaign && (
        <SequenceModal
          count={campaignIds ? campaignIds.length : selectedCount}
          onClose={() => { setShowCampaign(false); setCampaignIds(null); }}
          onConfirm={(cid, cname) => handleExport("campaign", cid, cname, campaignIds ?? undefined)}
        />
      )}
      {showList && (
        <ListModal
          count={listIds ? listIds.length : selectedCount}
          onClose={() => { setShowList(false); setListIds(null); }}
          onConfirm={(lid, lname) => handleAddToList(lid, lname, listIds ?? undefined)}
        />
      )}
    </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  mode, activeFilterCount, recentSearches, savedSearches,
  onTriggerSearch, onApplyRecent, onApplySaved, onSetMode,
}: {
  mode: "people" | "companies";
  activeFilterCount: number;
  recentSearches: RecentSearch[];
  savedSearches: SavedSearch[];
  onTriggerSearch: (f?: Partial<PeopleFilters & CompanyFilters>) => void;
  onApplyRecent: (r: RecentSearch) => void;
  onApplySaved: (s: SavedSearch) => void;
  onSetMode: (m: "people" | "companies") => void;
}) {
  const [aiQuery, setAiQuery]     = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError]     = useState<string | null>(null);

  const quickFilters = mode === "people" ? PEOPLE_QUICK_FILTERS : COMPANY_QUICK_FILTERS;

  async function handleAiSearch() {
    if (!aiQuery.trim()) return;
    setAiLoading(true); setAiError(null);
    try {
      const res = await wsFetch("/api/discover/ai-filter", {
        method: "POST", body: JSON.stringify({ query: aiQuery, mode }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) { setAiError((data.error as string) ?? "AI filter failed"); return; }
      if (data.filters && typeof data.filters === "object") {
        onTriggerSearch(data.filters as Partial<PeopleFilters & CompanyFilters>);
        setAiQuery("");
      } else { setAiError("No filters returned"); }
    } catch (e) { setAiError(e instanceof Error ? e.message : "Network error"); }
    finally { setAiLoading(false); }
  }

  const hasRecent = recentSearches.length > 0;
  const hasSaved  = savedSearches.length > 0;

  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-12 pb-8 px-6 overflow-y-auto">
      <div className="w-full max-w-[620px]">

        {/* Mode toggle */}
        <div className="flex items-center justify-center gap-0.5 bg-white/5 rounded-lg p-0.5 w-fit mx-auto mb-8">
          {(["people", "companies"] as const).map(m => (
            <button key={m} onClick={() => onSetMode(m)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors capitalize ${mode === m ? "bg-white/10 text-white" : "text-white/35 hover:text-white/60"}`}>
              {m}
            </button>
          ))}
        </div>

        {/* Heading */}
        <div className="text-center mb-6">
          <h2 className="text-lg font-bold text-white/80">Find your ideal prospects</h2>
          <p className="text-sm text-white/30 mt-1">Search our database of <span className="text-orange-400/70 font-semibold">400M+ contacts</span> — use AI or apply filters</p>
        </div>

        {/* AI search input */}
        <div className="relative mb-4">
          <div className={`flex items-center gap-3 bg-white/5 border rounded-xl px-4 py-3 focus-within:border-orange-500/40 transition-colors ${aiError ? "border-red-500/30" : "border-white/12"}`}>
            <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <input
              value={aiQuery} onChange={e => { setAiQuery(e.target.value); setAiError(null); }}
              onKeyDown={e => e.key === "Enter" && handleAiSearch()}
              placeholder={mode === "people"
                ? "e.g. CTOs at fintech startups in Nigeria with verified email"
                : "e.g. B2B SaaS companies in the UK with 50-200 employees, Series A+"}
              className="flex-1 bg-transparent text-sm text-white/70 placeholder-white/25 focus:outline-none"
            />
            <button onClick={handleAiSearch} disabled={aiLoading || !aiQuery.trim()}
              className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors flex-shrink-0">
              {aiLoading ? "…" : "Search"}
            </button>
          </div>
          {aiError && <p className="text-[11px] text-rose-400 mt-1.5 px-1">{aiError}</p>}
        </div>

        {/* Active sidebar filters → search button */}
        {activeFilterCount > 0 && (
          <div className="text-center mb-5">
            <button onClick={() => onTriggerSearch()}
              className="px-5 py-2 bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/25 text-orange-300 text-sm font-semibold rounded-lg transition-colors">
              Search with {activeFilterCount} active filter{activeFilterCount !== 1 ? "s" : ""} →
            </button>
          </div>
        )}

        {/* Quick filter chips */}
        <div className="flex flex-wrap gap-1.5 justify-center mb-10">
          {quickFilters.map(qf => (
            <button key={qf.label}
              onClick={() => onTriggerSearch(qf.filters as Partial<PeopleFilters & CompanyFilters>)}
              className="px-3 py-1.5 rounded-full bg-white/6 hover:bg-white/10 text-xs text-white/45 hover:text-white/75 transition-colors border border-white/8">
              {qf.label}
            </button>
          ))}
        </div>

        {/* Recently searched + saved */}
        {(hasRecent || hasSaved) && (
          <div className={`grid gap-5 ${hasRecent && hasSaved ? "grid-cols-2" : "grid-cols-1"}`}>
            {hasRecent && (
              <div>
                <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-2.5">Recently searched</h3>
                <div className="space-y-1.5">
                  {recentSearches.slice(0, 5).map(r => (
                    <button key={r.id} onClick={() => onApplyRecent(r)}
                      className="w-full text-left px-3.5 py-2.5 rounded-xl bg-white/4 hover:bg-white/7 border border-white/6 transition-colors group">
                      <p className="text-xs text-white/65 group-hover:text-white/85 truncate">{r.label}</p>
                      <p className="text-[10px] text-white/25 mt-0.5">{timeAgo(r.ts)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {hasSaved && (
              <div>
                <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-2.5">Saved searches</h3>
                <div className="space-y-1.5">
                  {savedSearches.slice(0, 5).map(s => (
                    <button key={s.id} onClick={() => onApplySaved(s)}
                      className="w-full text-left px-3.5 py-2.5 rounded-xl bg-white/4 hover:bg-white/7 border border-white/6 transition-colors group">
                      <p className="text-xs text-white/65 group-hover:text-white/85 truncate">{s.name}</p>
                      <p className="text-[10px] text-white/25 mt-0.5 capitalize">{s.mode}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense>
      <DiscoverContent />
    </Suspense>
  );
}
