"use client";
import { useState } from "react";
import type { LeadCampaignLead } from "@/types/lead-campaigns";
import { wsPost } from "@/lib/workspace/client";

interface Props {
  lead: LeadCampaignLead;
  campaignId: string;
  hasPersonalizePrompt: boolean;
  onClose: () => void;
  onUpdated: (patch: Partial<LeadCampaignLead> & { id: string }) => void;
}

function cleanVal(v: string | null | undefined): string {
  if (!v) return "";
  return v.replace(/^\[['"]?|['"]?\]$/g, "").replace(/['"]/g, "").trim();
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const VERIFY_CONFIG: Record<string, { label: string; color: string; dot: string; bg: string }> = {
  safe:       { label: "Safe",       color: "text-emerald-400", dot: "bg-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/25" },
  valid:      { label: "Valid",      color: "text-emerald-400", dot: "bg-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/25" },
  catch_all:  { label: "Catch-all",  color: "text-amber-400",   dot: "bg-amber-400",   bg: "bg-amber-500/10 border-amber-500/25" },
  risky:      { label: "Risky",      color: "text-amber-400",   dot: "bg-amber-400",   bg: "bg-amber-500/10 border-amber-500/25" },
  invalid:    { label: "Invalid",    color: "text-red-400",     dot: "bg-red-400",     bg: "bg-red-500/10 border-red-500/25" },
  dangerous:  { label: "Dangerous",  color: "text-red-400",     dot: "bg-red-400",     bg: "bg-red-500/10 border-red-500/25" },
  disposable: { label: "Disposable", color: "text-orange-400",  dot: "bg-orange-400",  bg: "bg-orange-500/10 border-orange-500/25" },
  unknown:    { label: "Unknown",    color: "text-white/40",    dot: "bg-white/20",    bg: "bg-white/5 border-white/10" },
  pending:    { label: "Pending",    color: "text-white/30",    dot: "bg-white/15",    bg: "bg-white/4 border-white/8" },
};

export default function LeadDrawer({ lead, campaignId, hasPersonalizePrompt, onClose, onUpdated }: Props) {
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError]     = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail]   = useState(false);
  const [copiedLine, setCopiedLine]     = useState(false);

  const name     = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email.split("@")[0];
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const industry = cleanVal(lead.industry);
  const vc       = lead.verification_status ? (VERIFY_CONFIG[lead.verification_status] ?? VERIFY_CONFIG.unknown) : null;

  async function handleRegen() {
    setRegenerating(true);
    setRegenError(null);
    try {
      const data = await wsPost<{ updated: { id: string; personalized_line: string }[] }>(
        `/api/lead-campaigns/${campaignId}/regen`,
        { lead_ids: [lead.id] },
      );
      const patch = data.updated[0];
      if (patch) onUpdated({ id: lead.id, personalized_line: patch.personalized_line });
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  }

  function copyEmail() {
    navigator.clipboard.writeText(lead.email).then(() => {
      setCopiedEmail(true); setTimeout(() => setCopiedEmail(false), 1500);
    });
  }
  function copyLine() {
    if (!lead.personalized_line) return;
    navigator.clipboard.writeText(lead.personalized_line).then(() => {
      setCopiedLine(true); setTimeout(() => setCopiedLine(false), 1500);
    });
  }

  // Timeline phases
  const phases = [
    {
      key:    "scraped",
      label:  "Scraped",
      sub:    fmt(lead.created_at),
      active: true,
      color:  "bg-white/30",
      ring:   "ring-white/10",
    },
    {
      key:    "verified",
      label:  lead.verification_status ? `Email ${vc?.label}` : "Email Verification",
      sub:    lead.verification_score != null ? `${lead.verification_score}% confidence` : lead.verification_status ? vc?.label : "Not yet verified",
      active: !!lead.verification_status && lead.verification_status !== "pending",
      color:  ["safe", "valid", "catch_all"].includes(lead.verification_status ?? "") ? "bg-emerald-400"
            : ["invalid", "dangerous"].includes(lead.verification_status ?? "") ? "bg-red-400"
            : lead.verification_status === "risky" ? "bg-amber-400"
            : "bg-white/20",
      ring:   ["safe", "valid", "catch_all"].includes(lead.verification_status ?? "") ? "ring-emerald-500/20"
            : ["invalid", "dangerous"].includes(lead.verification_status ?? "") ? "ring-red-500/20"
            : lead.verification_status === "risky" ? "ring-amber-500/20"
            : "ring-white/5",
    },
    {
      key:    "personalized",
      label:  lead.personalized_line ? "AI Opener Generated" : "AI Personalization",
      sub:    lead.personalized_line
        ? `"${lead.personalized_line.length > 48 ? lead.personalized_line.slice(0, 48) + "…" : lead.personalized_line}"`
        : "Not yet generated",
      active: !!lead.personalized_line,
      color:  lead.personalized_line ? "bg-blue-400" : "bg-white/20",
      ring:   lead.personalized_line ? "ring-blue-500/20" : "ring-white/5",
    },
  ];

  const orgLocation = [lead.org_city, lead.org_state, lead.org_country].filter(Boolean).join(", ");

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        style={{ animation: "fadeIn 150ms ease" }}
      />

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
        .drawer-panel { animation: slideIn 200ms cubic-bezier(0.22,1,0.36,1) both; }
      `}</style>

      {/* Panel */}
      <div
        className="drawer-panel fixed right-0 top-0 bottom-0 z-50 flex flex-col"
        style={{ width: 460, background: "#080f1e", borderLeft: "1px solid rgba(255,255,255,0.07)" }}
      >
        {/* ── Header ── */}
        <div
          className="flex-shrink-0 px-5 pt-5 pb-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" }}
        >
          <div className="flex items-start justify-between gap-3">
            {/* Avatar + identity */}
            <div className="flex items-center gap-3.5">
              {/* Initials circle with conic gradient border */}
              <div className="relative flex-shrink-0" style={{ width: 52, height: 52 }}>
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: vc
                      ? `conic-gradient(${vc.color.replace("text-", "").includes("emerald") ? "#34d399" : vc.color.replace("text-", "").includes("red") ? "#f87171" : vc.color.replace("text-", "").includes("amber") ? "#fbbf24" : "#3b82f6"} 0deg, rgba(255,255,255,0.05) 180deg)`
                      : "conic-gradient(#3b82f6 0deg, rgba(255,255,255,0.05) 200deg)",
                    padding: 1.5,
                    borderRadius: "50%",
                  }}
                >
                  <div
                    className="w-full h-full rounded-full flex items-center justify-center font-bold text-sm tracking-wide"
                    style={{ background: "#0f1a2e", color: "rgba(255,255,255,0.85)" }}
                  >
                    {initials}
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold text-white text-base leading-tight">{name}</h2>
                  {vc && (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${vc.bg} ${vc.color}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${vc.dot}`} />
                      {vc.label}
                    </span>
                  )}
                </div>
                {(lead.title || lead.company) && (
                  <p className="text-white/40 text-xs mt-0.5 truncate">
                    {[lead.title, lead.company].filter(Boolean).join(" · ")}
                  </p>
                )}
                {lead.location && (
                  <p className="text-white/25 text-[11px] mt-0.5 flex items-center gap-1">
                    <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                    {lead.location}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="text-white/20 hover:text-white/60 transition-colors flex-shrink-0 mt-0.5 p-1 rounded-lg hover:bg-white/5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Quick action buttons */}
          <div className="flex flex-wrap gap-1.5 mt-3.5">
            {lead.linkedin_url && (
              <a
                href={lead.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-400 transition-all"
                style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(59,130,246,0.2)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(59,130,246,0.12)")}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                LinkedIn
              </a>
            )}
            {lead.website && (
              <a
                href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white/80 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253M3 12a8.96 8.96 0 00.284 2.253" />
                </svg>
                Website
              </a>
            )}
            {lead.org_linkedin_url && (
              <a
                href={lead.org_linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white/80 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.6 }}>
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                Company
              </a>
            )}
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white/80 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                {lead.phone}
              </a>
            )}
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Contact & Deliverability */}
          <div className="px-5 pt-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-3.5 h-3.5 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Contact</span>
            </div>

            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {/* Email row */}
              <div
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 group"
                style={{ background: "rgba(255,255,255,0.02)" }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <svg className="w-3.5 h-3.5 text-white/20 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  <a
                    href={`mailto:${lead.email}`}
                    className="text-xs text-white/60 hover:text-white/90 transition-colors font-mono truncate"
                  >
                    {lead.email}
                  </a>
                </div>
                <button
                  onClick={copyEmail}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-white/30 hover:text-white/70"
                  title="Copy email"
                >
                  {copiedEmail ? (
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Deliverability score */}
              {lead.verification_score != null && (
                <div
                  className="px-3.5 py-2.5 flex items-center gap-3"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/20 flex-shrink-0">Deliverability</span>
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width:      `${lead.verification_score}%`,
                        background: lead.verification_score >= 70 ? "#34d399"
                          : lead.verification_score >= 40 ? "#fbbf24"
                          : "#f87171",
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-white/40 flex-shrink-0">{lead.verification_score}%</span>
                </div>
              )}

              {/* Professional details row */}
              {(lead.seniority || lead.department) && (
                <div
                  className="px-3.5 py-2.5 flex items-center gap-3 flex-wrap"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                >
                  {lead.seniority && (
                    <span className="text-[11px] text-white/35">
                      <span className="text-white/20 mr-1">Seniority</span>{lead.seniority}
                    </span>
                  )}
                  {lead.department && (
                    <span className="text-[11px] text-white/35">
                      <span className="text-white/20 mr-1">Dept</span>{lead.department}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "0 20px" }} />

          {/* Intelligence Section */}
          {(lead.org_description || lead.org_size || industry || orgLocation || lead.org_founded_year) && (
            <div className="px-5 pt-4 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-3.5 h-3.5 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Intelligence</span>
              </div>

              {/* Metrics grid */}
              {(lead.org_size || industry || orgLocation || lead.org_founded_year) && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { label: "Industry",    value: industry },
                    { label: "Company Size", value: lead.org_size ? `${lead.org_size} employees` : null },
                    { label: "Location",    value: orgLocation || null },
                    { label: "Founded",     value: lead.org_founded_year ?? null },
                  ].filter(m => m.value).map(m => (
                    <div
                      key={m.label}
                      className="rounded-lg px-3 py-2.5"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <p className="text-[9px] font-bold uppercase tracking-widest text-white/25 mb-1">{m.label}</p>
                      <p className="text-white/70 text-xs font-medium leading-snug">{m.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Company description */}
              {lead.org_description && (
                <div
                  className="rounded-xl p-3.5 text-xs leading-relaxed text-white/55"
                  style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {lead.org_description}
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "0 20px" }} />

          {/* Activity Timeline */}
          <div className="px-5 pt-4 pb-3">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-3.5 h-3.5 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Activity Timeline</span>
            </div>

            <div className="relative">
              {/* Vertical connector line */}
              <div
                className="absolute left-[9px] top-4 bottom-4"
                style={{ width: 1, background: "rgba(255,255,255,0.07)" }}
              />

              <div className="space-y-4">
                {phases.map((phase) => (
                  <div key={phase.key} className="flex items-start gap-3.5 relative">
                    {/* Dot */}
                    <div
                      className={`flex-shrink-0 w-[18px] h-[18px] rounded-full flex items-center justify-center ring-2 ${phase.ring} mt-0.5 relative z-10`}
                      style={{ background: "#080f1e" }}
                    >
                      <div className={`w-2 h-2 rounded-full ${phase.active ? phase.color : "bg-white/15"}`} />
                    </div>

                    <div className="flex-1 min-w-0 pb-1">
                      <p className={`text-xs font-semibold ${phase.active ? "text-white/80" : "text-white/30"}`}>
                        {phase.label}
                      </p>
                      <p className="text-[11px] text-white/35 mt-0.5 leading-snug truncate">
                        {phase.sub}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "0 20px" }} />

          {/* AI Opener */}
          <div className="px-5 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-blue-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">AI Opener</span>
              </div>
              {hasPersonalizePrompt && (
                <button
                  onClick={handleRegen}
                  disabled={regenerating}
                  className="flex items-center gap-1.5 text-[11px] font-medium transition-all disabled:opacity-40"
                  style={{ color: "rgba(96,165,250,0.7)" }}
                  onMouseEnter={e => !regenerating && (e.currentTarget.style.color = "rgba(96,165,250,1)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(96,165,250,0.7)")}
                >
                  {regenerating ? (
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                  )}
                  {regenerating ? "Generating…" : "Regenerate · 2cr"}
                </button>
              )}
            </div>

            {lead.personalized_line ? (
              <div
                className="rounded-xl p-4 relative group"
                style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}
              >
                {/* Quote mark decoration */}
                <div
                  className="absolute top-2.5 left-3.5 text-4xl leading-none font-serif select-none pointer-events-none"
                  style={{ color: "rgba(59,130,246,0.12)" }}
                >
                  &ldquo;
                </div>
                <p className="text-white/75 text-sm leading-relaxed pl-3 pr-8 italic">
                  {lead.personalized_line}
                </p>
                <button
                  onClick={copyLine}
                  className="absolute top-3 right-3 transition-all opacity-0 group-hover:opacity-100 p-1 rounded"
                  style={{ color: "rgba(96,165,250,0.7)" }}
                  title="Copy opener"
                >
                  {copiedLine ? (
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            ) : (
              <p className="text-white/20 text-xs italic">No opener generated yet.</p>
            )}

            {regenError && (
              <p className="mt-2 text-xs text-red-400">{regenError}</p>
            )}
          </div>

        </div>

        {/* ── Footer ── */}
        <div
          className="flex-shrink-0 px-5 py-2.5 flex items-center justify-between"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.2)" }}
        >
          <span className="text-[10px] font-mono text-white/15">ID {lead.id.slice(0, 8).toUpperCase()}</span>
          {lead.added_to_list_id && (
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-400/60">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Added to pool
            </span>
          )}
        </div>
      </div>
    </>
  );
}
