"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type Lead, VERIFY_BADGE } from "./ListDetailClient";
import { wsFetch } from "@/lib/workspace/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  id:     string;
  name:   string;
  status: string;
}

interface Enrollment {
  id:           string;
  status:       string;
  crm_status:   string | null;
  enrolled_at:  string;
  completed_at: string | null;
  campaign:     Campaign;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-white/25 text-xs w-20 shrink-0 pt-0.5 font-medium">{label}</span>
      <div className="flex-1 min-w-0 text-white/70 text-sm">{children}</div>
    </div>
  );
}

function EnrollmentStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:    "bg-emerald-500/15 text-emerald-400",
    completed: "bg-indigo-500/15 text-indigo-400",
    paused:    "bg-amber-500/15 text-amber-400",
    stopped:   "bg-red-500/15 text-red-400",
    bounced:   "bg-red-500/15 text-red-400",
  };
  const cls = map[status] ?? "bg-white/8 text-white/40";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize whitespace-nowrap ${cls}`}>
      {status}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LeadDrawer({
  lead,
  listId,
  onClose,
  onDelete,
  onUpdate,
}: {
  lead:     Lead;
  listId:   string;
  onClose:  () => void;
  onDelete: () => void;
  onUpdate: (updated: Lead) => void;
}) {
  const [editFL,      setEditFL]      = useState(lead.first_line ?? "");
  const [savingFL,    setSavingFL]    = useState(false);
  const [savedFL,     setSavedFL]     = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [delConfirm,  setDelConfirm]  = useState(false);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  // Sync first_line when lead changes (e.g. after table refresh)
  useEffect(() => { setEditFL(lead.first_line ?? ""); }, [lead.id, lead.first_line]);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Fetch enrollment history when lead changes
  useEffect(() => {
    let cancelled = false;
    setHistLoading(true);
    setEnrollments([]);
    wsFetch(`/api/outreach/crm/lead-profile?lead_id=${lead.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!cancelled) {
          setEnrollments(d?.enrollments ?? []);
          setHistLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setHistLoading(false); });
    return () => { cancelled = true; };
  }, [lead.id]);

  const name     = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—";
  const initials = [lead.first_name?.[0], lead.last_name?.[0]].filter(Boolean).join("").toUpperCase()
                   || lead.email[0].toUpperCase();
  const badge    = VERIFY_BADGE[lead.verification_status ?? ""];

  // Helper: pull a field from custom_fields under any of the listed aliases.
  function customField(...aliases: string[]): string | null {
    if (!lead.custom_fields) return null;
    for (const k of Object.keys(lead.custom_fields)) {
      if (aliases.includes(k.toLowerCase())) {
        const v = lead.custom_fields[k];
        if (v != null && String(v).trim() !== "") return String(v);
      }
    }
    return null;
  }

  // ── Derived fields ────────────────────────────────────────────────────────
  const linkedinUrl  = lead.linkedin_url || customField("linkedin_url", "linkedin");
  const twitterUrl   = customField("twitter_url", "twitter", "x_url");
  const facebookUrl  = customField("facebook_url", "facebook");
  const githubUrl    = customField("github_url", "github");
  const instagramUrl = customField("instagram_url", "instagram");
  const phone        = customField("phone", "phone_number", "mobile");

  // Header chips — these come straight from CSV upload custom_fields when present
  const seniority   = customField("seniority", "seniority_level");
  const department  = customField("department", "function", "job_function");
  const subRole     = customField("sub_role", "subrole");

  // Company info
  const companyDomain    = customField("company_domain", "domain", "website_domain");
  const companyIndustry  = customField("industry", "company_industry");
  const companySize      = customField("company_size", "size_range", "employees", "employee_count", "headcount");
  const companyKeywords  = customField("company_keywords", "keywords");
  const companyLocation  = customField("company_location", "company_city");

  // Location: full address — city, state, country (state usually only in custom_fields)
  const state    = customField("state", "region");
  const location = [lead.city, state, lead.country].filter(Boolean).join(", ") || null;

  // Bio / summary
  const summary = customField("summary", "bio", "about", "description");

  // Catch-all: any other custom_fields key we haven't already surfaced above
  const SURFACED_KEYS = new Set([
    "linkedin_url","linkedin","twitter_url","twitter","x_url",
    "facebook_url","facebook","github_url","github","instagram_url","instagram",
    "phone","phone_number","mobile",
    "seniority","seniority_level","department","function","job_function","sub_role","subrole",
    "company_domain","domain","website_domain","industry","company_industry",
    "company_size","size_range","employees","employee_count","headcount",
    "company_keywords","keywords","company_location","company_city",
    "state","region","summary","bio","about","description",
  ]);
  const extraFields: { key: string; value: string }[] = [];
  if (lead.custom_fields) {
    for (const [k, v] of Object.entries(lead.custom_fields)) {
      if (v == null || String(v).trim() === "") continue;
      if (SURFACED_KEYS.has(k.toLowerCase())) continue;
      extraFields.push({ key: k, value: String(v) });
    }
  }

  const copyEmail = () => {
    navigator.clipboard.writeText(lead.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveFL = async () => {
    setSavingFL(true);
    await fetch(`/api/outreach/lists/${listId}/leads/first-lines`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ updates: [{ id: lead.id, first_line: editFL }] }),
    });
    setSavingFL(false);
    setSavedFL(true);
    setTimeout(() => setSavedFL(false), 2000);
    onUpdate({ ...lead, first_line: editFL || null });
  };

  const handleDelete = async () => {
    await fetch(`/api/outreach/lists/${listId}/leads`, {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ids: [lead.id] }),
    });
    onDelete();
  };

  const flChanged = editFL !== (lead.first_line ?? "");

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#0d0d0d] border-l border-white/8 flex flex-col shadow-2xl">

        {/* Header — bigger avatar + title underneath the name + chip row, mirroring Discovery's PersonDrawer */}
        <div className="p-5 border-b border-white/8 shrink-0">
          <div className="flex items-start gap-3">
            {/* Avatar */}
            <div className="w-11 h-11 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 font-semibold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold truncate">{name}</p>
              {(lead.title || subRole) && (
                <p className="text-white/55 text-xs mt-0.5 truncate">
                  {[lead.title, subRole].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-white/40 text-xs truncate">{lead.email}</span>
                <button
                  onClick={copyEmail}
                  className="text-white/25 hover:text-white/60 transition-colors text-xs shrink-0"
                  title="Copy email"
                >
                  {copied ? "✓" : "⎘"}
                </button>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/25 hover:text-white/65 transition-colors shrink-0 mt-0.5"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Chips — seniority / department / verification at a glance */}
          {(seniority || department) && (
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              {seniority && (
                <span className="px-1.5 py-0.5 rounded bg-white/6 border border-white/8 text-[10px] text-white/55 uppercase tracking-wider">
                  {seniority}
                </span>
              )}
              {department && (
                <span className="px-1.5 py-0.5 rounded bg-white/6 border border-white/8 text-[10px] text-white/55">
                  {department}
                </span>
              )}
            </div>
          )}

          {/* Social link row */}
          {(linkedinUrl || twitterUrl || facebookUrl || githubUrl || instagramUrl) && (
            <div className="flex items-center gap-3 mt-3">
              {linkedinUrl && (
                <a href={linkedinUrl.startsWith("http") ? linkedinUrl : `https://${linkedinUrl}`} target="_blank" rel="noreferrer"
                  className="text-[#0077B5]/60 hover:text-[#0077B5] transition-colors" title="LinkedIn">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
              )}
              {twitterUrl && (
                <a href={twitterUrl.startsWith("http") ? twitterUrl : `https://${twitterUrl}`} target="_blank" rel="noreferrer"
                  className="text-sky-400/60 hover:text-sky-400 transition-colors" title="Twitter/X">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
              )}
              {facebookUrl && (
                <a href={facebookUrl.startsWith("http") ? facebookUrl : `https://${facebookUrl}`} target="_blank" rel="noreferrer"
                  className="text-blue-600/60 hover:text-blue-500 transition-colors" title="Facebook">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
              )}
              {githubUrl && (
                <a href={githubUrl.startsWith("http") ? githubUrl : `https://${githubUrl}`} target="_blank" rel="noreferrer"
                  className="text-white/40 hover:text-white/80 transition-colors" title="GitHub">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                </a>
              )}
              {instagramUrl && (
                <a href={instagramUrl.startsWith("http") ? instagramUrl : `https://${instagramUrl}`} target="_blank" rel="noreferrer"
                  className="text-pink-500/60 hover:text-pink-500 transition-colors" title="Instagram">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* Bio / summary */}
          {summary && (
            <p className="text-xs text-white/50 italic leading-relaxed line-clamp-6 border-l-2 border-white/10 pl-3">
              &quot;{summary}&quot;
            </p>
          )}

          {/* Person info */}
          <div className="space-y-3">
            {location && (
              <Field label="Location">
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-white/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {location}
                </span>
              </Field>
            )}
            {phone && (
              <Field label="Phone">
                <a href={`tel:${phone}`} className="text-white/70 hover:text-white transition-colors">{phone}</a>
              </Field>
            )}
          </div>

          {/* Company panel — grouped block, like Discovery's company subsection */}
          {(lead.company || companyDomain || companyIndustry || companySize || companyKeywords || companyLocation || lead.website) && (
            <div className="bg-white/[0.03] rounded-xl p-4 space-y-2.5">
              <p className="text-white/30 text-[10px] font-semibold uppercase tracking-wider">Company</p>
              {lead.company && <Field label="Name">{lead.company}</Field>}
              {(companyDomain || lead.website) && (
                <Field label="Domain">
                  <a
                    href={(companyDomain || lead.website || "").startsWith("http") ? (companyDomain || lead.website || "") : `https://${companyDomain || lead.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 hover:underline truncate block transition-colors"
                  >
                    {companyDomain || lead.website}
                  </a>
                </Field>
              )}
              {companyIndustry && <Field label="Industry">{companyIndustry}</Field>}
              {companySize     && <Field label="Size">{companySize}</Field>}
              {companyLocation && <Field label="Office">{companyLocation}</Field>}
              {companyKeywords && <Field label="Keywords"><span className="text-white/55 text-xs">{companyKeywords}</span></Field>}
            </div>
          )}

          {/* Anything else — preserves any custom_fields keys we haven't already mapped */}
          {extraFields.length > 0 && (
            <div className="space-y-3">
              <p className="text-white/30 text-[10px] font-semibold uppercase tracking-wider">More</p>
              {extraFields.map(f => (
                <Field key={f.key} label={f.key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}>
                  {f.value.startsWith("http") ? (
                    <a href={f.value} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline truncate block">
                      {f.value}
                    </a>
                  ) : (
                    <span>{f.value}</span>
                  )}
                </Field>
              ))}
            </div>
          )}

          {/* Verification */}
          <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
            <p className="text-white/30 text-[10px] font-semibold uppercase tracking-wider">Verification</p>
            <div className="flex items-center gap-3">
              {badge ? (
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badge.cls}`}>
                  {badge.label}
                </span>
              ) : (
                <span className="text-white/25 text-sm">Not verified</span>
              )}
              {lead.verification_score != null && (
                <div className="flex items-center gap-2 flex-1">
                  <div className="flex-1 h-1 bg-white/8 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, lead.verification_score)}%` }}
                      className={`h-full rounded-full transition-all ${
                        lead.verification_score >= 70 ? "bg-emerald-500" :
                        lead.verification_score >= 40 ? "bg-amber-500" : "bg-red-500"
                      }`}
                    />
                  </div>
                  <span className="text-white/40 text-xs shrink-0">{Math.round(lead.verification_score)}</span>
                </div>
              )}
            </div>
            {lead.verified_at && (
              <p className="text-white/20 text-xs">
                Verified {new Date(lead.verified_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>

          {/* AI First Line */}
          <div className="space-y-2">
            <p className="text-white/30 text-[10px] font-semibold uppercase tracking-wider">AI First Line</p>
            <textarea
              value={editFL}
              onChange={e => setEditFL(e.target.value)}
              placeholder="No first line yet — select this lead and use ✨ Generate First Lines"
              rows={3}
              className="w-full bg-white/[0.04] border border-white/8 hover:border-white/14 focus:border-white/22 rounded-xl px-3 py-2.5 text-sm text-white/75 placeholder:text-white/18 focus:outline-none resize-none transition-colors"
            />
            {flChanged && (
              <button
                onClick={handleSaveFL}
                disabled={savingFL}
                className="px-3 py-1.5 bg-violet-500/15 hover:bg-violet-500/25 disabled:opacity-50 text-violet-400 text-xs font-semibold rounded-lg border border-violet-500/20 transition-colors"
              >
                {savedFL ? "✓ Saved" : savingFL ? "Saving…" : "Save"}
              </button>
            )}
          </div>

          {/* Enrollment History */}
          <div className="space-y-2">
            <p className="text-white/30 text-[10px] font-semibold uppercase tracking-wider">Campaign History</p>
            <div className="bg-white/[0.03] rounded-xl overflow-hidden">
              {histLoading ? (
                <p className="p-4 text-white/25 text-xs">Loading history…</p>
              ) : enrollments.length === 0 ? (
                <p className="p-4 text-white/25 text-xs">No campaigns yet</p>
              ) : (
                <div className="divide-y divide-white/[0.05]">
                  {enrollments.map(en => (
                    <div key={en.id} className="p-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-white/65 text-xs font-medium truncate">{en.campaign.name}</p>
                        <p className="text-white/25 text-[10px] mt-0.5">
                          Enrolled {new Date(en.enrolled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {en.completed_at && (
                            <> · Completed {new Date(en.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</>
                          )}
                        </p>
                      </div>
                      <EnrollmentStatusBadge status={en.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="space-y-2">
            <p className="text-white/30 text-[10px] font-semibold uppercase tracking-wider">Details</p>
            <div className="bg-white/[0.03] rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-white/30 text-xs">Status</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  lead.status === "active"      ? "bg-emerald-500/12 text-emerald-400" :
                  lead.status === "bounced"     ? "bg-red-500/12 text-red-400" :
                  lead.status === "unsubscribed"? "bg-orange-500/12 text-orange-400" :
                  "bg-white/8 text-white/40"
                }`}>
                  {lead.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/30 text-xs">Added</span>
                <span className="text-white/45 text-xs">
                  {new Date(lead.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer — Quick Actions */}
        <div className="p-4 border-t border-white/8 flex items-center gap-2 shrink-0">
          <button
            onClick={copyEmail}
            className="flex-1 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.07] text-white/55 hover:text-white/80 text-sm rounded-xl border border-white/8 hover:border-white/15 transition-colors"
          >
            {copied ? "✓ Copied" : "Copy Email"}
          </button>
          <Link
            href={`/campaigns?addLead=${lead.id}`}
            className="px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/18 text-indigo-400/80 hover:text-indigo-400 text-sm rounded-xl border border-indigo-500/15 hover:border-indigo-500/25 transition-colors whitespace-nowrap"
          >
            Add to Campaign
          </Link>
          {delConfirm ? (
            <div className="flex gap-1.5">
              <button onClick={() => setDelConfirm(false)} className="px-3 py-2 text-white/40 hover:text-white/70 text-sm border border-white/8 rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-semibold rounded-xl border border-red-500/20 transition-colors">
                Confirm
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDelConfirm(true)}
              className="px-3 py-2 bg-red-500/8 hover:bg-red-500/15 text-red-400/70 hover:text-red-400 text-sm rounded-xl border border-red-500/12 hover:border-red-500/20 transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </>
  );
}
