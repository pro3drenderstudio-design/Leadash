"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { LeadCampaign, LeadCampaignLead } from "@/types/lead-campaigns";
import { wsGet, wsPost, wsFetch } from "@/lib/workspace/client";
import LeadDrawer from "./LeadDrawer";

// Strip Python-style list notation returned by Apify actor
function cleanVal(v: string | null | undefined): string {
  if (!v) return "";
  return v.replace(/^\[['"]?|['"]?\]$/g, "").replace(/['"]/g, "").trim();
}

const STATUS_STYLES: Record<string, string> = {
  pending:   "bg-white/8 text-white/50",
  running:   "bg-blue-500/15 text-blue-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  failed:    "bg-red-500/15 text-red-400",
  cancelled: "bg-white/8 text-white/30",
};

const VERIFY_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  valid:      { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  invalid:    { bg: "bg-red-500/10",     text: "text-red-400",     dot: "bg-red-400" },
  catch_all:  { bg: "bg-amber-500/10",   text: "text-amber-400",   dot: "bg-amber-400" },
  disposable: { bg: "bg-orange-500/10",  text: "text-orange-400",  dot: "bg-orange-400" },
  unknown:    { bg: "bg-white/5",        text: "text-white/30",    dot: "bg-white/20" },
  pending:    { bg: "bg-white/5",        text: "text-white/25",    dot: "bg-white/15" },
};

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

export default function LeadCampaignDetailClient() {
  const { id } = useParams<{ id: string }>();

  const [campaign, setCampaign]         = useState<LeadCampaign | null>(null);
  const [leads, setLeads]               = useState<LeadCampaignLead[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(0);
  const [filter, setFilter]             = useState("all");
  const [search, setSearch]             = useState("");
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [loading, setLoading]           = useState(true);
  const [exporting, setExporting]       = useState(false);
  const [showExport, setShowExport]     = useState(false);
  const [lists, setLists]               = useState<{ id: string; name: string }[]>([]);
  const [exportListId, setExportListId] = useState("");
  const [newListName, setNewListName]   = useState("");
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [cancelling, setCancelling]     = useState(false);
  const [drawerLead, setDrawerLead]     = useState<LeadCampaignLead | null>(null);

  const loadCampaign = useCallback(async () => {
    wsGet<LeadCampaign>(`/api/lead-campaigns/${id}`).then(setCampaign).catch(() => {});
  }, [id]);

  const loadLeads = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: "50", filter, search });
    wsGet<{ leads: LeadCampaignLead[]; total: number }>(`/api/lead-campaigns/${id}/leads?${params}`)
      .then(d => { setLeads(d.leads); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, page, filter, search]);

  useEffect(() => {
    loadCampaign();
    loadLeads();
    wsGet<{ id: string; name: string }[]>("/api/outreach/lists").then(d => setLists(d ?? [])).catch(() => {});
  }, [loadCampaign, loadLeads]);

  useEffect(() => {
    if (!campaign || (campaign.status !== "running" && campaign.status !== "pending")) return;
    const t = setInterval(() => { loadCampaign(); loadLeads(); }, 8000);
    return () => clearInterval(t);
  }, [campaign, loadCampaign, loadLeads]);

  function handleLeadUpdated(patch: Partial<LeadCampaignLead> & { id: string }) {
    setLeads(ls => ls.map(l => l.id === patch.id ? { ...l, ...patch } : l));
    setDrawerLead(d => d && d.id === patch.id ? { ...d, ...patch } : d);
  }

  async function handleExport() {
    setExporting(true);
    setExportResult(null);
    const body: Record<string, unknown> = {
      lead_ids: selected.size > 0 ? Array.from(selected) : undefined,
    };
    if (newListName) body.create_list_name = newListName;
    else body.list_id = exportListId;
    try {
      const data = await wsPost<{ exported: number; skipped_duplicate: number }>(`/api/lead-campaigns/${id}/export`, body);
      setExportResult(`Exported ${data.exported} leads (${data.skipped_duplicate} duplicates skipped)`);
      loadLeads(); setSelected(new Set());
    } catch (e) {
      setExportResult(`Error: ${e instanceof Error ? e.message : "Export failed"}`);
    }
    setExporting(false);
  }

  async function handleCancel() {
    setCancelling(true);
    await wsPost(`/api/lead-campaigns/${id}/cancel`, {}).catch(() => {});
    setCancelling(false);
    loadCampaign();
  }

  function toggleSelect(lid: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected(s => { const n = new Set(s); n.has(lid) ? n.delete(lid) : n.add(lid); return n; });
  }

  const progress = campaign
    ? Math.round((campaign.total_scraped / Math.max(campaign.max_leads, 1)) * 100)
    : 0;

  if (!campaign) return <div className="p-8 text-white/40">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-6">
        <Link href="/lead-campaigns" className="text-white/40 hover:text-white/70 transition-colors">Lead Campaigns</Link>
        <span className="text-white/20">›</span>
        <span className="text-white/70">{campaign.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">{campaign.name}</h1>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium ${STATUS_STYLES[campaign.status]}`}>
            {campaign.status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {(campaign.status === "running" || campaign.status === "pending") && (
            <button
              onClick={handleCancel} disabled={cancelling}
              className="px-3 py-1.5 text-xs font-medium text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              {cancelling ? "Cancelling..." : "Cancel"}
            </button>
          )}
          {campaign.status === "completed" && leads.length > 0 && (
            <button
              onClick={() => {
                wsFetch(`/api/lead-campaigns/${id}/csv`).then(r => r.blob()).then(blob => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `leads-${id.slice(0, 8)}.csv`;
                  a.click();
                });
              }}
              className="px-3 py-1.5 text-xs font-medium text-white/60 border border-white/15 rounded-lg hover:bg-white/5 transition-colors"
            >
              Download CSV
            </button>
          )}
          {campaign.status === "completed" && leads.length > 0 && (
            <button
              onClick={() => setShowExport(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Export to Leads Pool
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {(campaign.status === "running" || campaign.status === "pending") && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-white/40 mb-1.5">
            <span>{campaign.total_scraped} / {campaign.max_leads} scraped</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: "Scraped",      value: campaign.total_scraped,      icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" },
          { label: "Verified",     value: campaign.total_verified,     icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
          { label: "Personalized", value: campaign.total_personalized, icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" },
          { label: "Valid Emails", value: campaign.total_valid,        icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" },
          { label: "Credits Used", value: campaign.credits_used,       icon: "M13 10V3L4 14h7v7l9-11h-7z" },
        ].map(s => (
          <div key={s.label} className="bg-white/3 border border-white/8 rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
              </svg>
            </div>
            <div>
              <p className="text-lg font-bold text-white leading-none">{s.value.toLocaleString()}</p>
              <p className="text-white/35 text-xs mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters + search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-0.5 bg-white/4 border border-white/8 rounded-xl p-1">
          {[
            { key: "all",       label: "All" },
            { key: "valid",     label: "Valid" },
            { key: "not_added", label: "Not Added" },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setPage(0); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.key ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by name, email, company..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors"
          />
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add {selected.size} to Pool
          </button>
        )}
        <span className="text-white/30 text-xs ml-1">{total.toLocaleString()} leads</span>
      </div>

      {/* Leads table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-white/3 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-20 border border-white/8 rounded-2xl text-white/30">
          <svg className="w-10 h-10 text-white/10 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
          {campaign.status === "pending" || campaign.status === "running"
            ? "Leads are being scraped — check back shortly"
            : "No leads match the current filter"}
        </div>
      ) : (
        <>
          <div className="border border-white/8 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 bg-white/2">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      className="accent-blue-500 cursor-pointer"
                      checked={selected.size === leads.length && leads.length > 0}
                      onChange={e => setSelected(e.target.checked ? new Set(leads.map(l => l.id)) : new Set())}
                      onClick={e => e.stopPropagation()}
                    />
                  </th>
                  <th className="text-left text-white/35 font-semibold text-xs uppercase tracking-wider px-4 py-3">Prospect</th>
                  <th className="text-left text-white/35 font-semibold text-xs uppercase tracking-wider px-4 py-3">Company</th>
                  <th className="text-left text-white/35 font-semibold text-xs uppercase tracking-wider px-4 py-3">Location</th>
                  <th className="text-left text-white/35 font-semibold text-xs uppercase tracking-wider px-4 py-3">Verification</th>
                  <th className="text-left text-white/35 font-semibold text-xs uppercase tracking-wider px-4 py-3">AI Opener</th>
                  <th className="text-center text-white/35 font-semibold text-xs uppercase tracking-wider px-4 py-3">Links</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l, i) => {
                  const name     = [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email;
                  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
                  const industry = cleanVal(l.industry);
                  const vs       = l.verification_status ? VERIFY_STYLES[l.verification_status] : null;

                  return (
                    <tr
                      key={l.id}
                      onClick={() => setDrawerLead(l)}
                      className={`${i !== leads.length - 1 ? "border-b border-white/5" : ""} hover:bg-white/3 transition-colors cursor-pointer group`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="accent-blue-500 cursor-pointer"
                          checked={selected.has(l.id)}
                          onChange={() => {}}
                          onClick={e => toggleSelect(l.id, e)}
                        />
                      </td>

                      {/* Prospect */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-xs font-semibold text-white/60 flex-shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white font-medium text-sm leading-tight truncate">{name}</p>
                            <p className="text-white/35 text-xs truncate">{l.email}</p>
                            {l.title && (
                              <p className="text-white/25 text-xs truncate">{l.title}{l.seniority ? ` · ${l.seniority}` : ""}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Company */}
                      <td className="px-4 py-3.5">
                        {l.company ? (
                          <div>
                            <p className="text-white/75 text-sm font-medium truncate max-w-[180px]">{l.company}</p>
                            {industry && (
                              <p className="text-white/30 text-xs truncate max-w-[180px]">{industry}</p>
                            )}
                            {l.org_size && (
                              <p className="text-white/20 text-xs">{l.org_size} employees</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-white/20 text-xs">—</span>
                        )}
                      </td>

                      {/* Location */}
                      <td className="px-4 py-3.5">
                        {l.location ? (
                          <p className="text-white/50 text-xs">{l.location}</p>
                        ) : (
                          <span className="text-white/20 text-xs">—</span>
                        )}
                      </td>

                      {/* Verification */}
                      <td className="px-4 py-3.5">
                        {vs ? (
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium ${vs.bg} ${vs.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${vs.dot}`} />
                            {l.verification_status}
                          </span>
                        ) : (
                          <span className="text-white/20 text-xs">—</span>
                        )}
                      </td>

                      {/* AI Opener */}
                      <td className="px-4 py-3.5 max-w-[220px]">
                        {l.personalized_line ? (
                          <p className="text-white/50 text-xs italic truncate" title={l.personalized_line}>
                            &ldquo;{l.personalized_line}&rdquo;
                          </p>
                        ) : (
                          <span className="text-white/15 text-xs">—</span>
                        )}
                      </td>

                      {/* Links */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          {l.linkedin_url && (
                            <a
                              href={l.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="w-7 h-7 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/40 flex items-center justify-center text-blue-400 transition-all"
                              title="LinkedIn Profile"
                            >
                              <LinkedInIcon />
                            </a>
                          )}
                          {l.website && (
                            <a
                              href={l.website.startsWith("http") ? l.website : `https://${l.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 flex items-center justify-center text-white/40 hover:text-white/70 transition-all"
                              title="Company Website"
                            >
                              <GlobeIcon />
                            </a>
                          )}
                          {l.added_to_list_id && (
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center" title="Added to pool">
                              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                          {/* Open drawer indicator */}
                          <div className="w-7 h-7 rounded-lg bg-white/0 group-hover:bg-white/5 border border-transparent group-hover:border-white/10 flex items-center justify-center text-white/0 group-hover:text-white/30 transition-all">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 50 && (
            <div className="flex items-center justify-between mt-4 text-sm text-white/40">
              <span>{((page * 50) + 1).toLocaleString()}–{Math.min((page + 1) * 50, total).toLocaleString()} of {total.toLocaleString()}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 border border-white/10 rounded-lg disabled:opacity-30 hover:bg-white/5 transition-colors text-xs">← Prev</button>
                <span className="px-3 py-1.5 text-xs">Page {page + 1}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * 50 >= total} className="px-3 py-1.5 border border-white/10 rounded-lg disabled:opacity-30 hover:bg-white/5 transition-colors text-xs">Next →</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Lead Drawer */}
      {drawerLead && (
        <LeadDrawer
          lead={drawerLead}
          campaignId={id}
          hasPersonalizePrompt={!!campaign.personalize_prompt}
          onClose={() => setDrawerLead(null)}
          onUpdated={handleLeadUpdated}
        />
      )}

      {/* Export Modal */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => { setShowExport(false); setExportResult(null); }} />
          <div className="relative w-full max-w-md bg-gray-950 border border-white/10 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Export to Leads Pool</h3>
            <p className="text-white/40 text-sm mb-5">
              {selected.size > 0 ? `${selected.size} selected leads` : "All unexported leads"} will be added to your chosen list
            </p>
            {exportResult ? (
              <div className={`p-3 rounded-xl text-sm mb-4 ${exportResult.startsWith("Error") ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                {exportResult}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">Add to existing list</label>
                  <select
                    value={exportListId}
                    onChange={e => { setExportListId(e.target.value); setNewListName(""); }}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/60 transition-colors"
                  >
                    <option value="">Select a list...</option>
                    {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/8" />
                  <span className="text-white/30 text-xs">or</span>
                  <div className="flex-1 h-px bg-white/8" />
                </div>
                <div>
                  <label className="block text-white/40 text-xs font-semibold uppercase tracking-wider mb-1.5">Create new list</label>
                  <input
                    value={newListName}
                    onChange={e => { setNewListName(e.target.value); setExportListId(""); }}
                    placeholder="List name..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors"
                  />
                </div>
                <button
                  onClick={handleExport}
                  disabled={exporting || (!exportListId && !newListName)}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {exporting ? "Exporting..." : "Export Leads"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
