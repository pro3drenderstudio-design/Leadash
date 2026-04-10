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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={copy}
      className="ml-1 text-white/20 hover:text-white/50 transition-colors"
      title="Copy"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

function ExternalLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a
      href={href.startsWith("http") ? href : `https://${href}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-blue-500/10 border border-white/10 hover:border-blue-500/30 rounded-lg text-xs text-white/60 hover:text-blue-400 transition-all"
    >
      {icon}
      {label}
      <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}

function LinkedInIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-white/25 text-[10px] font-bold uppercase tracking-widest mb-2.5">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, copyable }: { label: string; value?: string | null; copyable?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-white/35 text-xs flex-shrink-0 w-28">{label}</span>
      <span className="text-white/80 text-xs text-right flex items-center gap-1">
        {value}
        {copyable && <CopyButton text={value} />}
      </span>
    </div>
  );
}

const VERIFY_STYLES: Record<string, string> = {
  valid:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  invalid:    "bg-red-500/15 text-red-400 border-red-500/20",
  catch_all:  "bg-amber-500/15 text-amber-400 border-amber-500/20",
  disposable: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  unknown:    "bg-white/8 text-white/40 border-white/10",
  pending:    "bg-white/5 text-white/30 border-white/8",
};

export default function LeadDrawer({ lead, campaignId, hasPersonalizePrompt, onClose, onUpdated }: Props) {
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError]     = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);

  const name    = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email;
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const industry = cleanVal(lead.industry);

  async function handleRegen() {
    setRegenerating(true);
    setRegenError(null);
    try {
      const data = await wsPost<{ updated: { id: string; personalized_line: string }[]; credits_used: number }>(
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

  function copyLine() {
    if (!lead.personalized_line) return;
    navigator.clipboard.writeText(lead.personalized_line).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[440px] bg-gray-950 border-l border-white/10 shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/8 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-white/10 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-white text-base leading-tight truncate">{name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-white/40 text-xs truncate">{lead.email}</p>
                  <CopyButton text={lead.email} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {lead.verification_status && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${VERIFY_STYLES[lead.verification_status] ?? ""}`}>
                  {lead.verification_status === "valid" && (
                    <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {lead.verification_status}
                </span>
              )}
              <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Quick links */}
          <div className="flex flex-wrap gap-2 mt-3">
            {lead.linkedin_url && (
              <ExternalLink href={lead.linkedin_url} label="LinkedIn" icon={<LinkedInIcon />} />
            )}
            {lead.website && (
              <ExternalLink href={lead.website} label="Website" icon={<GlobeIcon />} />
            )}
            {lead.org_linkedin_url && (
              <ExternalLink href={lead.org_linkedin_url} label="Company LinkedIn" icon={<LinkedInIcon />} />
            )}
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg text-xs text-white/60 transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                {lead.phone}
              </a>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Professional */}
          <Section title="Professional">
            <Row label="Title"       value={lead.title} />
            <Row label="Seniority"   value={lead.seniority} />
            <Row label="Department"  value={lead.department} />
            {lead.location && (
              <div className="flex items-start justify-between gap-4 py-1">
                <span className="text-white/35 text-xs flex-shrink-0 w-28">Location</span>
                <span className="text-white/80 text-xs text-right">{lead.location}</span>
              </div>
            )}
          </Section>

          {/* Company */}
          <Section title="Company">
            <Row label="Name"        value={lead.company} />
            <Row label="Industry"    value={industry || undefined} />
            <Row label="Size"        value={lead.org_size} />
            <Row label="City"        value={lead.org_city} />
            <Row label="State"       value={lead.org_state} />
            <Row label="Country"     value={lead.org_country} />
            <Row label="Founded"     value={lead.org_founded_year} />
            {lead.org_description && (
              <div className="pt-1">
                <p className="text-white/35 text-xs mb-1.5">Description</p>
                <p className="text-white/50 text-xs leading-relaxed bg-white/3 border border-white/8 rounded-lg p-2.5">{lead.org_description}</p>
              </div>
            )}
          </Section>

          {/* AI Personalization */}
          <Section title="AI Personalized Opener">
            {lead.personalized_line ? (
              <div className="bg-blue-500/6 border border-blue-500/20 rounded-xl p-3.5">
                <p className="text-white/80 text-sm italic leading-relaxed">
                  &ldquo;{lead.personalized_line}&rdquo;
                </p>
                <div className="flex items-center gap-2 mt-2.5">
                  <button
                    onClick={copyLine}
                    className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {copied ? (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        Copy line
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-white/25 text-xs">No personalized line generated yet.</p>
            )}

            {hasPersonalizePrompt && (
              <div className="mt-2">
                <button
                  onClick={handleRegen}
                  disabled={regenerating}
                  className="flex items-center gap-2 px-3.5 py-2 bg-white/5 hover:bg-blue-500/10 border border-white/10 hover:border-blue-500/25 rounded-lg text-xs text-white/60 hover:text-blue-400 transition-all disabled:opacity-40"
                >
                  {regenerating ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                      Regenerate opener
                      <span className="text-white/25 ml-0.5">· 2 credits</span>
                    </>
                  )}
                </button>
                {regenError && <p className="text-red-400 text-xs mt-1.5">{regenError}</p>}
              </div>
            )}
          </Section>

          {/* Raw email info */}
          <Section title="Contact Details">
            <div className="flex items-center justify-between gap-4 py-1">
              <span className="text-white/35 text-xs w-28">Email</span>
              <div className="flex items-center gap-1 text-white/80 text-xs">
                <a href={`mailto:${lead.email}`} className="hover:text-blue-400 transition-colors">{lead.email}</a>
                <CopyButton text={lead.email} />
              </div>
            </div>
            {lead.phone && <Row label="Phone" value={lead.phone} copyable />}
            {lead.verification_score != null && (
              <div className="flex items-center justify-between gap-4 py-1">
                <span className="text-white/35 text-xs w-28">Deliverability</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${lead.verification_score >= 70 ? "bg-emerald-500" : lead.verification_score >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${lead.verification_score}%` }}
                    />
                  </div>
                  <span className="text-white/50 text-xs">{lead.verification_score}%</span>
                </div>
              </div>
            )}
          </Section>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-white/8 px-5 py-3">
          <p className="text-white/20 text-xs text-center">
            Added {lead.added_to_list_id ? "to pool ✓" : "—"} · Lead ID {lead.id.slice(0, 8)}
          </p>
        </div>
      </div>
    </>
  );
}
