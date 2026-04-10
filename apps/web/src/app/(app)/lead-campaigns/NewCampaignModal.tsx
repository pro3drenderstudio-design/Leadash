"use client";
import { useState, useRef, useEffect } from "react";
import {
  CREDIT_COSTS, JOB_TITLES, SENIORITY_LEVELS, JOB_FUNCTIONS,
  INDUSTRIES, EMPLOYEE_SIZES, COUNTRIES,
  type LeadCampaignMode, type ApifyLeadScraperInput,
  type ToneOfVoice, type PersonalizationDepth,
} from "@/types/lead-campaigns";
import { wsPost } from "@/lib/workspace/client";

interface Props {
  onClose:   () => void;
  onCreated: () => void;
  balance:   number;
}

type Step = 1 | 2 | 3;
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
  // Enrichment
  aiEnabled:           boolean;
  offerAngle:          string;
  toneOfVoice:         ToneOfVoice;
  personalizationDepth: PersonalizationDepth;
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
  aiEnabled: true, offerAngle: "", toneOfVoice: "professional", personalizationDepth: "standard",
};

function csvToArr(s: string): string[] {
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

function buildApifyInput(s: WizardState): ApifyLeadScraperInput {
  const input: ApifyLeadScraperInput = {
    totalResults: s.totalResults,
    hasEmail:     s.hasEmail || undefined,
    hasPhone:     s.hasPhone || undefined,
  };
  if (s.emailStatus) input.emailStatus = s.emailStatus as "verified" | "unverified";
  if (s.startOffset) input.startOffset = s.startOffset;
  if (s.personTitleIncludes.length)           input.personTitleIncludes = s.personTitleIncludes;
  if (s.personTitleExcludes.length)           input.personTitleExcludes = s.personTitleExcludes;
  if (s.personTitleExtraIncludes)             input.personTitleExtraIncludes = csvToArr(s.personTitleExtraIncludes);
  if (s.seniorityIncludes.length)             input.seniorityIncludes = s.seniorityIncludes;
  if (s.seniorityExcludes.length)             input.seniorityExcludes = s.seniorityExcludes;
  if (s.personFunctionIncludes.length)        input.personFunctionIncludes = s.personFunctionIncludes;
  if (s.personFunctionExcludes.length)        input.personFunctionExcludes = s.personFunctionExcludes;
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

// ─── Multi-select pill component ─────────────────────────────────────────────
function MultiSelect({
  label, options, selected, onChange,
}: {
  label: string; options: readonly string[]; selected: string[];
  onChange: (v: string[]) => void;
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

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  }

  return (
    <div ref={ref} className="relative">
      <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
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
            <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/15 border border-blue-500/25 rounded text-xs text-blue-400">
              {v}
              <button type="button" onClick={() => toggle(v)} className="hover:text-blue-300">×</button>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto bg-gray-900 border border-white/15 rounded-xl shadow-2xl">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="w-3.5 h-3.5 accent-blue-500"
              />
              <span className={selected.includes(opt) ? "text-white" : "text-white/60"}>{opt}</span>
            </label>
          ))}
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
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors"
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
          className={`h-1 flex-1 rounded-full transition-all duration-500 ${s <= step ? "bg-blue-500" : "bg-white/10"}`}
        />
      ))}
    </div>
  );
}

// ─── Preview table ────────────────────────────────────────────────────────────

// Handles both camelCase and Apollo snake_case field names
interface PreviewLead {
  // name
  full_name?: string; first_name?: string; last_name?: string;
  firstName?: string; lastName?: string; name?: string;
  // title
  person_title?: string; title?: string; headline?: string;
  // company
  organization_name?: string; company_name?: string; company?: string;
  // industry
  organization_industry?: string; industry?: string;
  // location
  location?: string; city?: string; state?: string; country?: string;
  // links
  person_linkedin_url?: string; linkedin_url?: string; linkedinUrl?: string;
  organization_linkedin_url?: string; company_linkedin_url?: string;
  organization_website_url?: string; website_url?: string; website?: string;
  [key: string]: unknown;
}

function pick(lead: PreviewLead, ...keys: (keyof PreviewLead)[]): string {
  for (const k of keys) {
    const v = lead[k];
    if (v && typeof v === "string") return v;
  }
  return "";
}

function IconLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer" title={title}
      onClick={e => e.stopPropagation()}
      className="text-white/25 hover:text-white/60 transition-colors"
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
            const firstName = pick(l, "first_name", "firstName") || pick(l, "full_name", "name").split(" ")[0];
            const lastName  = pick(l, "last_name",  "lastName")  || pick(l, "full_name", "name").split(" ").slice(1).join(" ");
            const name      = [firstName, lastName].filter(Boolean).join(" ") || "—";
            const initials  = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
            const title     = pick(l, "person_title", "title", "headline");
            const company   = pick(l, "organization_name", "company_name", "company");
            const industry  = pick(l, "organization_industry", "industry");
            const location  = pick(l, "location", "city", "state", "country");
            const personLi  = pick(l, "person_linkedin_url", "linkedin_url", "linkedinUrl");
            const companyLi = pick(l, "organization_linkedin_url", "company_linkedin_url");
            const website   = pick(l, "organization_website_url", "website_url", "website");

            return (
              <tr key={i} className={`${i !== leads.length - 1 ? "border-b border-white/5" : ""}`}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/50 flex-shrink-0">{initials}</div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-white font-medium">{name}</p>
                        {personLi && <IconLink href={personLi} title="LinkedIn"><LinkedInIcon /></IconLink>}
                      </div>
                      <p className="text-white/40">{title || <span className="text-white/20 italic">No title</span>}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-white/70">{company || <span className="text-white/25 italic">Unknown</span>}</p>
                    {companyLi && <IconLink href={companyLi} title="Company LinkedIn"><LinkedInIcon /></IconLink>}
                    {website   && <IconLink href={website.startsWith("http") ? website : `https://${website}`} title="Website"><GlobeIcon /></IconLink>}
                  </div>
                  <p className="text-white/40">{industry || <span className="text-white/20 italic">Unknown industry</span>}</p>
                </td>
                <td className="px-3 py-2.5 text-white/50">{location || "—"}</td>
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
  const [step, setStep]         = useState<Step>(1);
  const [tab, setTab]           = useState<TargetTab>("person");
  const [form, setForm]         = useState<WizardState>({ ...DEFAULT });
  const [previewing, setPreviewing] = useState(false);
  const [previewLeads, setPreviewLeads] = useState<PreviewLead[]>([]);
  const [previewDone, setPreviewDone]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  function set<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  const costPerLead = form.mode === "scrape" ? CREDIT_COSTS.scrape
    : form.aiEnabled && form.mode === "full_suite" ? CREDIT_COSTS.full_suite
    : form.aiEnabled ? CREDIT_COSTS.verify_personalize
    : CREDIT_COSTS.scrape;

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
    setSaving(true);
    setError(null);
    try {
      const mode: LeadCampaignMode = form.aiEnabled
        ? (form.mode === "scrape" ? "full_suite" : "verify_personalize")
        : form.mode;

      const data = await wsPost<{ id: string }>("/api/lead-campaigns", {
        name:                form.name,
        mode,
        max_leads:           form.totalResults,
        apify_actor_id:      "pipelinelabs~lead-scraper-apollo-zoominfo-lusha-ppe",
        apify_input:         buildApifyInput(form),
        verify_enabled:      false,
        personalize_enabled: form.aiEnabled,
        personalize_prompt:  form.aiEnabled ? form.offerAngle : null,
      });
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
                Step {step} of 3: {step === 1 ? "Targeting Criteria" : step === 2 ? "AI Enrichment" : "Preview & Launch"}
              </p>
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors mt-0.5">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <StepBar step={step} />
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Step 1: Targeting ── */}
          {step === 1 && (
            <>
              <div>
                <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">Campaign Name (required)</label>
                <input
                  value={form.name}
                  onChange={e => set("name", e.target.value)}
                  placeholder="e.g. SaaS Founders — US"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors"
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
                    <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">
                      Number of Leads to Scrape ({form.totalResults.toLocaleString()})
                    </label>
                    <input
                      type="range" min={10} max={1000} step={10}
                      value={form.totalResults}
                      onChange={e => set("totalResults", parseInt(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                    <div className="flex justify-between text-white/30 text-xs mt-1">
                      <span>10 Leads</span>
                      <span>1,000 Leads</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">Starting Offset</label>
                      <input
                        type="number" min={0} value={form.startOffset}
                        onChange={e => set("startOffset", parseInt(e.target.value) || 0)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/60 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">Email Status</label>
                      <select
                        value={form.emailStatus}
                        onChange={e => set("emailStatus", e.target.value as "" | "verified" | "unverified")}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/60 transition-colors"
                      >
                        <option value="">Any</option>
                        <option value="verified">Verified Only</option>
                        <option value="unverified">Unverified</option>
                      </select>
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
                          className="w-4 h-4 accent-blue-500"
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
              <div className="flex items-center justify-between p-4 bg-blue-500/8 border border-blue-500/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">AI Verification & Personalization</p>
                    <p className="text-white/40 text-xs">Costs {form.aiEnabled ? "1 additional credit" : "0 additional credits"} per lead</p>
                  </div>
                </div>
                <div
                  onClick={() => set("aiEnabled", !form.aiEnabled)}
                  className={`w-11 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${form.aiEnabled ? "bg-blue-600" : "bg-white/15"}`}
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
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors resize-none"
                    />
                    <p className="text-white/30 text-xs mt-1">Craft a compelling hook that the AI will use to personalize each first line. 200 chars max.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">Tone of Voice</label>
                      <select
                        value={form.toneOfVoice}
                        onChange={e => set("toneOfVoice", e.target.value as ToneOfVoice)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/60 transition-colors"
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

          {/* ── Step 3: Preview & Launch ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/4 border border-white/8 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">Previewing Leads</p>
                    <p className="text-white/40 text-xs">Verify your search criteria before launching</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setStep(1); setPreviewLeads([]); setPreviewDone(false); }}
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/30 rounded-lg px-3 py-1.5"
                >
                  Modify Search Filters
                </button>
              </div>

              {!previewDone ? (
                <div>
                  <button
                    type="button"
                    onClick={handlePreview}
                    disabled={previewing}
                    className="w-full py-2.5 bg-white/6 hover:bg-white/10 border border-white/10 rounded-xl text-white/70 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {previewing ? "Fetching preview..." : "Fetch Preview (5 leads)"}
                  </button>
                </div>
              ) : (
                <PreviewTable leads={previewLeads} loading={previewing} />
              )}

              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-white/8 px-6 py-4 flex items-center justify-between">
          {/* Credit estimate */}
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

          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(s => (s - 1) as Step)}
                className="px-5 py-2 text-white/50 hover:text-white text-sm font-semibold transition-colors"
              >
                Back
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={() => { if (step === 1 && !form.name) { setError("Campaign name is required"); return; } setError(null); setStep(s => (s + 1) as Step); }}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
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
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {saving ? "Launching..." : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Start Scrape
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
