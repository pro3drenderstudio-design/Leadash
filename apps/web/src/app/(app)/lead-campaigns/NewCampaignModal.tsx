"use client";
import { useState, useRef, useEffect } from "react";
import {
  CREDIT_COSTS, JOB_TITLES, SENIORITY_LEVELS, SENIORITY_API_VALUE,
  JOB_FUNCTIONS, FUNCTION_API_VALUE,
  INDUSTRIES, EMPLOYEE_SIZES, COUNTRIES,
  type LeadCampaignMode, type ApifyLeadScraperInput,
  type ToneOfVoice, type PersonalizationDepth,
  type LeadCampaign,
} from "@/types/lead-campaigns";
import { wsGet, wsPost, wsFetch } from "@/lib/workspace/client";

interface Props {
  onClose:   () => void;
  onCreated: () => void;
  balance:   number;
}

type Step = 0 | 1 | 2 | 3;
type TargetTab = "person" | "company" | "location" | "advanced";

interface WizardState {
  name:              string;
  mode:              LeadCampaignMode;
  // Targeting
  personTitleIncludes:           string[];
  personTitleExcludes:           string[];
  personTitleExtraIncludes:      string;
  seniorityIncludes:             string[];
  seniorityExcludes:             string[];
  personFunctionIncludes:        string[];
  personFunctionExcludes:        string[];
  companyNamesIncludes:          string;
  companyNamesExcludes:          string;
  industryIncludes:              string[];
  industryExcludes:              string[];
  companyKeywordIncludes:        string;
  companyKeywordExcludes:        string;
  companyDomainIncludes:         string;
  companyDomainExcludes:         string;
  companyHeadcountIncludes:      string[];
  personLocationCountryIncludes: string[];
  personLocationCountryExcludes: string[];
  personLocationStateIncludes:   string;
  personLocationStateExcludes:   string;
  personLocationCityIncludes:    string;
  personLocationCityExcludes:    string;
  totalResults:                  number;
  startOffset:                   number;
  emailStatus:                   "verified" | "unverified" | "";
  hasEmail:                      boolean;
  hasPhone:                      boolean;
  // Source (verify_personalize mode)
  sourceType:       "upload" | "campaign";
  sourceCampaignId: string;
  uploadedFile:     File | null;
  // Enrichment
  aiEnabled:             boolean;
  personalizeValidOnly:  boolean;
  offerAngle:            string;
  toneOfVoice:           ToneOfVoice;
  personalizationDepth:  PersonalizationDepth;
}

const DEFAULT: WizardState = {
  name: "", mode: "full_suite",
  personTitleIncludes: [], personTitleExcludes: [],
  personTitleExtraIncludes: "",
  seniorityIncludes: [], seniorityExcludes: [],
  personFunctionIncludes: [], personFunctionExcludes: [],
  companyNamesIncludes: "", companyNamesExcludes: "",
  industryIncludes: [], industryExcludes: [],
  companyKeywordIncludes: "", companyKeywordExcludes: "",
  companyDomainIncludes: "", companyDomainExcludes: "",
  companyHeadcountIncludes: [],
  personLocationCountryIncludes: [], personLocationCountryExcludes: [],
  personLocationStateIncludes: "", personLocationStateExcludes: "",
  personLocationCityIncludes: "", personLocationCityExcludes: "",
  totalResults: 20, startOffset: 0, emailStatus: "", hasEmail: true, hasPhone: false,
  sourceType: "campaign", sourceCampaignId: "", uploadedFile: null,
  aiEnabled: true, personalizeValidOnly: false, offerAngle: "", toneOfVoice: "professional", personalizationDepth: "standard",
};

function csvToArr(s: string): string[] {
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

function cleanVal(v: string | null | undefined): string {
  if (!v) return "";
  return v.replace(/^\[['"]?|['"]?\]$/g, "").replace(/['"]/g, "").trim();
}

function toApiSeniority(vals: string[]): string[] {
  return vals.map(v => SENIORITY_API_VALUE[v] ?? v).filter(Boolean);
}

function toApiFunction(vals: string[]): string[] {
  return vals.map(v => FUNCTION_API_VALUE[v] ?? v).filter(Boolean);
}

function buildApifyInput(s: WizardState): ApifyLeadScraperInput {
  const input: ApifyLeadScraperInput = {
    totalResults: s.totalResults,
    hasEmail:     s.hasEmail || undefined,
    hasPhone:     s.hasPhone || undefined,
  };
  if (s.emailStatus) input.emailStatusIncludes = [s.emailStatus as "verified" | "unverified"];
  if (s.startOffset) input.startOffset = s.startOffset;
  if (s.personTitleIncludes.length)           input.personTitleIncludes = s.personTitleIncludes;
  if (s.personTitleExcludes.length)           input.personTitleExcludes = s.personTitleExcludes;
  if (s.personTitleExtraIncludes)             input.personTitleExtraIncludes = csvToArr(s.personTitleExtraIncludes);
  if (s.seniorityIncludes.length)             input.seniorityIncludes = toApiSeniority(s.seniorityIncludes);
  if (s.seniorityExcludes.length)             input.seniorityExcludes = toApiSeniority(s.seniorityExcludes);
  if (s.personFunctionIncludes.length)        input.functionIncludes  = toApiFunction(s.personFunctionIncludes);
  if (s.personFunctionExcludes.length)        input.functionExcludes  = toApiFunction(s.personFunctionExcludes);
  if (s.personLocationCountryIncludes.length) input.personLocationCountryIncludes = s.personLocationCountryIncludes;
  if (s.personLocationCountryExcludes.length) input.personLocationCountryExcludes = s.personLocationCountryExcludes;
  if (s.personLocationStateIncludes)          input.personLocationStateIncludes = csvToArr(s.personLocationStateIncludes);
  if (s.personLocationStateExcludes)          input.personLocationStateExcludes = csvToArr(s.personLocationStateExcludes);
  if (s.personLocationCityIncludes)           input.personLocationCityIncludes  = csvToArr(s.personLocationCityIncludes);
  if (s.personLocationCityExcludes)           input.personLocationCityExcludes  = csvToArr(s.personLocationCityExcludes);
  if (s.companyNamesIncludes)                 input.companyNamesIncludes = csvToArr(s.companyNamesIncludes);
  if (s.companyNamesExcludes)                 input.companyNamesExcludes = csvToArr(s.companyNamesExcludes);
  if (s.industryIncludes.length)              input.industryIncludes = s.industryIncludes;
  if (s.industryExcludes.length)              input.industryExcludes = s.industryExcludes;
  if (s.companyKeywordIncludes)               input.companyKeywordIncludes = csvToArr(s.companyKeywordIncludes);
  if (s.companyKeywordExcludes)               input.companyKeywordExcludes = csvToArr(s.companyKeywordExcludes);
  if (s.companyDomainIncludes)                input.companyDomainIncludes  = csvToArr(s.companyDomainIncludes);
  if (s.companyDomainExcludes)                input.companyDomainExcludes  = csvToArr(s.companyDomainExcludes);
  if (s.companyHeadcountIncludes.length)      input.companyHeadcountIncludes = s.companyHeadcountIncludes;
  return input;
}

// ─── Single-select dropdown ───────────────────────────────────────────────────
function SingleSelect({
  options, value, onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const selected = options.find(o => o.value === value) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm hover:border-white/20 transition-colors text-left"
      >
        <span className="text-white/70">{selected.label}</span>
        <svg className="w-4 h-4 text-white/30 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-gray-900 border border-white/15 rounded-xl shadow-2xl overflow-hidden">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-white/5 ${
                opt.value === value ? "text-white bg-white/5" : "text-white/60"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Multi-select pill component ─────────────────────────────────────────────
function MultiSelect({
  label, options, selected, onChange,
}: {
  label: string; options: readonly string[]; selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");
  const ref       = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setSearch("");
  }, [open]);

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  }

  const filtered = search.trim()
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div ref={ref} className="relative">
      <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm hover:border-white/20 transition-colors text-left"
      >
        <span className="text-white/40 truncate">
          {selected.length === 0 ? `Add ${label.split(" ")[0]}...` : `${selected.length} selected`}
        </span>
        <svg className="w-4 h-4 text-white/30 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map(v => (
            <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-500/15 border border-blue-500/25 rounded text-xs text-orange-400">
              {v}
              <button type="button" onClick={() => toggle(v)} className="hover:text-orange-300">×</button>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-gray-900 border border-white/15 rounded-xl shadow-2xl">
          <div className="p-2 border-b border-white/8">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs placeholder-white/30 focus:outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-white/30 text-xs text-center">No results for "{search}"</p>
            ) : filtered.map(opt => (
              <label key={opt} className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="w-3.5 h-3.5 accent-orange-500"
                />
                <span className={selected.includes(opt) ? "text-white" : "text-white/60"}>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Text input ───────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string;
}) {
  return (
    <div>
      <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">{label}</label>
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-orange-500/60 transition-colors"
      />
      {hint && <p className="text-white/30 text-xs mt-1">{hint}</p>}
    </div>
  );
}

// ─── Step progress bar ────────────────────────────────────────────────────────
function StepBar({ step }: { step: Step }) {
  return (
    <div className="flex gap-1.5 mt-3">
      {([1, 2, 3] as Step[]).map(s => (
        <div
          key={s}
          className={`h-1 flex-1 rounded-full transition-all duration-500 ${s <= step ? "bg-orange-500" : "bg-white/10"}`}
        />
      ))}
    </div>
  );
}

// ─── Preview table ────────────────────────────────────────────────────────────

// Matches exact actor output field names
interface PreviewLead {
  // Standard actor fields
  firstName?: string; lastName?: string; fullName?: string;
  position?: string; seniority?: string; functional?: string;
  linkedinUrl?: string; linkedInUrl?: string; linkedin_url?: string;
  email?: string; phone?: string;
  city?: string; country?: string;
  location?: string; personLocation?: string; address?: string;
  orgName?: string; orgIndustry?: string; orgWebsite?: string;
  orgLinkedinUrl?: string; orgCity?: string; orgState?: string;
  orgCountry?: string; orgSize?: string;
  // Common alternate field names returned by some actor data sources
  title?: string; jobTitle?: string; headline?: string; currentPosition?: string;
  company?: string; companyName?: string; organizationName?: string;
  employer?: string; currentCompany?: string;
  industry?: string; companyIndustry?: string | string[]; sector?: string;
  personCity?: string; personCountry?: string;
  companyLinkedinUrl?: string; companyWebsite?: string; website?: string;
  [key: string]: unknown;
}

function pick(lead: PreviewLead, ...keys: (keyof PreviewLead)[]): string {
  for (const k of keys) {
    const v = lead[k];
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
    if (v && typeof v === "string") return v;
  }
  return "";
}

function IconLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer" title={title}
      onClick={e => e.stopPropagation()}
      className="w-6 h-6 rounded-md bg-orange-500/10 hover:bg-orange-400/20 border border-orange-500/20 hover:border-orange-500/40 flex items-center justify-center text-orange-400 hover:text-orange-300 transition-all flex-shrink-0"
    >
      {children}
    </a>
  );
}

function LinkedInIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253M3 12a8.96 8.96 0 00.284 2.253" />
    </svg>
  );
}

function PreviewTable({ leads, loading }: { leads: PreviewLead[]; loading: boolean }) {
  if (loading) return (
    <div className="flex flex-col items-center justify-center py-12 text-white/40">
      <svg className="w-8 h-8 animate-spin mb-3" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="text-sm">Fetching preview leads...</p>
    </div>
  );

  if (!leads.length) return (
    <div className="flex flex-col items-center justify-center py-12 text-white/30">
      <p className="text-sm">No preview available — configure filters and click "Preview"</p>
    </div>
  );

  return (
    <div className="mt-3 border border-white/8 rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/8 bg-white/3">
            <th className="text-left text-white/40 font-medium px-3 py-2">Prospect</th>
            <th className="text-left text-white/40 font-medium px-3 py-2">Company</th>
            <th className="text-left text-white/40 font-medium px-3 py-2">Location</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l, i) => {
            const firstName = pick(l, "firstName") || pick(l, "fullName").split(" ")[0];
            const lastName  = pick(l, "lastName")  || pick(l, "fullName").split(" ").slice(1).join(" ");
            const name      = [firstName, lastName].filter(Boolean).join(" ") || "—";
            const initials  = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
            const title     = pick(l, "position", "title", "jobTitle", "headline", "currentPosition");
            const company   = pick(l, "orgName", "company", "companyName", "organizationName", "employer", "currentCompany");
            const industry  = cleanVal(pick(l, "orgIndustry", "industry", "companyIndustry", "sector"));
            const cityRaw   = pick(l, "city", "personCity");
            const countryRaw = pick(l, "country", "personCountry");
            const location  = [cityRaw, countryRaw].filter(Boolean).join(", ")
              || pick(l, "location" as keyof PreviewLead, "personLocation", "address");
            const personLi  = pick(l, "linkedinUrl", "linkedInUrl", "linkedin_url");
            const companyLi = pick(l, "orgLinkedinUrl", "companyLinkedinUrl");
            const website   = pick(l, "orgWebsite", "companyWebsite", "website");

            return (
              <tr key={i} className={`${i !== leads.length - 1 ? "border-b border-white/5" : ""}`}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-xs font-semibold text-white/60 flex-shrink-0">{initials}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-white font-medium text-xs truncate">{name}</p>
                        {personLi && <IconLink href={personLi} title="LinkedIn Profile"><LinkedInIcon /></IconLink>}
                      </div>
                      <p className="text-white/40 text-xs truncate">{title || <span className="text-white/20 italic">No title</span>}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-white/70 text-xs font-medium truncate max-w-[130px]">{company || <span className="text-white/25 italic">Unknown</span>}</p>
                    {companyLi && <IconLink href={companyLi} title="Company LinkedIn"><LinkedInIcon /></IconLink>}
                    {website   && <IconLink href={website.startsWith("http") ? website : `https://${website}`} title="Website"><GlobeIcon /></IconLink>}
                  </div>
                  <p className="text-white/35 text-xs">{industry || <span className="text-white/20 italic">Unknown industry</span>}</p>
                </td>
                <td className="px-3 py-2.5 text-white/40 text-xs">{location || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export default function NewCampaignModal({ onClose, onCreated, balance }: Props) {
  const [step, setStep]         = useState<Step>(0);
  const [tab, setTab]           = useState<TargetTab>("person");
  const [form, setForm]         = useState<WizardState>({ ...DEFAULT });
  const [previewing, setPreviewing] = useState(false);
  const [previewLeads, setPreviewLeads] = useState<PreviewLead[]>([]);
  const [previewDone, setPreviewDone]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [scrapeCampaigns, setScrapeCampaigns] = useState<LeadCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Fetch previous scrape campaigns when user picks verify_personalize
  useEffect(() => {
    if (form.mode !== "verify_personalize" || step !== 1) return;
    setLoadingCampaigns(true);
    wsGet<LeadCampaign[]>("/api/lead-campaigns?mode=scrape&status=completed")
      .then(d => setScrapeCampaigns(Array.isArray(d) ? d : []))
      .catch(() => setScrapeCampaigns([]))
      .finally(() => setLoadingCampaigns(false));
  }, [form.mode, step]);

  function set<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  // Build cost dynamically so toggling aiEnabled updates the estimate in real-time
  const costPerLead =
    (form.mode === "scrape" || form.mode === "full_suite" ? CREDIT_COSTS.scrape : 0) +
    (form.mode === "verify_personalize" || form.mode === "full_suite" ? CREDIT_COSTS.verify : 0) +
    ((form.mode === "verify_personalize" || form.mode === "full_suite") && form.aiEnabled
      ? CREDIT_COSTS.ai_personalize
      : 0);

  const estimatedCost = form.totalResults * costPerLead;
  const canAfford     = balance >= estimatedCost;

  async function handlePreview() {
    setPreviewing(true);
    setPreviewDone(false);
    setError(null);
    try {
      const data = await wsPost<{ leads: PreviewLead[] }>("/api/lead-campaigns/preview", buildApifyInput(form));
      setPreviewLeads(data.leads ?? []);
      setPreviewDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
      setPreviewLeads([]);
      setPreviewDone(true);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleLaunch() {
    if (!form.name) { setError("Campaign name is required"); return; }
    if (form.mode === "verify_personalize") {
      if (form.sourceType === "campaign" && !form.sourceCampaignId) {
        setError("Please select a source campaign"); return;
      }
      if (form.sourceType === "upload" && !form.uploadedFile) {
        setError("Please upload a CSV file"); return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      if (form.mode === "verify_personalize") {
        // For file upload, POST multipart; for campaign source, POST JSON
        if (form.sourceType === "upload" && form.uploadedFile) {
          const fd = new FormData();
          fd.append("name", form.name);
          fd.append("mode", "verify_personalize");
          fd.append("max_leads", String(form.totalResults));
          fd.append("verify_enabled", "true");
          fd.append("personalize_enabled", form.aiEnabled ? "true" : "false");
          fd.append("personalize_prompt", form.offerAngle);
          fd.append("personalize_valid_only", form.personalizeValidOnly ? "true" : "false");
          fd.append("personalize_depth", form.personalizationDepth);
          fd.append("file", form.uploadedFile);
          // Use wsFetch directly — wsPost would JSON.stringify the FormData
          const r = await wsFetch("/api/lead-campaigns/upload", { method: "POST", body: fd });
          if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error ?? r.statusText); }
        } else {
          await wsPost<{ id: string }>("/api/lead-campaigns", {
            name:                   form.name,
            mode:                   "verify_personalize",
            max_leads:              form.totalResults,
            source_campaign_id:     form.sourceCampaignId,
            verify_enabled:         true,
            personalize_enabled:    true,
            personalize_prompt:     form.offerAngle,
            personalize_valid_only: form.personalizeValidOnly,
            personalize_depth:      form.personalizationDepth,
          });
        }
      } else {
        // scrape or full_suite
        const mode: LeadCampaignMode = form.aiEnabled ? "full_suite" : "scrape";
        await wsPost<{ id: string }>("/api/lead-campaigns", {
          name:                   form.name,
          mode,
          max_leads:              form.totalResults,
          apify_actor_id:         "pipelinelabs~lead-scraper-apollo-zoominfo-lusha-ppe",
          apify_input:            buildApifyInput(form),
          verify_enabled:         mode === "full_suite",
          personalize_enabled:    form.aiEnabled,
          personalize_prompt:     form.aiEnabled ? form.offerAngle : null,
          personalize_valid_only: form.personalizeValidOnly,
          personalize_depth:      form.personalizationDepth,
        });
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setSaving(false);
    }
  }

  const TABS: { id: TargetTab; label: string }[] = [
    { id: "person",   label: "Person" },
    { id: "company",  label: "Company" },
    { id: "location", label: "Location" },
    { id: "advanced", label: "Advanced" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-gray-950 border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-white/8 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">New Lead Campaign</h2>
              <p className="text-white/40 text-sm mt-0.5">
                {step === 0 ? "Choose your campaign type"
                  : step === 1 && form.mode === "verify_personalize" ? "Step 1 of 3: Lead Source"
                  : `Step ${step} of 3: ${step === 1 ? "Targeting Criteria" : step === 2 ? "AI Enrichment" : "Preview & Launch"}`}
              </p>
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors mt-0.5">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {step > 0 && <StepBar step={step} />}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Step 0: Mode picker ── */}
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-white/50 text-sm">Select how you want to build your lead list.</p>

              {/* Scrape Only */}
              <button
                type="button"
                onClick={() => { set("mode", "scrape"); set("aiEnabled", false); setStep(1); }}
                className="w-full text-left p-4 bg-white/4 border border-white/10 rounded-xl hover:border-orange-500/40 hover:bg-orange-400/5 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/8 group-hover:bg-orange-400/15 flex items-center justify-center flex-shrink-0 transition-colors">
                    <svg className="w-5 h-5 text-white/60 group-hover:text-orange-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white font-semibold text-sm">Scrape Only</p>
                      <span className="text-xs text-white/40 font-medium bg-white/8 px-2 py-0.5 rounded-full flex-shrink-0">1 cr / lead</span>
                    </div>
                    <p className="text-white/40 text-xs mt-1 leading-relaxed">
                      Find new prospects matching your targeting criteria. Scrape emails, job titles, company info, and LinkedIn profiles.
                    </p>
                  </div>
                </div>
              </button>

              {/* Full Suite */}
              <button
                type="button"
                onClick={() => { set("mode", "full_suite"); set("aiEnabled", true); setStep(1); }}
                className="w-full text-left p-4 bg-orange-500/6 border border-orange-500/20 rounded-xl hover:border-orange-500/50 hover:bg-orange-400/10 transition-all group relative"
              >
                <div className="absolute top-3 right-3">
                  <span className="text-xs font-bold text-orange-300 bg-orange-500/20 border border-orange-500/30 px-2 py-0.5 rounded-full">Most Popular</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0 pr-24">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white font-semibold text-sm">Scrape + AI Personalize</p>
                      <span className="text-xs text-orange-400 font-medium bg-orange-500/15 px-2 py-0.5 rounded-full flex-shrink-0">4 cr / lead</span>
                    </div>
                    <p className="text-white/40 text-xs mt-1 leading-relaxed">
                      Scrape leads then auto-generate a personalized first line for each prospect using AI — ready to drop into your sequences.
                    </p>
                  </div>
                </div>
              </button>

              {/* Verify + Personalize */}
              <button
                type="button"
                onClick={() => { set("mode", "verify_personalize"); set("aiEnabled", true); setStep(1); }}
                className="w-full text-left p-4 bg-white/4 border border-white/10 rounded-xl hover:border-purple-500/40 hover:bg-purple-500/5 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/8 group-hover:bg-purple-500/15 flex items-center justify-center flex-shrink-0 transition-colors">
                    <svg className="w-5 h-5 text-white/60 group-hover:text-purple-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white font-semibold text-sm">Verify + Personalize</p>
                      <span className="text-xs text-white/40 font-medium bg-white/8 px-2 py-0.5 rounded-full flex-shrink-0">3 cr / lead</span>
                    </div>
                    <p className="text-white/40 text-xs mt-1 leading-relaxed">
                      Upload your own leads or use a previous scrape campaign. Verify emails and generate AI personalization lines.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* ── Step 1: Source picker (verify_personalize only) ── */}
          {step === 1 && form.mode === "verify_personalize" && (
            <div className="space-y-5">
              <div>
                <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">Campaign Name (required)</label>
                <input
                  value={form.name}
                  onChange={e => set("name", e.target.value)}
                  placeholder="e.g. Verified SaaS Founders"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-orange-500/60 transition-colors"
                />
              </div>

              {/* Source type toggle */}
              <div>
                <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">Lead Source</label>
                <div className="flex gap-2">
                  {(["campaign", "upload"] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => set("sourceType", type)}
                      className={`flex-1 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider border transition-colors ${
                        form.sourceType === type
                          ? "bg-white/10 border-white/30 text-white"
                          : "bg-transparent border-white/10 text-white/40 hover:border-white/20"
                      }`}
                    >
                      {type === "campaign" ? "Previous Campaign" : "Upload CSV"}
                    </button>
                  ))}
                </div>
              </div>

              {/* From campaign */}
              {form.sourceType === "campaign" && (
                <div>
                  <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">Select Scrape Campaign</label>
                  {loadingCampaigns ? (
                    <div className="flex items-center gap-2 text-white/30 text-sm py-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading campaigns...
                    </div>
                  ) : scrapeCampaigns.length === 0 ? (
                    <p className="text-white/30 text-sm py-2">No completed scrape campaigns yet. Run a Scrape Only campaign first.</p>
                  ) : (
                    <div className="overflow-y-auto space-y-1.5 pr-0.5" style={{ maxHeight: 168 }}>
                      {scrapeCampaigns.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            set("sourceCampaignId", c.id);
                            // Clamp totalResults to campaign's lead count
                            if (form.totalResults > c.total_scraped) set("totalResults", c.total_scraped);
                          }}
                          className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-colors ${
                            form.sourceCampaignId === c.id
                              ? "bg-orange-500/10 border-orange-500/40 text-white"
                              : "bg-white/4 border-white/10 text-white/70 hover:border-white/20"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{c.name}</span>
                            <span className="text-xs text-white/40">{c.total_scraped.toLocaleString()} leads</span>
                          </div>
                          <p className="text-xs text-white/30 mt-0.5">{new Date(c.created_at).toLocaleDateString()}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Upload CSV */}
              {form.sourceType === "upload" && (
                <div>
                  <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">Upload CSV</label>
                  <label className={`flex flex-col items-center justify-center gap-2 w-full py-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                    form.uploadedFile ? "border-orange-500/40 bg-orange-500/5" : "border-white/15 hover:border-white/25 bg-white/3"
                  }`}>
                    <input
                      type="file"
                      accept=".csv"
                      className="sr-only"
                      onChange={e => set("uploadedFile", e.target.files?.[0] ?? null)}
                    />
                    {form.uploadedFile ? (
                      <>
                        <svg className="w-8 h-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-white text-sm font-medium">{form.uploadedFile.name}</p>
                        <p className="text-white/30 text-xs">{(form.uploadedFile.size / 1024).toFixed(1)} KB — click to replace</p>
                      </>
                    ) : (
                      <>
                        <svg className="w-8 h-8 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        <p className="text-white/50 text-sm">Drop a CSV or click to browse</p>
                        <p className="text-white/25 text-xs">Must include an <code className="text-white/40">email</code> column</p>
                      </>
                    )}
                  </label>
                </div>
              )}

              {/* Lead count */}
              {(() => {
                const selectedCampaign = scrapeCampaigns.find(c => c.id === form.sourceCampaignId);
                const sliderMax = form.mode === "verify_personalize" && selectedCampaign
                  ? selectedCampaign.total_scraped
                  : 50_000;
                const sliderMin = form.mode === "verify_personalize" ? Math.min(10, sliderMax) : 500;
                const sliderStep = sliderMax <= 1000 ? 50 : sliderMax <= 10_000 ? 100 : 500;
                const cost = form.totalResults * costPerLead;
                return (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-white/40 text-xs font-semibold uppercase tracking-wider">
                        Max Leads ({form.totalResults.toLocaleString()}{selectedCampaign ? ` of ${selectedCampaign.total_scraped.toLocaleString()}` : ""})
                      </label>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold tabular-nums ${canAfford ? "text-amber-400" : "text-red-400"}`}>
                          {cost.toLocaleString()} cr
                        </span>
                        <span className="text-white/20 text-xs">/ {balance.toLocaleString()} available</span>
                      </div>
                    </div>
                    <input
                      type="range" min={sliderMin} max={sliderMax} step={sliderStep}
                      value={Math.min(Math.max(form.totalResults, sliderMin), sliderMax)}
                      onChange={e => set("totalResults", parseInt(e.target.value))}
                      className="w-full accent-orange-500"
                    />
                    <div className="flex justify-between text-white/30 text-xs mt-1">
                      <span>{sliderMin.toLocaleString()}</span>
                      <span>{sliderMax.toLocaleString()}</span>
                    </div>
                    {!canAfford && (
                      <p className="text-xs text-red-400 mt-1.5">
                        Insufficient credits — <a href="/lead-campaigns/credits" className="underline">buy more</a>
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Step 1: Targeting (scrape / full_suite only) ── */}
          {step === 1 && form.mode !== "verify_personalize" && (
            <>
              <div>
                <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">Campaign Name (required)</label>
                <input
                  value={form.name}
                  onChange={e => set("name", e.target.value)}
                  placeholder="e.g. SaaS Founders — US"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-orange-500/60 transition-colors"
                />
              </div>

              {/* Tabs */}
              <div className="flex gap-0 border border-white/10 rounded-xl overflow-hidden">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                      tab === t.id
                        ? "bg-white/10 text-white border border-white/20 rounded-xl"
                        : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Person tab */}
              {tab === "person" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <MultiSelect label="Job Titles (include)" options={JOB_TITLES} selected={form.personTitleIncludes} onChange={v => set("personTitleIncludes", v)} />
                    <MultiSelect label="Job Titles (exclude)" options={JOB_TITLES} selected={form.personTitleExcludes} onChange={v => set("personTitleExcludes", v)} />
                  </div>
                  <Field label="Additional Titles (free text)" value={form.personTitleExtraIncludes} onChange={v => set("personTitleExtraIncludes", v)} placeholder="Type and press comma..." hint="Comma-separated custom titles" />
                  <div className="grid grid-cols-2 gap-4">
                    <MultiSelect label="Seniority (include)" options={SENIORITY_LEVELS} selected={form.seniorityIncludes} onChange={v => set("seniorityIncludes", v)} />
                    <MultiSelect label="Seniority (exclude)" options={SENIORITY_LEVELS} selected={form.seniorityExcludes} onChange={v => set("seniorityExcludes", v)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <MultiSelect label="Functions (include)" options={JOB_FUNCTIONS} selected={form.personFunctionIncludes} onChange={v => set("personFunctionIncludes", v)} />
                    <MultiSelect label="Functions (exclude)" options={JOB_FUNCTIONS} selected={form.personFunctionExcludes} onChange={v => set("personFunctionExcludes", v)} />
                  </div>
                </div>
              )}

              {/* Company tab */}
              {tab === "company" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Company Names (include)" value={form.companyNamesIncludes} onChange={v => set("companyNamesIncludes", v)} placeholder="Add Company..." hint="Comma-separated" />
                    <Field label="Company Names (exclude)" value={form.companyNamesExcludes} onChange={v => set("companyNamesExcludes", v)} placeholder="Add Company..." hint="Comma-separated" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <MultiSelect label="Industries (include)" options={INDUSTRIES} selected={form.industryIncludes} onChange={v => set("industryIncludes", v)} />
                    <MultiSelect label="Industries (exclude)" options={INDUSTRIES} selected={form.industryExcludes} onChange={v => set("industryExcludes", v)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Company Keywords (include)" value={form.companyKeywordIncludes} onChange={v => set("companyKeywordIncludes", v)} placeholder="Add Keyword..." hint="Comma-separated" />
                    <Field label="Company Keywords (exclude)" value={form.companyKeywordExcludes} onChange={v => set("companyKeywordExcludes", v)} placeholder="Add Keyword..." hint="Comma-separated" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Domains (include)" value={form.companyDomainIncludes} onChange={v => set("companyDomainIncludes", v)} placeholder="salesforce.com..." hint="Comma-separated" />
                    <Field label="Domains (exclude)" value={form.companyDomainExcludes} onChange={v => set("companyDomainExcludes", v)} placeholder="competitor.com..." hint="Comma-separated" />
                  </div>
                  <MultiSelect label="Employee Size" options={EMPLOYEE_SIZES} selected={form.companyHeadcountIncludes} onChange={v => set("companyHeadcountIncludes", v)} />
                </div>
              )}

              {/* Location tab */}
              {tab === "location" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <MultiSelect label="Countries (include)" options={COUNTRIES} selected={form.personLocationCountryIncludes} onChange={v => set("personLocationCountryIncludes", v)} />
                    <MultiSelect label="Countries (exclude)" options={COUNTRIES} selected={form.personLocationCountryExcludes} onChange={v => set("personLocationCountryExcludes", v)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="States/Regions (include)" value={form.personLocationStateIncludes} onChange={v => set("personLocationStateIncludes", v)} placeholder="California, New York..." hint="Comma-separated" />
                    <Field label="States/Regions (exclude)" value={form.personLocationStateExcludes} onChange={v => set("personLocationStateExcludes", v)} placeholder="Texas..." hint="Comma-separated" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Cities (include)" value={form.personLocationCityIncludes} onChange={v => set("personLocationCityIncludes", v)} placeholder="San Francisco, Austin..." hint="Comma-separated" />
                    <Field label="Cities (exclude)" value={form.personLocationCityExcludes} onChange={v => set("personLocationCityExcludes", v)} placeholder="Add City..." hint="Comma-separated" />
                  </div>
                </div>
              )}

              {/* Advanced tab */}
              {tab === "advanced" && (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-white/40 text-xs font-semibold uppercase tracking-wider">
                        Leads to Scrape ({form.totalResults.toLocaleString()})
                      </label>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold tabular-nums ${canAfford ? "text-amber-400" : "text-red-400"}`}>
                          {estimatedCost.toLocaleString()} cr
                        </span>
                        <span className="text-white/20 text-xs">/ {balance.toLocaleString()} available</span>
                      </div>
                    </div>
                    <input
                      type="range" min={500} max={50_000} step={500}
                      value={Math.max(form.totalResults, 500)}
                      onChange={e => set("totalResults", parseInt(e.target.value))}
                      className="w-full accent-orange-500"
                    />
                    <div className="flex justify-between text-white/30 text-xs mt-1">
                      <span>500</span>
                      <span>50,000</span>
                    </div>
                    {!canAfford && (
                      <p className="text-xs text-red-400 mt-1.5">
                        Insufficient credits — <a href="/lead-campaigns/credits" className="underline">buy more</a>
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">Starting Offset</label>
                      <input
                        type="number" min={0} value={form.startOffset}
                        onChange={e => set("startOffset", parseInt(e.target.value) || 0)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/60 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">Email Status</label>
                      <SingleSelect
                        options={[
                          { value: "",           label: "Any" },
                          { value: "verified",   label: "Verified Only" },
                          { value: "unverified", label: "Unverified" },
                        ]}
                        value={form.emailStatus}
                        onChange={v => set("emailStatus", v as "" | "verified" | "unverified")}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    {[
                      { key: "hasEmail" as const, label: "Has Email" },
                      { key: "hasPhone" as const, label: "Has Phone" },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form[key] as boolean}
                          onChange={e => set(key, e.target.checked)}
                          className="w-4 h-4 accent-orange-500"
                        />
                        <span className="text-white/70 text-sm">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Step 2: AI Enrichment ── */}
          {step === 2 && (
            <div className="space-y-5">
              {/* AI toggle card */}
              <div className="flex items-center justify-between p-4 bg-orange-500/8 border border-orange-500/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">AI Verification & Personalization</p>
                    <p className="text-white/40 text-xs">Costs {form.aiEnabled ? `${CREDIT_COSTS.ai_personalize} additional credits` : "0 additional credits"} per lead</p>
                  </div>
                </div>
                <div
                  onClick={() => set("aiEnabled", !form.aiEnabled)}
                  className={`w-11 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${form.aiEnabled ? "bg-orange-500" : "bg-white/15"}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${form.aiEnabled ? "translate-x-5" : "translate-x-0"}`} />
                </div>
              </div>

              {form.aiEnabled && (
                <>
                  <div>
                    <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">Offer Angle (required)</label>
                    <textarea
                      value={form.offerAngle}
                      onChange={e => set("offerAngle", e.target.value)}
                      maxLength={200}
                      rows={3}
                      placeholder="e.g. We help SaaS companies reduce churn by 40% using predictive AI"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-orange-500/60 transition-colors resize-none"
                    />
                    <p className="text-white/30 text-xs mt-1">Craft a compelling hook that the AI will use to personalize each first line. 200 chars max.</p>
                  </div>

                  {/* Personalize which leads */}
                  <div className="flex items-center justify-between p-3.5 bg-white/3 border border-white/8 rounded-xl">
                    <div>
                      <p className="text-white/70 text-sm font-medium">Personalize valid leads only</p>
                      <p className="text-white/30 text-xs mt-0.5">Skip leads with invalid or unknown email status</p>
                    </div>
                    <div
                      onClick={() => set("personalizeValidOnly", !form.personalizeValidOnly)}
                      className={`w-11 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors flex-shrink-0 ml-4 ${form.personalizeValidOnly ? "bg-orange-500" : "bg-white/15"}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${form.personalizeValidOnly ? "translate-x-5" : "translate-x-0"}`} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">Tone of Voice</label>
                      <select
                        value={form.toneOfVoice}
                        onChange={e => set("toneOfVoice", e.target.value as ToneOfVoice)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/60 transition-colors"
                      >
                        <option value="professional">Professional</option>
                        <option value="casual">Casual</option>
                        <option value="friendly">Friendly</option>
                        <option value="direct">Direct</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">Personalization Depth</label>
                      <div className="flex gap-2">
                        {(["standard", "deep"] as PersonalizationDepth[]).map(d => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => set("personalizationDepth", d)}
                            className={`flex-1 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider border transition-colors ${
                              form.personalizationDepth === d
                                ? "bg-white/10 border-white/30 text-white"
                                : "bg-transparent border-white/10 text-white/40 hover:border-white/20"
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Step 3: Preview & Launch (scrape/full_suite) ── */}
          {step === 3 && form.mode !== "verify_personalize" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/4 border border-white/8 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">Preview Leads</p>
                    <p className="text-white/40 text-xs">Verify your search criteria before launching</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setStep(1); setPreviewLeads([]); setPreviewDone(false); }}
                  className="text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors border border-orange-500/30 rounded-lg px-3 py-1.5"
                >
                  Modify Filters
                </button>
              </div>

              {!previewDone ? (
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={previewing}
                  className="w-full py-2.5 bg-white/6 hover:bg-white/10 border border-white/10 rounded-xl text-white/70 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {previewing ? "Fetching preview..." : "Fetch Preview (5 leads)"}
                </button>
              ) : (
                <PreviewTable leads={previewLeads} loading={previewing} />
              )}

              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>
          )}

          {/* ── Step 3: Confirm & Launch (verify_personalize) ── */}
          {step === 3 && form.mode === "verify_personalize" && (
            <div className="space-y-3">
              <p className="text-white/50 text-sm">Review your campaign before launching.</p>

              {/* Summary card */}
              <div className="bg-white/3 border border-white/8 rounded-xl divide-y divide-white/6">
                {[
                  { label: "Campaign name", value: form.name },
                  {
                    label: "Lead source",
                    value: form.sourceType === "campaign"
                      ? (scrapeCampaigns.find(c => c.id === form.sourceCampaignId)?.name ?? "Previous campaign")
                      : form.uploadedFile?.name ?? "Uploaded CSV",
                  },
                  { label: "Max leads",    value: `${form.totalResults.toLocaleString()} leads` },
                  { label: "Operations",  value: "Email verification + AI personalization" },
                  {
                    label: "Personalize",
                    value: form.personalizeValidOnly ? "Valid emails only" : "All leads",
                  },
                  { label: "Offer angle", value: form.offerAngle || "—" },
                ].map(row => (
                  <div key={row.label} className="flex items-start justify-between gap-4 px-4 py-2.5">
                    <span className="text-white/35 text-xs">{row.label}</span>
                    <span className="text-white/70 text-xs text-right">{row.value}</span>
                  </div>
                ))}
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-white/8 px-6 py-4 flex items-center justify-between">
          {/* Credit estimate (hidden on step 0) */}
          {step > 0 ? (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p className={`text-sm font-bold ${canAfford ? "text-white" : "text-red-400"}`}>
                  {estimatedCost.toLocaleString()} Credits
                </p>
                <p className="text-white/30 text-xs">Estimated cost</p>
              </div>
            </div>
          ) : <div />}

          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(s => (s - 1) as Step)}
                className="px-5 py-2 text-white/50 hover:text-white text-sm font-semibold transition-colors"
              >
                Back
              </button>
            )}
            {step === 0 ? null : step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && !form.name) { setError("Campaign name is required"); return; }
                  if (step === 1 && form.mode === "verify_personalize" && form.sourceType === "campaign" && !form.sourceCampaignId) {
                    setError("Please select a source campaign"); return;
                  }
                  if (step === 1 && form.mode === "verify_personalize" && form.sourceType === "upload" && !form.uploadedFile) {
                    setError("Please upload a CSV file"); return;
                  }
                  setError(null); setStep(s => (s + 1) as Step);
                }}
                className="flex items-center gap-2 px-6 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Next Step
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLaunch}
                disabled={saving || !canAfford}
                className="flex items-center gap-2 px-6 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {saving ? "Launching..." : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {form.mode === "verify_personalize" ? "Start Processing" : "Start Scrape"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        {error && step !== 3 && (
          <p className="px-6 pb-3 text-red-400 text-xs">{error}</p>
        )}
      </div>
    </div>
  );
}
