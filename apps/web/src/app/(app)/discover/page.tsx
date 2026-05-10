"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { wsGet, wsFetch } from "@/lib/workspace/client";
import {
  SENIORITY_OPTIONS, DEPARTMENT_OPTIONS, COMPANY_SIZE_OPTIONS, INDUSTRY_OPTIONS,
  FUNDING_STAGE_OPTIONS, EMPLOYEE_RANGE_OPTIONS, REVENUE_RANGE_OPTIONS,
  type DiscoverResult, type DiscoverSearchResponse,
  type DiscoverCompanyResult, type DiscoverCompanySearchResponse,
  type SavedSearch,
} from "@/types/discover";

// ── Icons ─────────────────────────────────────────────────────────────────────

function Spinner({ sm }: { sm?: boolean }) {
  return (
    <svg className={`animate-spin text-orange-500 ${sm ? "w-3.5 h-3.5" : "w-5 h-5"}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
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

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg className={`w-3.5 h-3.5 text-white/30 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
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

// ── Shared UI ─────────────────────────────────────────────────────────────────

function EmailPill({ status }: { status: string }) {
  const cls =
    status === "verified"     ? "bg-green-500/15 text-green-400 border-green-500/25" :
    status === "extrapolated" ? "bg-blue-500/15 text-blue-400 border-blue-500/25" :
    status === "invalid"      ? "bg-red-500/15 text-red-400 border-red-500/25" :
    status === "risky"        ? "bg-amber-500/15 text-amber-400 border-amber-500/25" :
                                "bg-white/8 text-white/25 border-white/10";
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
      {status === "extrapolated" ? "guessed" : status}
    </span>
  );
}

function Avatar({ first, last, size = "md" }: { first: string | null; last: string | null; size?: "sm" | "md" }) {
  const initials = `${(first ?? "?")[0]}${(last ?? "")[0] ?? ""}`.toUpperCase();
  const colors = ["bg-orange-500/25 text-orange-300", "bg-blue-500/25 text-blue-300", "bg-purple-500/25 text-purple-300", "bg-green-500/25 text-green-300", "bg-pink-500/25 text-pink-300"];
  const color  = colors[(first?.charCodeAt(0) ?? 0) % colors.length];
  const sz = size === "sm" ? "w-6 h-6 text-[9px]" : "w-8 h-8 text-[11px]";
  return <div className={`${sz} rounded-full ${color} flex items-center justify-center font-bold flex-shrink-0`}>{initials}</div>;
}

// ── Sidebar building blocks ───────────────────────────────────────────────────

function FilterSection({ title, count, children, defaultOpen = true }: { title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/6">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/3 transition-colors">
        <span className="text-[11px] font-semibold text-white/45 uppercase tracking-wider">{title}</span>
        <div className="flex items-center gap-1.5">
          {!!count && <span className="bg-orange-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{count > 9 ? "9+" : count}</span>}
          <ChevronDown open={open} />
        </div>
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

function CheckboxGroup({ options, selected, onChange }: { options: { label: string; value: string }[]; selected: string[]; onChange: (v: string[]) => void }) {
  function toggle(val: string) { onChange(selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val]); }
  return (
    <div className="px-4 space-y-0.5 max-h-52 overflow-y-auto">
      {options.map(o => (
        <label key={o.value} className="flex items-center gap-2.5 py-1 cursor-pointer group">
          <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} className="w-3.5 h-3.5 accent-orange-500 flex-shrink-0 rounded" />
          <span className="text-xs text-white/50 group-hover:text-white/80 transition-colors">{o.label}</span>
        </label>
      ))}
    </div>
  );
}

function StringCheckboxGroup({ options, selected, onChange }: { options: readonly string[]; selected: string[]; onChange: (v: string[]) => void }) {
  return <CheckboxGroup options={options.map(o => ({ label: o, value: o }))} selected={selected} onChange={onChange} />;
}

function TagInput({ tags, onAdd, onRemove, placeholder }: { tags: string[]; onAdd: (t: string) => void; onRemove: (t: string) => void; placeholder: string }) {
  const [val, setVal] = useState("");
  function commit() { const t = val.trim(); if (t && !tags.includes(t)) onAdd(t); setVal(""); }
  return (
    <div className="mx-3">
      <div className="flex flex-wrap gap-1 mb-1.5">
        {tags.map(t => (
          <span key={t} className="flex items-center gap-1 bg-orange-500/15 text-orange-300 text-[11px] px-2 py-0.5 rounded-full border border-orange-500/20">
            {t}
            <button onClick={() => onRemove(t)} className="text-orange-400/60 hover:text-orange-300 leading-none">×</button>
          </span>
        ))}
      </div>
      <input value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); } }}
        onBlur={commit} placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/70 placeholder-white/25 focus:outline-none focus:border-orange-500/40 transition-colors" />
    </div>
  );
}

function TextFilter({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="px-3">
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/70 placeholder-white/25 focus:outline-none focus:border-orange-500/40 transition-colors" />
    </div>
  );
}

// ── Campaign picker modal ─────────────────────────────────────────────────────

type Campaign = { id: string; name: string; total_enrolled: number; status?: string };

function CampaignModal({ count, onClose, onConfirm }: {
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
    if (creating && newName.trim()) {
      onConfirm(null, newName.trim());
    } else if (selected) {
      onConfirm(selected, null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#1a1a1a] border border-white/10 rounded-xl w-[420px] max-h-[520px] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div>
            <h2 className="text-sm font-bold text-white">Add to Campaign</h2>
            <p className="text-xs text-white/35 mt-0.5">{count} lead{count !== 1 ? "s" : ""} will be enrolled</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors"><XIcon /></button>
        </div>

        <div className="px-5 py-3 border-b border-white/8">
          {!creating ? (
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search campaigns…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 placeholder-white/25 focus:outline-none focus:border-orange-500/40" />
          ) : (
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New campaign name…" autoFocus
              className="w-full bg-white/5 border border-orange-500/40 rounded-lg px-3 py-1.5 text-xs text-white/70 placeholder-white/25 focus:outline-none" />
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {!creating && (
            <button onClick={() => setCreating(true)} className="w-full flex items-center gap-2.5 px-5 py-2.5 hover:bg-white/4 transition-colors text-left">
              <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-sm">+</div>
              <span className="text-xs text-orange-400 font-medium">Create new campaign</span>
            </button>
          )}
          {creating && (
            <button onClick={() => setCreating(false)} className="w-full flex items-center gap-2 px-5 py-2 hover:bg-white/4 transition-colors text-left text-xs text-white/40">
              ← Back to existing campaigns
            </button>
          )}
          {!creating && (loading ? (
            <div className="flex justify-center py-6"><Spinner sm /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs text-white/25 py-6">No campaigns found</p>
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
            {creating ? "Create & Add" : "Add to Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

type DrawerTarget = { type: "person"; id: string } | { type: "company"; id: string };

function PersonDrawer({ id, onClose, onReveal, onViewCompany }: {
  id: string;
  onClose: () => void;
  onReveal: (id: string) => Promise<void>;
  onViewCompany: (companyId: string) => void;
}) {
  const [data, setData]       = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealing, setRevealing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await wsGet<Record<string, unknown>>(`/api/discover/people/${id}`);
      setData(d);
    } catch { /* ignore */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleReveal() {
    setRevealing(true);
    await onReveal(id);
    await load();
    setRevealing(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-40"><Spinner /></div>
  );
  if (!data) return (
    <div className="px-5 py-4 text-xs text-white/30">Could not load profile</div>
  );

  const revealed = data.revealed as boolean;
  const email = data.email_preview as string | null;
  const phone = data.phone_preview as string | null;
  const coworkers = (data.coworkers as DiscoverResult[]) ?? [];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-white/8">
        <div className="flex items-start gap-3">
          <Avatar first={data.first_name as string | null} last={data.last_name as string | null} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white truncate">
                {([data.first_name as string | null, data.last_name as string | null]).filter(Boolean).join(" ") || "Unknown"}
              </h3>
              {!!data.linkedin_url && (
                <a href={data.linkedin_url as string} target="_blank" rel="noreferrer"
                  className="text-blue-400/60 hover:text-blue-400 transition-colors flex-shrink-0"><LinkedInIcon /></a>
              )}
            </div>
            <p className="text-xs text-white/50 truncate mt-0.5">{(data.title as string | null) ?? "—"}</p>
            {!!data.seniority && <span className="text-[9px] text-white/30 uppercase tracking-wider">{data.seniority as string}</span>}
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="px-5 py-4 border-b border-white/8 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Contact</span>
          {!revealed && (
            <button onClick={handleReveal} disabled={revealing}
              className="flex items-center gap-1.5 text-[10px] text-orange-400 hover:text-orange-300 font-semibold transition-colors disabled:opacity-50">
              {revealing ? <Spinner sm /> : <LockIcon />}
              Unlock (0.5 cr)
            </button>
          )}
          {revealed && <span className="text-[10px] text-green-400 font-semibold">Unlocked</span>}
        </div>
        <div className="space-y-2">
          {(data.has_email as boolean) && (
            <div className="flex items-center gap-2.5">
              <svg className="w-3.5 h-3.5 text-white/25 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              <span className={`text-xs ${revealed ? "text-white/80" : "text-white/30"} font-mono`}>{email ?? "—"}</span>
              {!!data.email_status && <EmailPill status={data.email_status as string} />}
            </div>
          )}
          {(data.has_phone as boolean) && (
            <div className="flex items-center gap-2.5">
              <svg className="w-3.5 h-3.5 text-white/25 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
              <span className={`text-xs ${revealed ? "text-white/80" : "text-white/30"} font-mono`}>{phone ?? "—"}</span>
            </div>
          )}
        </div>
      </div>

      {/* Company */}
      {!!data.company_name && (
        <div className="px-5 py-4 border-b border-white/8">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider block mb-2">Company</span>
          <button onClick={() => data.company_id && onViewCompany(data.company_id as string)}
            className="flex items-center gap-2 hover:bg-white/4 rounded-lg px-2 py-1.5 -mx-2 transition-colors w-full text-left">
            <div className="w-7 h-7 rounded bg-white/8 flex items-center justify-center text-[10px] font-bold text-white/40 flex-shrink-0">
              {((data.company_name as string)[0] ?? "?").toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white/80 truncate">{data.company_name as string}</p>
              <p className="text-[10px] text-white/35 truncate">
                {([data.company_industry as string | null, data.company_size as string | null]).filter(Boolean).join(" · ")}
              </p>
            </div>
          </button>
          {!!(data.company_domain ?? data.company_website) && (
            <a href={`https://${(data.company_domain ?? data.company_website) as string}`} target="_blank" rel="noreferrer"
              className="text-[10px] text-blue-400/60 hover:text-blue-400 mt-1.5 block transition-colors">
              {(data.company_domain ?? data.company_website) as string}
            </a>
          )}
        </div>
      )}

      {/* Location */}
      {!!(data.city || data.country) && (
        <div className="px-5 py-3 border-b border-white/8">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider block mb-1">Location</span>
          <p className="text-xs text-white/50">{([data.city as string | null, data.state as string | null, data.country as string | null]).filter(Boolean).join(", ")}</p>
        </div>
      )}

      {/* Coworkers */}
      {coworkers.length > 0 && (
        <div className="px-5 py-4">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider block mb-2">
            People at {data.company_name as string}
          </span>
          <div className="space-y-2">
            {coworkers.map(cw => (
              <div key={cw.id} className="flex items-center gap-2.5 py-1">
                <Avatar first={cw.first_name} last={cw.last_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white/70 truncate">{[cw.first_name, cw.last_name].filter(Boolean).join(" ")}</p>
                  <p className="text-[10px] text-white/35 truncate">{cw.title ?? "—"}</p>
                </div>
                {cw.has_email && <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cw.revealed ? "bg-green-400" : "bg-white/20"}`} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CompanyDrawer({ id, onClose, onRevealPerson, onViewPerson }: {
  id: string;
  onClose: () => void;
  onRevealPerson: (personId: string) => Promise<void>;
  onViewPerson: (personId: string) => void;
}) {
  const [data, setData]       = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await wsGet<Record<string, unknown>>(`/api/discover/companies/${id}`);
      setData(d);
    } catch { /* ignore */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center h-40"><Spinner /></div>;
  if (!data) return <div className="px-5 py-4 text-xs text-white/30">Could not load company</div>;

  const people = (data.people as DiscoverResult[]) ?? [];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 pt-5 pb-4 border-b border-white/8">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center text-sm font-bold text-white/50 flex-shrink-0">
            {((data.name as string)?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white truncate">{data.name as string}</h3>
              {!!data.linkedin_url && (
                <a href={data.linkedin_url as string} target="_blank" rel="noreferrer" className="text-blue-400/60 hover:text-blue-400 transition-colors"><LinkedInIcon /></a>
              )}
            </div>
            {!!data.domain && <a href={`https://${data.domain as string}`} target="_blank" rel="noreferrer" className="text-[11px] text-blue-400/60 hover:text-blue-400 transition-colors">{data.domain as string}</a>}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {!!data.industry && <span className="text-[10px] text-white/40">{data.industry as string}</span>}
          {!!data.size_range && <span className="text-[10px] text-white/40">{data.size_range as string} employees</span>}
          {!!data.country && <span className="text-[10px] text-white/40">{([data.city as string | null, data.country as string | null]).filter(Boolean).join(", ")}</span>}
        </div>
      </div>

      <div className="px-5 py-3">
        <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider block mb-2">
          People ({data.people_total as number})
        </span>
        <div className="space-y-1">
          {people.map(p => (
            <div key={p.id} className="flex items-center gap-2.5 py-1.5 rounded-lg hover:bg-white/3 px-2 -mx-2 transition-colors cursor-pointer"
              onClick={() => onViewPerson(p.id)}>
              <Avatar first={p.first_name} last={p.last_name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white/70 truncate">{[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}</p>
                <p className="text-[10px] text-white/35 truncate">{p.title ?? "—"}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
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

export default function DiscoverPage() {
  const [mode, setMode] = useState<"people" | "companies">("people");

  // ── People filter state ───────────────────────────────────────────────────
  const [keyword,      setKeyword]      = useState("");
  const [titleKws,     setTitleKws]     = useState<string[]>([]);
  const [seniorities,  setSeniorities]  = useState<string[]>([]);
  const [departments,  setDepartments]  = useState<string[]>([]);
  const [countries,    setCountries]    = useState<string[]>([]);
  const [city,         setCity]         = useState("");
  const [companies,    setCompanies]    = useState<string[]>([]);
  const [industries,   setIndustries]   = useState<string[]>([]);
  const [companySizes, setCompanySizes] = useState<string[]>([]);
  const [emailStatus,  setEmailStatus]  = useState<"any" | "has_email" | "verified">("has_email");

  // ── Company filter state ──────────────────────────────────────────────────
  const [coKeyword,       setCoKeyword]       = useState("");
  const [coIndustries,    setCoIndustries]    = useState<string[]>([]);
  const [coSizes,         setCoSizes]         = useState<string[]>([]);
  const [coCountries,     setCoCountries]     = useState<string[]>([]);
  const [coCity,          setCoCity]          = useState("");
  const [coFundingStages, setCoFundingStages] = useState<string[]>([]);
  const [coEmployeeRange, setCoEmployeeRange] = useState<{ min: number; max: number } | null>(null);
  const [coRevenueRange,  setCoRevenueRange]  = useState<{ min: number; max: number } | null>(null);
  const [coHasPeople,     setCoHasPeople]     = useState(false);

  // ── Result state ──────────────────────────────────────────────────────────
  const [results,         setResults]         = useState<DiscoverResult[]>([]);
  const [companyResults,  setCompanyResults]   = useState<DiscoverCompanyResult[]>([]);
  const [total,           setTotal]           = useState(0);
  const [page,            setPage]            = useState(1);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [selected,      setSelected]      = useState<Set<string>>(new Set());
  const [exporting,     setExporting]     = useState(false);
  const [revealing,     setRevealing]     = useState(false);
  const [exportMsg,     setExportMsg]     = useState<{ ok: boolean; text: string } | null>(null);
  const [balance,       setBalance]       = useState<number | null>(null);
  const [drawer,        setDrawer]        = useState<DrawerTarget | null>(null);
  const [showCampaign,  setShowCampaign]  = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savingSearch,  setSavingSearch]  = useState(false);
  const [saveNameVal,   setSaveNameVal]   = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  const limit      = 25;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const activePeopleFilterCount =
    titleKws.length + seniorities.length + departments.length + countries.length +
    (city ? 1 : 0) + companies.length + industries.length + companySizes.length +
    (emailStatus !== "has_email" ? 1 : 0) + (keyword ? 1 : 0);

  const activeCoFilterCount =
    coIndustries.length + coSizes.length + coCountries.length + (coCity ? 1 : 0) + (coKeyword ? 1 : 0) +
    coFundingStages.length + (coEmployeeRange ? 1 : 0) + (coRevenueRange ? 1 : 0) + (coHasPeople ? 1 : 0);

  const activeFilterCount = mode === "people" ? activePeopleFilterCount : activeCoFilterCount;

  // Fetch balance + saved searches on mount
  useEffect(() => {
    wsGet<{ lead_credits_balance: number }>("/api/settings/workspace")
      .then(d => setBalance(d.lead_credits_balance ?? 0)).catch(() => {});
    wsGet<SavedSearch[]>("/api/discover/saved-searches")
      .then(d => setSavedSearches(d ?? [])).catch(() => {});
  }, []);

  // ── Search ────────────────────────────────────────────────────────────────
  const searchPeople = useCallback(async (p = 1) => {
    setLoading(true); setError(null); setSelected(new Set()); setExportMsg(null);
    try {
      const params = new URLSearchParams();
      if (keyword)            params.set("q",            keyword);
      if (titleKws.length)    params.set("title",        titleKws.join(","));
      if (seniorities.length) params.set("seniority",    seniorities.join(","));
      if (departments.length) params.set("department",   departments.join(","));
      if (countries.length)   params.set("country",      countries.join(","));
      if (city)               params.set("city",         city);
      if (companies.length)   params.set("company",      companies.join(","));
      if (industries.length)  params.set("industry",     industries.join(","));
      if (companySizes.length) params.set("company_size", companySizes.join(","));
      params.set("email_status", emailStatus);
      params.set("page", String(p)); params.set("limit", String(limit));
      const data = await wsGet<DiscoverSearchResponse>(`/api/discover/search?${params}`);
      setResults(data.results ?? []); setTotal(data.total ?? 0); setPage(p);
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed"); }
    finally { setLoading(false); }
  }, [keyword, titleKws, seniorities, departments, countries, city, companies, industries, companySizes, emailStatus]);

  const searchCompanies = useCallback(async (p = 1) => {
    setLoading(true); setError(null); setSelected(new Set()); setExportMsg(null);
    try {
      const params = new URLSearchParams();
      if (coKeyword)               params.set("q",             coKeyword);
      if (coIndustries.length)     params.set("industry",      coIndustries.join(","));
      if (coSizes.length)          params.set("company_size",  coSizes.join(","));
      if (coCountries.length)      params.set("country",       coCountries.join(","));
      if (coCity)                  params.set("city",          coCity);
      if (coFundingStages.length)  params.set("funding_stage", coFundingStages.join(","));
      if (coEmployeeRange?.min)    params.set("employee_min",  String(coEmployeeRange.min));
      if (coEmployeeRange?.max)    params.set("employee_max",  String(coEmployeeRange.max));
      if (coRevenueRange?.min)     params.set("revenue_min",   String(coRevenueRange.min));
      if (coRevenueRange?.max)     params.set("revenue_max",   String(coRevenueRange.max));
      params.set("has_people", String(coHasPeople));
      params.set("page", String(p)); params.set("limit", String(limit));
      const data = await wsGet<DiscoverCompanySearchResponse>(`/api/discover/companies/search?${params}`);
      setCompanyResults(data.results ?? []); setTotal(data.total ?? 0); setPage(p);
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed"); }
    finally { setLoading(false); }
  }, [coKeyword, coIndustries, coSizes, coCountries, coCity, coFundingStages, coEmployeeRange, coRevenueRange, coHasPeople]);

  const search = mode === "people" ? searchPeople : searchCompanies;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(1), 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, titleKws, seniorities, departments, countries, city, companies, industries, companySizes, emailStatus,
      coKeyword, coIndustries, coSizes, coCountries, coCity, coFundingStages, coEmployeeRange, coRevenueRange, coHasPeople, mode]);

  function clearAll() {
    if (mode === "people") {
      setKeyword(""); setTitleKws([]); setSeniorities([]); setDepartments([]);
      setCountries([]); setCity(""); setCompanies([]); setIndustries([]);
      setCompanySizes([]); setEmailStatus("has_email");
    } else {
      setCoKeyword(""); setCoIndustries([]); setCoSizes([]); setCoCountries([]); setCoCity("");
      setCoFundingStages([]); setCoEmployeeRange(null); setCoRevenueRange(null); setCoHasPeople(false);
    }
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  const visibleResults = mode === "people" ? results : companyResults;
  function toggleSelect(id: string) { setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleAll() { setSelected(selected.size === visibleResults.length ? new Set() : new Set(visibleResults.map(r => r.id))); }

  // ── Reveal ────────────────────────────────────────────────────────────────
  async function revealIds(ids: string[]) {
    setRevealing(true);
    try {
      const res = await wsFetch("/api/discover/reveal", {
        method: "POST", body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        setExportMsg({ ok: false, text: j.error ?? "Reveal failed" });
        return;
      }
      const data = await res.json() as { reveals: Record<string, { email: string | null; phone: string | null; email_status: string | null }>; credits_used: number };
      // Update results in place
      setResults(prev => prev.map(r => {
        const rev = data.reveals[r.id];
        if (!rev) return r;
        return { ...r, email_preview: rev.email, phone_preview: rev.phone, email_status: (rev.email_status as DiscoverResult["email_status"]) ?? r.email_status, revealed: true };
      }));
      if (data.credits_used > 0) setBalance(b => (b ?? 0) - data.credits_used);
      setExportMsg({ ok: true, text: `${ids.length} lead${ids.length !== 1 ? "s" : ""} unlocked` });
    } catch (e) {
      setExportMsg({ ok: false, text: e instanceof Error ? e.message : "Reveal failed" });
    } finally { setRevealing(false); }
  }

  async function revealSelected() { await revealIds(Array.from(selected)); }

  // ── Export ────────────────────────────────────────────────────────────────
  async function handleExport(format: "csv" | "campaign", campaignId?: string | null, campaignName?: string | null) {
    if (!selected.size) return;
    setExporting(true); setExportMsg(null); setShowCampaign(false);
    try {
      const res = await wsFetch("/api/discover/export", {
        method: "POST",
        body: JSON.stringify({ ids: Array.from(selected), format, campaign_id: campaignId, campaign_name: campaignName }),
      });
      if (format === "csv" && res.ok) {
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        Object.assign(document.createElement("a"), { href: url, download: `leadash-discover-${Date.now()}.csv` }).click();
        URL.revokeObjectURL(url);
        setExportMsg({ ok: true, text: `${selected.size} leads exported` });
        setSelected(new Set());
      } else if (res.ok) {
        const j = await res.json();
        setExportMsg({ ok: true, text: `${j.leads_added} leads added to campaign` });
        if (j.credits_used > 0) setBalance(b => (b ?? 0) - j.credits_used);
        setSelected(new Set());
      } else {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        setExportMsg({ ok: false, text: j.error ?? "Export failed" });
      }
    } catch (e) {
      setExportMsg({ ok: false, text: e instanceof Error ? e.message : "Export failed" });
    } finally { setExporting(false); }
  }

  // ── Verify ────────────────────────────────────────────────────────────────
  async function handleVerify() {
    if (!selected.size) return;
    setExporting(true); setExportMsg(null);
    try {
      const res = await fetch("/api/discover/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: Array.from(selected), format: "campaign" }),
      });
      const j = await res.json();
      if (!res.ok) { setExportMsg({ ok: false, text: j.error ?? "Failed" }); return; }
      setExportMsg({ ok: true, text: `${j.leads_added} leads added to pool for verification` });
      setSelected(new Set());
    } catch (e) {
      setExportMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" });
    } finally { setExporting(false); }
  }

  // ── Saved searches ────────────────────────────────────────────────────────
  async function saveSearch() {
    if (!saveNameVal.trim()) return;
    setSavingSearch(true);
    try {
      const filters = mode === "people"
        ? { keyword, titleKws, seniorities, departments, countries, city, companies, industries, companySizes, emailStatus }
        : { coKeyword, coIndustries, coSizes, coCountries, coCity, coHasPeople, coFundingStages, coEmployeeRange, coRevenueRange };
      const res = await fetch("/api/discover/saved-searches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ name: saveNameVal.trim(), mode, filters }),
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
    const f = s.filters as Record<string, unknown>;
    if (s.mode === "people") {
      setKeyword((f.keyword as string) ?? "");
      setTitleKws((f.titleKws as string[]) ?? []);
      setSeniorities((f.seniorities as string[]) ?? []);
      setDepartments((f.departments as string[]) ?? []);
      setCountries((f.countries as string[]) ?? []);
      setCity((f.city as string) ?? "");
      setCompanies((f.companies as string[]) ?? []);
      setIndustries((f.industries as string[]) ?? []);
      setCompanySizes((f.companySizes as string[]) ?? []);
      setEmailStatus((f.emailStatus as "any" | "has_email" | "verified") ?? "has_email");
    } else {
      setCoKeyword((f.coKeyword as string) ?? "");
      setCoIndustries((f.coIndustries as string[]) ?? []);
      setCoSizes((f.coSizes as string[]) ?? []);
      setCoCountries((f.coCountries as string[]) ?? []);
      setCoCity((f.coCity as string) ?? "");
      setCoHasPeople((f.coHasPeople as boolean) ?? false);
      setCoFundingStages((f.coFundingStages as string[]) ?? []);
      setCoEmployeeRange((f.coEmployeeRange as { min: number; max: number } | null) ?? null);
      setCoRevenueRange((f.coRevenueRange as { min: number; max: number } | null) ?? null);
    }
  }

  async function deleteSavedSearch(id: string) {
    await fetch(`/api/discover/saved-searches/${id}`, { method: "DELETE", credentials: "include" });
    setSavedSearches(prev => prev.filter(s => s.id !== id));
  }

  const unrevealed = results.filter(r => selected.has(r.id) && !r.revealed);
  const revealCost  = Math.ceil(unrevealed.length * 0.5 * 10) / 10;

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 overflow-hidden">

      {/* ── Sidebar ── */}
      <div className="w-[220px] flex-shrink-0 border-r border-white/8 flex flex-col overflow-hidden">

        {/* Sidebar header */}
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
          {/* Keyword search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
            </svg>
            <input value={mode === "people" ? keyword : coKeyword}
              onChange={e => mode === "people" ? setKeyword(e.target.value) : setCoKeyword(e.target.value)}
              placeholder={mode === "people" ? "Name, title, company…" : "Company name, domain…"}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white/70 placeholder-white/25 focus:outline-none focus:border-orange-500/40 transition-colors" />
          </div>
        </div>

        {/* Filters — scrollable */}
        <div className="flex-1 overflow-y-auto">

          {mode === "people" && (<>
            <FilterSection title="Job Title" count={titleKws.length}>
              <TagInput tags={titleKws} onAdd={t => setTitleKws(v => [...v, t])} onRemove={t => setTitleKws(v => v.filter(x => x !== t))} placeholder="e.g. CEO, VP Sales…" />
            </FilterSection>
            <FilterSection title="Seniority" count={seniorities.length}>
              <CheckboxGroup options={SENIORITY_OPTIONS} selected={seniorities} onChange={setSeniorities} />
            </FilterSection>
            <FilterSection title="Department" count={departments.length} defaultOpen={false}>
              <CheckboxGroup options={DEPARTMENT_OPTIONS} selected={departments} onChange={setDepartments} />
            </FilterSection>
            <FilterSection title="Location" count={countries.length + (city ? 1 : 0)} defaultOpen={false}>
              <div className="space-y-2">
                <TagInput tags={countries} onAdd={t => setCountries(v => [...v, t])} onRemove={t => setCountries(v => v.filter(x => x !== t))} placeholder="Country…" />
                <TextFilter value={city} onChange={setCity} placeholder="City…" />
              </div>
            </FilterSection>
            <FilterSection title="Company" count={companies.length} defaultOpen={false}>
              <TagInput tags={companies} onAdd={t => setCompanies(v => [...v, t])} onRemove={t => setCompanies(v => v.filter(x => x !== t))} placeholder="e.g. Google, Stripe…" />
            </FilterSection>
            <FilterSection title="Industry" count={industries.length} defaultOpen={false}>
              <StringCheckboxGroup options={INDUSTRY_OPTIONS} selected={industries} onChange={setIndustries} />
            </FilterSection>
            <FilterSection title="Company Size" count={companySizes.length} defaultOpen={false}>
              <StringCheckboxGroup options={COMPANY_SIZE_OPTIONS} selected={companySizes} onChange={setCompanySizes} />
            </FilterSection>
            <FilterSection title="Email" count={emailStatus !== "has_email" ? 1 : 0} defaultOpen={false}>
              <div className="px-4 space-y-1">
                {([{ label: "Has email", value: "has_email" }, { label: "Verified only", value: "verified" }, { label: "Any (incl. no email)", value: "any" }] as const).map(o => (
                  <label key={o.value} className="flex items-center gap-2.5 py-0.5 cursor-pointer group">
                    <input type="radio" name="email_status" value={o.value} checked={emailStatus === o.value} onChange={() => setEmailStatus(o.value)} className="accent-orange-500 flex-shrink-0" />
                    <span className="text-xs text-white/50 group-hover:text-white/80 transition-colors">{o.label}</span>
                  </label>
                ))}
              </div>
            </FilterSection>
          </>)}

          {mode === "companies" && (<>
            <FilterSection title="Industry" count={coIndustries.length}>
              <StringCheckboxGroup options={INDUSTRY_OPTIONS} selected={coIndustries} onChange={setCoIndustries} />
            </FilterSection>
            <FilterSection title="# Employees" count={coEmployeeRange ? 1 : 0} defaultOpen={false}>
              <div className="px-4 space-y-1">
                {EMPLOYEE_RANGE_OPTIONS.map(r => (
                  <label key={r.label} className="flex items-center gap-2.5 py-0.5 cursor-pointer group">
                    <input type="radio" name="emp_range" className="accent-orange-500"
                      checked={coEmployeeRange?.min === r.min && coEmployeeRange?.max === r.max}
                      onChange={() => setCoEmployeeRange(coEmployeeRange?.min === r.min ? null : { min: r.min, max: r.max })} />
                    <span className="text-xs text-white/50 group-hover:text-white/80 transition-colors">{r.label}</span>
                  </label>
                ))}
              </div>
            </FilterSection>
            <FilterSection title="Revenue" count={coRevenueRange ? 1 : 0} defaultOpen={false}>
              <div className="px-4 space-y-1">
                {REVENUE_RANGE_OPTIONS.map(r => (
                  <label key={r.label} className="flex items-center gap-2.5 py-0.5 cursor-pointer group">
                    <input type="radio" name="rev_range" className="accent-orange-500"
                      checked={coRevenueRange?.min === r.min && coRevenueRange?.max === r.max}
                      onChange={() => setCoRevenueRange(coRevenueRange?.min === r.min ? null : { min: r.min, max: r.max })} />
                    <span className="text-xs text-white/50 group-hover:text-white/80 transition-colors">{r.label}</span>
                  </label>
                ))}
              </div>
            </FilterSection>
            <FilterSection title="Funding Stage" count={coFundingStages.length} defaultOpen={false}>
              <StringCheckboxGroup options={FUNDING_STAGE_OPTIONS} selected={coFundingStages} onChange={setCoFundingStages} />
            </FilterSection>
            <FilterSection title="Location" count={coCountries.length + (coCity ? 1 : 0)} defaultOpen={false}>
              <div className="space-y-2">
                <TagInput tags={coCountries} onAdd={t => setCoCountries(v => [...v, t])} onRemove={t => setCoCountries(v => v.filter(x => x !== t))} placeholder="Country…" />
                <TextFilter value={coCity} onChange={setCoCity} placeholder="City…" />
              </div>
            </FilterSection>
            <FilterSection title="More" defaultOpen={false}>
              <div className="px-4">
                <label className="flex items-center gap-2.5 py-1 cursor-pointer group">
                  <input type="checkbox" checked={coHasPeople} onChange={e => setCoHasPeople(e.target.checked)} className="w-3.5 h-3.5 accent-orange-500 flex-shrink-0 rounded" />
                  <span className="text-xs text-white/50 group-hover:text-white/80 transition-colors">Has contacts</span>
                </label>
              </div>
            </FilterSection>
          </>)}

          {/* Saved searches */}
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
      </div>

      {/* ── Main content ── */}
      <div className={`flex-1 flex flex-col min-h-0 min-w-0 transition-all duration-200 ${drawer ? "mr-[360px]" : ""}`}>

        {/* Toolbar */}
        <div className="flex-shrink-0 flex items-center justify-between gap-4 px-5 py-2.5 border-b border-white/8">
          {/* Left: title + tabs + count */}
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-bold text-white/80">Discover</h1>
            {/* Tabs */}
            <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
              {(["people", "companies"] as const).map(m => (
                <button key={m} onClick={() => { setMode(m); setSelected(new Set()); }}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors capitalize ${mode === m ? "bg-white/10 text-white" : "text-white/35 hover:text-white/60"}`}>
                  {m}
                </button>
              ))}
            </div>
            {loading ? <Spinner sm /> : (
              <span className="text-xs text-white/35 tabular-nums">{total > 0 ? `${total.toLocaleString()} ${mode}` : ""}</span>
            )}
          </div>

          {/* Right: bulk actions */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-orange-300 font-medium whitespace-nowrap">
                {selected.size} selected
              </span>
              {mode === "people" && unrevealed.length > 0 && (
                <button onClick={revealSelected} disabled={revealing || exporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-300 rounded-lg transition-colors disabled:opacity-50">
                  {revealing ? <Spinner sm /> : <LockIcon open />}
                  Unlock {unrevealed.length} · {revealCost} cr
                </button>
              )}
              {mode === "people" && (
                <button onClick={handleVerify} disabled={exporting || revealing}
                  className="px-3 py-1.5 text-xs font-semibold bg-white/8 hover:bg-white/12 border border-white/12 text-white/60 rounded-lg transition-colors disabled:opacity-50">
                  Verify
                </button>
              )}
              <button onClick={() => setShowCampaign(true)} disabled={exporting || revealing}
                className="px-3 py-1.5 text-xs font-semibold bg-white/8 hover:bg-white/12 border border-white/12 text-white/70 rounded-lg transition-colors disabled:opacity-50">
                {exporting ? "…" : "Add to Campaign"}
              </button>
              <button onClick={() => handleExport("csv")} disabled={exporting || revealing}
                className="px-3 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white rounded-lg transition-colors disabled:opacity-50">
                {exporting ? "…" : "Export CSV"}
              </button>
            </div>
          )}
        </div>

        {/* Status message */}
        {exportMsg && (
          <div className={`flex-shrink-0 flex items-center justify-between px-5 py-2 text-xs ${exportMsg.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
            <span>{exportMsg.text}</span>
            <button onClick={() => setExportMsg(null)} className="opacity-60 hover:opacity-100"><XIcon sm /></button>
          </div>
        )}
        {error && (
          <div className="flex-shrink-0 px-5 py-2 bg-red-500/10 text-red-400 text-xs">{error}</div>
        )}

        {/* Table / grid */}
        <div className="flex-1 overflow-auto">
          {mode === "people" ? (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-[#111] border-b border-white/8">
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <input type="checkbox" checked={results.length > 0 && selected.size === results.length}
                      onChange={toggleAll} className="accent-orange-500 w-3.5 h-3.5" />
                  </th>
                  {["Person", "Company", "Location", "Email", "Phone"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-white/30 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.length === 0 && !loading && (
                  <tr><td colSpan={6} className="px-5 py-16 text-center text-white/20 text-sm">
                    {activeFilterCount > 0 ? "No results for these filters" : "Search or apply filters to find leads"}
                  </td></tr>
                )}
                {results.map(r => (
                  <tr key={r.id} onClick={() => setDrawer({ type: "person", id: r.id })}
                    className={`border-b border-white/4 hover:bg-white/3 transition-colors cursor-pointer ${selected.has(r.id) ? "bg-orange-500/5" : ""}`}>
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="accent-orange-500 w-3.5 h-3.5" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar first={r.first_name} last={r.last_name} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-white/85 truncate max-w-[120px]">
                              {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                            </span>
                            {r.linkedin_url && (
                              <a href={r.linkedin_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-blue-400/50 hover:text-blue-400 transition-colors flex-shrink-0"><LinkedInIcon /></a>
                            )}
                            {r.exported && <span className="text-[8px] text-green-400/60 font-bold uppercase tracking-wide">exported</span>}
                          </div>
                          <span className="text-white/35 truncate block max-w-[140px]">{r.title ?? "—"}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="min-w-0">
                        <span className="text-white/65 truncate block max-w-[130px]">{r.company_name ?? "—"}</span>
                        {r.company_industry && <span className="text-white/30 truncate block max-w-[130px]">{r.company_industry}</span>}
                        {r.company_size && <span className="text-white/20 text-[10px]">{r.company_size}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-white/40 whitespace-nowrap">
                      {[r.city, r.country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.has_email ? (
                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          {!r.revealed ? (
                            <button onClick={() => revealIds([r.id])} disabled={revealing}
                              className="flex items-center gap-1 text-white/20 hover:text-orange-400 transition-colors">
                              <LockIcon />
                              <span className="font-mono text-[10px]">{r.email_preview}</span>
                            </button>
                          ) : (
                            <span className="font-mono text-white/75 text-[11px]">{r.email_preview}</span>
                          )}
                          <EmailPill status={r.email_status} />
                        </div>
                      ) : <span className="text-white/15">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.has_phone ? (
                        r.revealed
                          ? <span className="font-mono text-white/60 text-[11px]">{r.phone_preview}</span>
                          : <span className="font-mono text-white/20 text-[11px]">{r.phone_preview}</span>
                      ) : <span className="text-white/15">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-[#111] border-b border-white/8">
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <input type="checkbox" checked={companyResults.length > 0 && selected.size === companyResults.length}
                      onChange={toggleAll} className="accent-orange-500 w-3.5 h-3.5" />
                  </th>
                  {["Company", "Industry", "Size", "Location", "Contacts"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-white/30 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {companyResults.length === 0 && !loading && (
                  <tr><td colSpan={6} className="px-5 py-16 text-center text-white/20 text-sm">
                    {activeFilterCount > 0 ? "No companies for these filters" : "Search or apply filters to find companies"}
                  </td></tr>
                )}
                {companyResults.map(c => (
                  <tr key={c.id} onClick={() => setDrawer({ type: "company", id: c.id })}
                    className={`border-b border-white/4 hover:bg-white/3 transition-colors cursor-pointer ${selected.has(c.id) ? "bg-orange-500/5" : ""}`}>
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="accent-orange-500 w-3.5 h-3.5" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded bg-white/8 flex items-center justify-center text-[10px] font-bold text-white/40 flex-shrink-0">
                          {(c.name[0] ?? "?").toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-white/85 truncate max-w-[150px]">{c.name}</span>
                            {c.linkedin_url && (
                              <a href={c.linkedin_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-blue-400/50 hover:text-blue-400 transition-colors flex-shrink-0"><LinkedInIcon /></a>
                            )}
                          </div>
                          {c.domain && <span className="text-white/30 text-[10px] truncate block">{c.domain}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-white/50 max-w-[160px] truncate">{c.industry ?? "—"}</td>
                    <td className="px-3 py-2.5 text-white/40 whitespace-nowrap">{c.size_range ?? "—"}</td>
                    <td className="px-3 py-2.5 text-white/40 whitespace-nowrap">{[c.city, c.country].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={e => { e.stopPropagation(); setMode("people"); setCompanies([c.name]); }}
                        className="flex items-center gap-1.5 text-orange-400/70 hover:text-orange-400 transition-colors">
                        <span className="font-semibold">{c.people_count}</span>
                        <span className="text-white/25">contacts</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-2.5 border-t border-white/8 bg-[#111]">
            <span className="text-xs text-white/25">
              Page {page} of {totalPages.toLocaleString()} · {total.toLocaleString()} total
            </span>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1 || loading} onClick={() => search(1)}
                className="px-2 py-1 text-[11px] text-white/40 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed">«</button>
              <button disabled={page <= 1 || loading} onClick={() => search(page - 1)}
                className="px-2.5 py-1 text-xs text-white/40 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed">‹ Prev</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p2 = start + i;
                return (
                  <button key={p2} disabled={loading} onClick={() => search(p2)}
                    className={`w-7 h-7 text-xs rounded transition-colors ${p2 === page ? "bg-orange-500 text-white" : "text-white/40 hover:text-white hover:bg-white/8"}`}>
                    {p2}
                  </button>
                );
              })}
              <button disabled={page >= totalPages || loading} onClick={() => search(page + 1)}
                className="px-2.5 py-1 text-xs text-white/40 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed">Next ›</button>
              <button disabled={page >= totalPages || loading} onClick={() => search(totalPages)}
                className="px-2 py-1 text-[11px] text-white/40 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed">»</button>
            </div>
          </div>
        )}

      </div>

      {/* ── Right drawer ── */}
      {drawer && (
        <div className="fixed right-0 top-0 h-full w-[360px] border-l border-white/8 bg-[#111] flex flex-col z-40 shadow-2xl">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/8 flex-shrink-0">
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
              {drawer.type === "person" ? "Contact" : "Company"}
            </span>
            <button onClick={() => setDrawer(null)} className="text-white/30 hover:text-white/60 transition-colors"><XIcon /></button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {drawer.type === "person" ? (
              <PersonDrawer
                id={drawer.id}
                onClose={() => setDrawer(null)}
                onReveal={id => revealIds([id])}
                onViewCompany={cid => setDrawer({ type: "company", id: cid })}
              />
            ) : (
              <CompanyDrawer
                id={drawer.id}
                onClose={() => setDrawer(null)}
                onRevealPerson={id => revealIds([id])}
                onViewPerson={id => setDrawer({ type: "person", id })}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Campaign modal ── */}
      {showCampaign && (
        <CampaignModal
          count={selected.size}
          onClose={() => setShowCampaign(false)}
          onConfirm={(cid, cname) => handleExport("campaign", cid, cname)}
        />
      )}

    </div>
  );
}
