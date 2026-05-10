"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  SENIORITY_OPTIONS, DEPARTMENT_OPTIONS, INDUSTRY_OPTIONS,
  COMPANY_SIZE_OPTIONS, FUNDING_STAGE_OPTIONS,
  EMPLOYEE_RANGE_OPTIONS, REVENUE_RANGE_OPTIONS,
} from "@/types/discover";

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`w-3 h-3 text-white/30 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
function XSmall({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="ml-0.5 text-current opacity-60 hover:opacity-100">
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}
function PlusIcon() {
  return <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>;
}
function MinusIcon() {
  return <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" /></svg>;
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function FilterSection({
  title, children, activeCount = 0, defaultOpen = false,
}: { title: string; children: React.ReactNode; activeCount?: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen || activeCount > 0);
  useEffect(() => { if (activeCount > 0 && !open) setOpen(true); }, [activeCount]);

  return (
    <div className="border-b border-white/[0.06]">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold text-white/55 uppercase tracking-wider truncate">{title}</span>
          {activeCount > 0 && (
            <span className="flex-shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </div>
        <ChevronIcon open={open} />
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function Tag({ label, variant, onRemove }: { label: string; variant: "include" | "exclude"; onRemove: () => void }) {
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium max-w-full ${
      variant === "include"
        ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
        : "bg-rose-500/20 text-rose-300 border border-rose-500/30 line-through"
    }`}>
      <span className="truncate max-w-[130px]">{label}</span>
      <XSmall onClick={onRemove} />
    </span>
  );
}

function TagArea({
  includes, excludes,
  onRemoveInclude, onRemoveExclude,
}: {
  includes: string[]; excludes: string[];
  onRemoveInclude: (v: string) => void; onRemoveExclude: (v: string) => void;
}) {
  if (!includes.length && !excludes.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {includes.map(v => <Tag key={v} label={v} variant="include" onRemove={() => onRemoveInclude(v)} />)}
      {excludes.map(v => <Tag key={v} label={v} variant="exclude" onRemove={() => onRemoveExclude(v)} />)}
    </div>
  );
}

// ── Include/Exclude text input ────────────────────────────────────────────────

function IncludeExcludeInput({
  includes, excludes, placeholder, excludePlaceholder,
  onAddInclude, onAddExclude, onRemoveInclude, onRemoveExclude,
}: {
  includes: string[]; excludes: string[];
  placeholder: string; excludePlaceholder?: string;
  onAddInclude: (v: string) => void; onAddExclude: (v: string) => void;
  onRemoveInclude: (v: string) => void; onRemoveExclude: (v: string) => void;
}) {
  const [incVal, setIncVal] = useState("");
  const [excVal, setExcVal] = useState("");

  function submit(val: string, mode: "include" | "exclude") {
    const trimmed = val.trim();
    if (!trimmed) return;
    if (mode === "include") { onAddInclude(trimmed); setIncVal(""); }
    else                    { onAddExclude(trimmed); setExcVal(""); }
  }

  return (
    <div className="space-y-2">
      <div>
        <div className="flex items-center gap-1 mb-1">
          <PlusIcon /><span className="text-[10px] text-white/40 font-medium">Include</span>
        </div>
        <input
          value={incVal} onChange={e => setIncVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit(incVal, "include")}
          placeholder={placeholder}
          className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[11px] text-white/70 placeholder-white/20 focus:outline-none focus:border-orange-500/40"
        />
      </div>
      <div>
        <div className="flex items-center gap-1 mb-1">
          <MinusIcon /><span className="text-[10px] text-white/40 font-medium">Exclude</span>
        </div>
        <input
          value={excVal} onChange={e => setExcVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit(excVal, "exclude")}
          placeholder={excludePlaceholder ?? `Exclude ${placeholder.toLowerCase()}`}
          className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[11px] text-white/70 placeholder-white/20 focus:outline-none focus:border-rose-500/40"
        />
      </div>
      <TagArea includes={includes} excludes={excludes} onRemoveInclude={onRemoveInclude} onRemoveExclude={onRemoveExclude} />
    </div>
  );
}

// ── Searchable multi-select with include/exclude ──────────────────────────────

function SearchableIncludeExclude({
  options, includes, excludes, placeholder,
  onAddInclude, onAddExclude, onRemoveInclude, onRemoveExclude,
}: {
  options: readonly string[];
  includes: string[]; excludes: string[];
  placeholder: string;
  onAddInclude: (v: string) => void; onAddExclude: (v: string) => void;
  onRemoveInclude: (v: string) => void; onRemoveExclude: (v: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"include" | "exclude">("include");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filtered = options.filter(o =>
    o.toLowerCase().includes(query.toLowerCase()) &&
    !includes.includes(o) && !excludes.includes(o)
  ).slice(0, 20);

  function select(val: string) {
    if (mode === "include") onAddInclude(val);
    else onAddExclude(val);
    setQuery("");
  }

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div className="flex rounded overflow-hidden border border-white/10 text-[10px] font-semibold">
        <button onClick={() => setMode("include")} className={`flex-1 py-1 transition-colors ${mode === "include" ? "bg-orange-500/20 text-orange-300" : "text-white/30 hover:text-white/50"}`}>
          <span className="flex items-center justify-center gap-1"><PlusIcon /> Include</span>
        </button>
        <button onClick={() => setMode("exclude")} className={`flex-1 py-1 transition-colors border-l border-white/10 ${mode === "exclude" ? "bg-rose-500/20 text-rose-300" : "text-white/30 hover:text-white/50"}`}>
          <span className="flex items-center justify-center gap-1"><MinusIcon /> Exclude</span>
        </button>
      </div>
      {/* Search */}
      <div ref={ref} className="relative">
        <input
          value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[11px] text-white/70 placeholder-white/20 focus:outline-none focus:border-orange-500/40"
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-[#1a1a1a] border border-white/10 rounded shadow-xl max-h-48 overflow-y-auto">
            {filtered.map(opt => (
              <button key={opt} onClick={() => { select(opt); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-white/60 hover:bg-white/8 hover:text-white transition-colors truncate">
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
      <TagArea includes={includes} excludes={excludes} onRemoveInclude={onRemoveInclude} onRemoveExclude={onRemoveExclude} />
    </div>
  );
}

// ── Checkbox group ────────────────────────────────────────────────────────────

function CheckboxGroup({
  options, selected, onChange,
}: { options: readonly { label: string; value: string }[]; selected: string[]; onChange: (v: string[]) => void }) {
  function toggle(val: string) {
    onChange(selected.includes(val) ? selected.filter(x => x !== val) : [...selected, val]);
  }
  return (
    <div className="space-y-0.5">
      {options.map(o => (
        <label key={o.value} className="flex items-center gap-2.5 py-1 px-1 rounded hover:bg-white/4 cursor-pointer group">
          <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
            selected.includes(o.value) ? "bg-orange-500 border-orange-500" : "border-white/20 group-hover:border-white/40"
          }`}>
            {selected.includes(o.value) && (
              <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 5l2.5 2.5 4.5-4.5" />
              </svg>
            )}
          </div>
          <span className="text-[11px] text-white/55 group-hover:text-white/80 transition-colors">{o.label}</span>
          <input type="checkbox" className="sr-only" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
        </label>
      ))}
    </div>
  );
}

// ── Employee range checkboxes ─────────────────────────────────────────────────

const APOLLO_EMPLOYEE_RANGES = [
  { label: "1-10", value: "1-10" },
  { label: "11-50", value: "11-50" },
  { label: "51-200", value: "51-200" },
  { label: "201-500", value: "201-500" },
  { label: "501-1,000", value: "501-1000" },
  { label: "1,001-5,000", value: "1001-5000" },
  { label: "5,001-10,000", value: "5001-10000" },
  { label: "10,001+", value: "10001+" },
] as const;

// ── Public types ──────────────────────────────────────────────────────────────

export interface PeopleFilters {
  keyword:          string;
  titleIncludes:    string[];
  titleExcludes:    string[];
  seniorities:      string[];
  departments:      string[];
  locationIncludes: string[];
  locationExcludes: string[];
  companyIncludes:  string[];
  companyExcludes:  string[];
  industryIncludes: string[];
  industryExcludes: string[];
  companySizes:     string[];
  emailStatus:      "any" | "has_email" | "verified";
}

export interface CompanyFilters {
  coKeyword:          string;
  coLocationIncludes: string[];
  coLocationExcludes: string[];
  coIndustryIncludes: string[];
  coIndustryExcludes: string[];
  coSizes:            string[];
  coFundingStages:    string[];
  coEmployeeRange:    { min: number; max: number } | null;
  coRevenueRange:     { min: number; max: number } | null;
  coHasPeople:        boolean;
}

export const DEFAULT_PEOPLE_FILTERS: PeopleFilters = {
  keyword: "", titleIncludes: [], titleExcludes: [], seniorities: [],
  departments: [], locationIncludes: [], locationExcludes: [],
  companyIncludes: [], companyExcludes: [], industryIncludes: [],
  industryExcludes: [], companySizes: [], emailStatus: "has_email",
};

export const DEFAULT_COMPANY_FILTERS: CompanyFilters = {
  coKeyword: "", coLocationIncludes: [], coLocationExcludes: [],
  coIndustryIncludes: [], coIndustryExcludes: [], coSizes: [],
  coFundingStages: [], coEmployeeRange: null, coRevenueRange: null, coHasPeople: false,
};

// ── Revenue ranges ────────────────────────────────────────────────────────────

const REVENUE_OPTIONS = [
  { label: "< $1M",      min: 0,            max: 1_000_000 },
  { label: "$1M–$10M",   min: 1_000_000,    max: 10_000_000 },
  { label: "$10M–$50M",  min: 10_000_000,   max: 50_000_000 },
  { label: "$50M–$100M", min: 50_000_000,   max: 100_000_000 },
  { label: "$100M–$1B",  min: 100_000_000,  max: 1_000_000_000 },
  { label: "$1B+",       min: 1_000_000_000, max: 0 },
] as const;

// ── People sidebar ────────────────────────────────────────────────────────────

export function PeopleSidebar({
  filters, onChange, onAiApply,
}: {
  filters: PeopleFilters;
  onChange: (f: PeopleFilters) => void;
  onAiApply: (f: Partial<PeopleFilters>) => void;
}) {
  const set = useCallback(<K extends keyof PeopleFilters>(key: K, val: PeopleFilters[K]) => {
    onChange({ ...filters, [key]: val });
  }, [filters, onChange]);

  function addInc(key: keyof PeopleFilters, val: string) {
    const arr = filters[key] as string[];
    if (!arr.includes(val)) set(key, [...arr, val] as PeopleFilters[typeof key]);
  }
  function addExc(key: keyof PeopleFilters, val: string) {
    const arr = filters[key] as string[];
    if (!arr.includes(val)) set(key, [...arr, val] as PeopleFilters[typeof key]);
  }
  function rmInc(key: keyof PeopleFilters, val: string) {
    set(key, (filters[key] as string[]).filter(x => x !== val) as PeopleFilters[typeof key]);
  }

  const titleCount    = filters.titleIncludes.length    + filters.titleExcludes.length;
  const senCount      = filters.seniorities.length;
  const deptCount     = filters.departments.length;
  const locCount      = filters.locationIncludes.length + filters.locationExcludes.length;
  const coCount       = filters.companyIncludes.length  + filters.companyExcludes.length;
  const indCount      = filters.industryIncludes.length + filters.industryExcludes.length;
  const sizeCount     = filters.companySizes.length;
  const emailCount    = filters.emailStatus !== "has_email" ? 1 : 0;

  return (
    <div className="flex-1 overflow-y-auto">

      {/* AI quick filter */}
      <AiFilterBar mode="people" onApply={onAiApply} />

      {/* Email Status */}
      <FilterSection title="Email Status" activeCount={emailCount}>
        <div className="space-y-0.5">
          {(["has_email", "verified", "any"] as const).map(v => (
            <label key={v} className="flex items-center gap-2.5 py-1 px-1 rounded hover:bg-white/4 cursor-pointer group">
              <div className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${
                filters.emailStatus === v ? "border-orange-500" : "border-white/20 group-hover:border-white/40"
              }`}>
                {filters.emailStatus === v && <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
              </div>
              <span className="text-[11px] text-white/55 group-hover:text-white/80 capitalize">
                {v === "has_email" ? "Has Email" : v === "verified" ? "Verified Email" : "Any"}
              </span>
              <input type="radio" className="sr-only" checked={filters.emailStatus === v} onChange={() => set("emailStatus", v)} />
            </label>
          ))}
        </div>
      </FilterSection>

      {/* Job Titles */}
      <FilterSection title="Job Titles" activeCount={titleCount}>
        <IncludeExcludeInput
          includes={filters.titleIncludes}
          excludes={filters.titleExcludes}
          placeholder="e.g. CEO, VP Sales…"
          excludePlaceholder="Titles to exclude…"
          onAddInclude={v => addInc("titleIncludes", v)}
          onAddExclude={v => addInc("titleExcludes", v)}
          onRemoveInclude={v => rmInc("titleIncludes", v)}
          onRemoveExclude={v => rmInc("titleExcludes", v)}
        />
      </FilterSection>

      {/* Management Level */}
      <FilterSection title="Management Level" activeCount={senCount}>
        <CheckboxGroup
          options={SENIORITY_OPTIONS}
          selected={filters.seniorities}
          onChange={v => set("seniorities", v)}
        />
      </FilterSection>

      {/* Department */}
      <FilterSection title="Department" activeCount={deptCount}>
        <CheckboxGroup
          options={DEPARTMENT_OPTIONS}
          selected={filters.departments}
          onChange={v => set("departments", v)}
        />
      </FilterSection>

      {/* Company */}
      <FilterSection title="Company" activeCount={coCount}>
        <IncludeExcludeInput
          includes={filters.companyIncludes}
          excludes={filters.companyExcludes}
          placeholder="Enter companies…"
          excludePlaceholder="Companies to exclude…"
          onAddInclude={v => addInc("companyIncludes", v)}
          onAddExclude={v => addInc("companyExcludes", v)}
          onRemoveInclude={v => rmInc("companyIncludes", v)}
          onRemoveExclude={v => rmInc("companyExcludes", v)}
        />
      </FilterSection>

      {/* Location */}
      <FilterSection title="Location" activeCount={locCount}>
        <IncludeExcludeInput
          includes={filters.locationIncludes}
          excludes={filters.locationExcludes}
          placeholder="Country, state, or city…"
          excludePlaceholder="Locations to exclude…"
          onAddInclude={v => addInc("locationIncludes", v)}
          onAddExclude={v => addInc("locationExcludes", v)}
          onRemoveInclude={v => rmInc("locationIncludes", v)}
          onRemoveExclude={v => rmInc("locationExcludes", v)}
        />
      </FilterSection>

      {/* # Employees */}
      <FilterSection title="# Employees" activeCount={sizeCount}>
        <CheckboxGroup
          options={APOLLO_EMPLOYEE_RANGES.map(r => ({ label: r.label, value: r.value }))}
          selected={filters.companySizes}
          onChange={v => set("companySizes", v)}
        />
      </FilterSection>

      {/* Industry */}
      <FilterSection title="Industry & Keywords" activeCount={indCount}>
        <SearchableIncludeExclude
          options={INDUSTRY_OPTIONS}
          includes={filters.industryIncludes}
          excludes={filters.industryExcludes}
          placeholder="Search industries…"
          onAddInclude={v => addInc("industryIncludes", v)}
          onAddExclude={v => addInc("industryExcludes", v)}
          onRemoveInclude={v => rmInc("industryIncludes", v)}
          onRemoveExclude={v => rmInc("industryExcludes", v)}
        />
      </FilterSection>

    </div>
  );
}

// ── Companies sidebar ─────────────────────────────────────────────────────────

export function CompanySidebar({
  filters, onChange, onAiApply,
}: {
  filters: CompanyFilters;
  onChange: (f: CompanyFilters) => void;
  onAiApply: (f: Partial<CompanyFilters>) => void;
}) {
  const set = useCallback(<K extends keyof CompanyFilters>(key: K, val: CompanyFilters[K]) => {
    onChange({ ...filters, [key]: val });
  }, [filters, onChange]);

  function addInc(key: keyof CompanyFilters, val: string) {
    const arr = filters[key] as string[];
    if (!arr.includes(val)) set(key, [...arr, val] as CompanyFilters[typeof key]);
  }
  function rmInc(key: keyof CompanyFilters, val: string) {
    set(key, (filters[key] as string[]).filter(x => x !== val) as CompanyFilters[typeof key]);
  }

  const locCount    = filters.coLocationIncludes.length + filters.coLocationExcludes.length;
  const indCount    = filters.coIndustryIncludes.length + filters.coIndustryExcludes.length;
  const sizeCount   = filters.coSizes.length;
  const fundCount   = filters.coFundingStages.length;
  const revCount    = filters.coRevenueRange ? 1 : 0;
  const hasPeopleCount = filters.coHasPeople ? 1 : 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <AiFilterBar mode="companies" onApply={onAiApply} />

      {/* Account Location */}
      <FilterSection title="Account Location" activeCount={locCount}>
        <IncludeExcludeInput
          includes={filters.coLocationIncludes}
          excludes={filters.coLocationExcludes}
          placeholder="Country, state, or city…"
          excludePlaceholder="Locations to exclude…"
          onAddInclude={v => addInc("coLocationIncludes", v)}
          onAddExclude={v => addInc("coLocationExcludes", v)}
          onRemoveInclude={v => rmInc("coLocationIncludes", v)}
          onRemoveExclude={v => rmInc("coLocationExcludes", v)}
        />
      </FilterSection>

      {/* # Employees */}
      <FilterSection title="# Employees" activeCount={sizeCount}>
        <CheckboxGroup
          options={APOLLO_EMPLOYEE_RANGES.map(r => ({ label: r.label, value: r.value }))}
          selected={filters.coSizes}
          onChange={v => set("coSizes", v)}
        />
      </FilterSection>

      {/* Industry */}
      <FilterSection title="Industry & Keywords" activeCount={indCount}>
        <SearchableIncludeExclude
          options={INDUSTRY_OPTIONS}
          includes={filters.coIndustryIncludes}
          excludes={filters.coIndustryExcludes}
          placeholder="Search industries…"
          onAddInclude={v => addInc("coIndustryIncludes", v)}
          onAddExclude={v => addInc("coIndustryExcludes", v)}
          onRemoveInclude={v => rmInc("coIndustryIncludes", v)}
          onRemoveExclude={v => rmInc("coIndustryExcludes", v)}
        />
      </FilterSection>

      {/* Funding Stage */}
      <FilterSection title="Funding Stage" activeCount={fundCount}>
        <CheckboxGroup
          options={FUNDING_STAGE_OPTIONS.map(v => ({ label: v, value: v }))}
          selected={filters.coFundingStages}
          onChange={v => set("coFundingStages", v)}
        />
      </FilterSection>

      {/* Revenue */}
      <FilterSection title="Revenue" activeCount={revCount}>
        <div className="space-y-0.5">
          {REVENUE_OPTIONS.map(opt => {
            const active = filters.coRevenueRange?.min === opt.min && filters.coRevenueRange?.max === opt.max;
            return (
              <label key={opt.label} className="flex items-center gap-2.5 py-1 px-1 rounded hover:bg-white/4 cursor-pointer group">
                <div className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${
                  active ? "border-orange-500" : "border-white/20 group-hover:border-white/40"
                }`}>
                  {active && <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                </div>
                <span className="text-[11px] text-white/55 group-hover:text-white/80">{opt.label}</span>
                <input type="radio" className="sr-only" checked={active}
                  onChange={() => set("coRevenueRange", active ? null : { min: opt.min, max: opt.max })} />
              </label>
            );
          })}
          {filters.coRevenueRange && (
            <button onClick={() => set("coRevenueRange", null)} className="text-[10px] text-white/30 hover:text-white/60 px-1 mt-1">
              Clear
            </button>
          )}
        </div>
      </FilterSection>

      {/* Has contacts */}
      <FilterSection title="More Filters" activeCount={hasPeopleCount}>
        <label className="flex items-center gap-2.5 py-1 px-1 rounded hover:bg-white/4 cursor-pointer group">
          <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
            filters.coHasPeople ? "bg-orange-500 border-orange-500" : "border-white/20 group-hover:border-white/40"
          }`}>
            {filters.coHasPeople && (
              <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 5l2.5 2.5 4.5-4.5" />
              </svg>
            )}
          </div>
          <span className="text-[11px] text-white/55 group-hover:text-white/80">Has contacts</span>
          <input type="checkbox" className="sr-only" checked={filters.coHasPeople} onChange={() => set("coHasPeople", !filters.coHasPeople)} />
        </label>
      </FilterSection>

    </div>
  );
}

// ── AI filter bar ─────────────────────────────────────────────────────────────

const PEOPLE_QUICK_FILTERS = [
  { label: "CTOs in the US",       filters: { titleIncludes: ["CTO", "Chief Technology Officer"], locationIncludes: ["United States"] } },
  { label: "Sales VPs",            filters: { titleIncludes: ["VP Sales", "Vice President Sales"], seniorities: ["vp"] } },
  { label: "Founders & CEOs",      filters: { seniorities: ["founder", "owner", "c_suite"], titleIncludes: ["CEO", "Founder"] } },
  { label: "Tech companies",       filters: { industryIncludes: ["Technology", "Software", "SaaS"] } },
  { label: "Marketing Directors",  filters: { titleIncludes: ["Marketing Director", "Director of Marketing"], departments: ["marketing"] } },
];

const COMPANY_QUICK_FILTERS = [
  { label: "SaaS companies",       filters: { coIndustryIncludes: ["SaaS", "Software"] } },
  { label: "Series A+",            filters: { coFundingStages: ["Series A", "Series B", "Series C"] } },
  { label: "Mid-size (51-500)",    filters: { coSizes: ["51-200", "201-500"] } },
  { label: "US companies",         filters: { coLocationIncludes: ["United States"] } },
  { label: "Fintech",              filters: { coIndustryIncludes: ["Financial Services", "Banking"] } },
];

function AiFilterBar({
  mode, onApply,
}: { mode: "people" | "companies"; onApply: (f: Partial<PeopleFilters & CompanyFilters>) => void }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const quickFilters = mode === "people" ? PEOPLE_QUICK_FILTERS : COMPANY_QUICK_FILTERS;

  async function handleAi() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/discover/ai-filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query, mode }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (data.filters) onApply(data.filters as Partial<PeopleFilters & CompanyFilters>);
    } catch { /* ignore */ }
    setLoading(false);
    setQuery("");
  }

  return (
    <div className="px-3 py-3 border-b border-white/[0.06] space-y-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <svg className="w-3.5 h-3.5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
        <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">AI Filter</span>
      </div>
      <div className="flex gap-1.5">
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAi()}
          placeholder={mode === "people" ? "e.g. CTOs at fintech startups in Europe" : "e.g. B2B SaaS companies 50-200 employees"}
          className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[11px] text-white/70 placeholder-white/20 focus:outline-none focus:border-orange-500/40"
        />
        <button onClick={handleAi} disabled={loading || !query.trim()}
          className="px-2 py-1.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 rounded text-white text-[10px] font-bold transition-colors">
          {loading ? "…" : "Go"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {quickFilters.map(qf => (
          <button key={qf.label} onClick={() => onApply(qf.filters as Partial<PeopleFilters & CompanyFilters>)}
            className="px-2 py-0.5 rounded-full bg-white/6 hover:bg-white/10 text-[10px] text-white/45 hover:text-white/70 transition-colors border border-white/8">
            {qf.label}
          </button>
        ))}
      </div>
    </div>
  );
}
