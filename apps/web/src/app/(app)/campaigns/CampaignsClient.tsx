"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getCampaigns, updateCampaign, deleteCampaign, cloneCampaign } from "@/lib/outreach/api";
import type { OutreachCampaign, CampaignStatus } from "@/types/outreach";

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft:     "text-white/40 bg-white/8",
  active:    "text-green-400 bg-green-500/15",
  paused:    "text-amber-400 bg-amber-500/15",
  completed: "text-orange-400 bg-orange-500/15",
};

const ALL_STATUSES: Array<CampaignStatus | "all"> = ["all", "active", "paused", "draft", "completed"];

export default function CampaignsClient() {
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setCampaigns(await getCampaigns());
    setLoading(false);
  }

  async function toggleStatus(c: OutreachCampaign) {
    const next = c.status === "active" ? "paused" : c.status === "paused" ? "active" : "active";
    await updateCampaign(c.id, { status: next as CampaignStatus });
    load();
  }

  async function handleDelete(c: OutreachCampaign) {
    if (!confirm(`Delete campaign "${c.name}"? This cannot be undone.`)) return;
    await deleteCampaign(c.id); load();
  }

  async function handleClone(c: OutreachCampaign) {
    await cloneCampaign(c.id);
    load();
  }

  const filtered = campaigns.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const countByStatus = (s: CampaignStatus | "all") =>
    s === "all" ? campaigns.length : campaigns.filter(c => c.status === s).length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Sequences</h1>
          <p className="text-white/40 text-sm mt-0.5">Create and manage cold email sequences</p>
        </div>
        <Link href="/campaigns/new" className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-sm font-semibold transition-colors">
          + New Sequence
        </Link>
      </div>

      {/* Search + Status Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="text"
          placeholder="Search campaigns…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-orange-500/50"
        />
        <div className="flex gap-1 bg-white/4 border border-white/8 rounded-xl p-1">
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                statusFilter === s
                  ? "bg-white/12 text-white"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              {s === "all" ? "All" : s}
              {s !== "all" && countByStatus(s) > 0 && (
                <span className="ml-1 text-white/30">{countByStatus(s)}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-20 bg-white/4 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <div className="text-4xl mb-3">✉️</div>
          <p className="font-medium">{search || statusFilter !== "all" ? "No campaigns match your filters" : "No campaigns yet"}</p>
          {!search && statusFilter === "all" && <p className="text-sm mt-1">Create your first campaign to start sending</p>}
        </div>
      ) : (
        <div className="border border-white/8 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_100px] gap-4 px-5 py-3 bg-white/3 border-b border-white/6">
            {["Campaign", "Status", "Enrolled", "Sent", "Open Rate", "Replies"].map((h) => (
              <div key={h} className="text-white/35 text-xs font-semibold uppercase tracking-wider">{h}</div>
            ))}
            <div />
          </div>
          {filtered.map((c, i) => {
            const enrolled  = c.total_enrolled ?? 0;
            const sent      = c.total_sent     ?? 0;
            const opened    = c.total_opened   ?? 0;
            const replied   = c.total_replied  ?? 0;
            const openRate  = sent > 0 ? Math.round((opened / sent) * 100) : 0;
            const progress  = enrolled > 0 ? Math.round(((replied) / enrolled) * 100) : 0;

            return (
              <div key={c.id} className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_100px] gap-4 items-center px-5 py-4 border-b border-white/4 last:border-0 ${i % 2 === 0 ? "" : "bg-white/1"}`}>
                <div>
                  <Link href={`/campaigns/${c.id}`} className="text-white font-medium text-sm hover:text-orange-300 transition-colors">{c.name}</Link>
                  <div className="text-white/30 text-xs mt-0.5">{c.send_days?.join(", ")} · {c.send_start_time}–{c.send_end_time}</div>
                  {c.status === "active" && enrolled > 0 && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-white/8 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500/60 rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="text-white/25 text-xs">{progress}% replied</span>
                    </div>
                  )}
                </div>
                <div><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[c.status]}`}>{c.status}</span></div>
                <div className="text-white/60 text-sm">{enrolled.toLocaleString()}</div>
                <div className="text-white/60 text-sm">{sent.toLocaleString()}</div>
                <div className="text-sm font-medium" style={{ color: openRate >= 40 ? "#4ade80" : openRate >= 20 ? "#fbbf24" : openRate > 0 ? "#94a3b8" : "#ffffff20" }}>
                  {sent > 0 ? `${openRate}%` : "—"}
                </div>
                <div className="text-white/60 text-sm">{replied.toLocaleString()}</div>
                <div className="flex items-center gap-1 justify-end">
                  {/* Pause / Activate */}
                  {c.status !== "completed" && (
                    <button
                      onClick={() => toggleStatus(c)}
                      title={c.status === "active" ? "Pause" : "Activate"}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/4 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                    >
                      {c.status === "active" ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      )}
                    </button>
                  )}
                  {/* Edit */}
                  <Link
                    href={`/campaigns/${c.id}`}
                    title="Edit"
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/4 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </Link>
                  {/* Duplicate */}
                  <button
                    onClick={() => handleClone(c)}
                    title="Duplicate"
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/4 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(c)}
                    title="Delete"
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/4 hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
