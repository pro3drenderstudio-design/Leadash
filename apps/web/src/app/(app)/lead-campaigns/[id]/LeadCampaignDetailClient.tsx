"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { LeadCampaign, LeadCampaignLead } from "@/types/lead-campaigns";

const STATUS_STYLES: Record<string, string> = {
  pending:   "bg-white/8 text-white/50",
  running:   "bg-blue-500/15 text-blue-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  failed:    "bg-red-500/15 text-red-400",
  cancelled: "bg-white/8 text-white/30",
};

const VERIFY_STYLES: Record<string, string> = {
  valid:       "bg-emerald-500/15 text-emerald-400",
  invalid:     "bg-red-500/15 text-red-400",
  catch_all:   "bg-amber-500/15 text-amber-400",
  disposable:  "bg-orange-500/15 text-orange-400",
  unknown:     "bg-white/8 text-white/40",
  pending:     "bg-white/8 text-white/30",
};

export default function LeadCampaignDetailClient() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [campaign, setCampaign]   = useState<LeadCampaign | null>(null);
  const [leads, setLeads]         = useState<LeadCampaignLead[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [filter, setFilter]       = useState("all");
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [loading, setLoading]     = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [lists, setLists]         = useState<{ id: string; name: string }[]>([]);
  const [exportListId, setExportListId]   = useState("");
  const [newListName, setNewListName]     = useState("");
  const [exportResult, setExportResult]  = useState<string | null>(null);
  const [cancelling, setCancelling]      = useState(false);

  const loadCampaign = useCallback(async () => {
    const res = await fetch(`/api/lead-campaigns/${id}`);
    if (res.ok) setCampaign(await res.json());
  }, [id]);

  const loadLeads = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: "50", filter, search });
    const res = await fetch(`/api/lead-campaigns/${id}/leads?${params}`);
    if (res.ok) { const d = await res.json(); setLeads(d.leads); setTotal(d.total); }
    setLoading(false);
  }, [id, page, filter, search]);

  useEffect(() => {
    loadCampaign();
    loadLeads();
    fetch("/api/outreach/lists").then(r => r.json()).then(d => setLists(d ?? []));
  }, [loadCampaign, loadLeads]);

  // Poll while running
  useEffect(() => {
    if (!campaign || (campaign.status !== "running" && campaign.status !== "pending")) return;
    const t = setInterval(() => { loadCampaign(); loadLeads(); }, 8000);
    return () => clearInterval(t);
  }, [campaign, loadCampaign, loadLeads]);

  async function handleExport() {
    setExporting(true);
    setExportResult(null);
    const body: Record<string, unknown> = {
      lead_ids: selected.size > 0 ? Array.from(selected) : undefined,
    };
    if (newListName) body.create_list_name = newListName;
    else body.list_id = exportListId;

    const res  = await fetch(`/api/lead-campaigns/${id}/export`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    setExportResult(res.ok
      ? `Exported ${data.exported} leads (${data.skipped_duplicate} duplicates skipped)`
      : `Error: ${data.error}`
    );
    setExporting(false);
    if (res.ok) { loadLeads(); setSelected(new Set()); }
  }

  async function handleCancel() {
    setCancelling(true);
    await fetch(`/api/lead-campaigns/${id}/cancel`, { method: "POST" });
    setCancelling(false);
    loadCampaign();
  }

  function toggleSelect(lid: string) {
    setSelected(s => { const n = new Set(s); n.has(lid) ? n.delete(lid) : n.add(lid); return n; });
  }

  const progress = campaign
    ? Math.round((campaign.total_scraped / Math.max(campaign.max_leads, 1)) * 100)
    : 0;

  if (!campaign) return <div className="p-8 text-white/40">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
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
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_STYLES[campaign.status]}`}>
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
              onClick={() => setShowExport(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Export to Leads Pool
            </button>
          )}
        </div>
      </div>

      {/* Progress bar (running) */}
      {(campaign.status === "running" || campaign.status === "pending") && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-white/40 mb-1.5">
            <span>{campaign.total_scraped} / {campaign.max_leads} scraped</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-white/8 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: "Scraped",       value: campaign.total_scraped },
          { label: "Verified",      value: campaign.total_verified },
          { label: "Personalized",  value: campaign.total_personalized },
          { label: "Valid Emails",  value: campaign.total_valid },
          { label: "Credits Used",  value: campaign.credits_used },
        ].map(s => (
          <div key={s.label} className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-white">{s.value.toLocaleString()}</p>
            <p className="text-white/40 text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-white/4 border border-white/8 rounded-xl p-1">
          {[
            { key: "all",       label: "All" },
            { key: "valid",     label: "Valid Only" },
            { key: "not_added", label: "Not Added" },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setPage(0); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.key ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search leads..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors"
        />
        {selected.size > 0 && (
          <button
            onClick={() => setShowExport(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Add {selected.size} to Pool →
          </button>
        )}
      </div>

      {/* Leads table */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-white/4 rounded-xl animate-pulse" />)}</div>
      ) : leads.length === 0 ? (
        <div className="text-center py-16 border border-white/8 rounded-2xl text-white/30">
          {campaign.status === "pending" || campaign.status === "running"
            ? "Leads are being scraped — check back shortly"
            : "No leads match the current filter"}
        </div>
      ) : (
        <>
          <div className="border border-white/8 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      className="accent-blue-500"
                      checked={selected.size === leads.length && leads.length > 0}
                      onChange={e => setSelected(e.target.checked ? new Set(leads.map(l => l.id)) : new Set())}
                    />
                  </th>
                  <th className="text-left text-white/40 font-medium px-4 py-3">Prospect</th>
                  <th className="text-left text-white/40 font-medium px-4 py-3">Company</th>
                  <th className="text-left text-white/40 font-medium px-4 py-3">Verification</th>
                  <th className="text-left text-white/40 font-medium px-4 py-3">Personalized Line</th>
                  <th className="text-center text-white/40 font-medium px-4 py-3">Added</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l, i) => {
                  const name = [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email;
                  return (
                    <tr key={l.id} className={`${i !== leads.length - 1 ? "border-b border-white/5" : ""} hover:bg-white/3 transition-colors`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" className="accent-blue-500" checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{name}</p>
                        <p className="text-white/40 text-xs">{l.email}</p>
                        {l.title && <p className="text-white/30 text-xs">{l.title}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white/70 text-sm">{l.company ?? "—"}</p>
                        {l.industry && <p className="text-white/30 text-xs">{l.industry}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {l.verification_status ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${VERIFY_STYLES[l.verification_status] ?? ""}`}>
                            {l.verification_status}
                          </span>
                        ) : <span className="text-white/20 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        {l.personalized_line ? (
                          <p className="text-white/60 text-xs italic truncate" title={l.personalized_line}>
                            "{l.personalized_line}"
                          </p>
                        ) : <span className="text-white/20 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {l.added_to_list_id ? (
                          <svg className="w-4 h-4 text-emerald-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : <span className="text-white/20 text-xs">—</span>}
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
              <span>{total.toLocaleString()} total leads</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 border border-white/10 rounded-lg disabled:opacity-30 hover:bg-white/5 transition-colors">←</button>
                <span className="px-3 py-1.5">Page {page + 1}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * 50 >= total} className="px-3 py-1.5 border border-white/10 rounded-lg disabled:opacity-30 hover:bg-white/5 transition-colors">→</button>
              </div>
            </div>
          )}
        </>
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
