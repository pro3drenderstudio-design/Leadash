"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LeadCampaign } from "@/types/lead-campaigns";
import { wsGet } from "@/lib/workspace/client";
import NewCampaignModal from "./NewCampaignModal";

const STATUS_STYLES: Record<string, string> = {
  pending:   "bg-white/8 text-white/50",
  running:   "bg-orange-500/15 text-orange-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  failed:    "bg-red-500/15 text-red-400",
  cancelled: "bg-white/8 text-white/30",
};

const MODE_LABELS: Record<string, string> = {
  scrape:             "Scrape Only",
  verify_personalize: "Verify + Personalize",
  full_suite:         "Full Suite",
};

const MODE_STYLES: Record<string, string> = {
  scrape:             "bg-violet-500/15 text-violet-400",
  verify_personalize: "bg-amber-500/15 text-amber-400",
  full_suite:         "bg-orange-500/15 text-orange-400",
};

export default function LeadCampaignsClient() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<LeadCampaign[]>([]);
  const [balance, setBalance]     = useState<number>(0);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);

  async function load() {
    const [campaigns, credits] = await Promise.all([
      wsGet<LeadCampaign[]>("/api/lead-campaigns"),
      wsGet<{ balance: number }>("/api/lead-campaigns/credits"),
    ]).catch(() => [[], { balance: 0 }] as const);
    setCampaigns(campaigns as LeadCampaign[]);
    setBalance((credits as { balance: number }).balance ?? 0);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Poll running campaigns
  useEffect(() => {
    const hasRunning = campaigns.some(c => c.status === "running" || c.status === "pending");
    if (!hasRunning) return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [campaigns]);

  const totalScraped    = campaigns.filter(c => c.mode !== "verify_personalize").reduce((s, c) => s + c.total_scraped, 0);
  const totalValid      = campaigns.reduce((s, c) => s + c.total_valid, 0);
  const totalPersonalized = campaigns.reduce((s, c) => s + c.total_personalized, 0);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold text-white">Lead Campaigns</h1>
          <p className="text-white/40 text-sm mt-0.5">Scrape, verify, and personalize leads for outreach</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/lead-campaigns/credits"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/25 rounded-lg text-amber-400 text-sm font-medium hover:bg-amber-500/15 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {balance.toLocaleString()} credits
          </Link>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            + New Campaign
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Campaigns",     value: campaigns.length },
          { label: "Leads Scraped", value: totalScraped },
          { label: "Valid Emails",  value: totalValid },
          { label: "Personalized",  value: totalPersonalized },
        ].map(s => (
          <div key={s.label} className="bg-white/4 border border-white/8 rounded-xl p-4">
            <p className="text-2xl font-bold text-white">{s.value.toLocaleString()}</p>
            <p className="text-white/40 text-sm mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-white/4 rounded-xl animate-pulse" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-20 border border-white/8 rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-white font-medium">No campaigns yet</p>
          <p className="text-white/40 text-sm mt-1 mb-5">Create your first lead generation campaign to start building your prospect list</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-5 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Create Campaign
          </button>
        </div>
      ) : (
        <div className="border border-white/8 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                <th className="text-left text-white/40 font-medium px-4 py-3">Campaign</th>
                <th className="text-left text-white/40 font-medium px-4 py-3">Mode</th>
                <th className="text-left text-white/40 font-medium px-4 py-3">Status</th>
                <th className="text-right text-white/40 font-medium px-4 py-3">Leads</th>
                <th className="text-right text-white/40 font-medium px-4 py-3">Credits</th>
                <th className="text-right text-white/40 font-medium px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c, i) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/lead-campaigns/${c.id}`)}
                  className={`cursor-pointer hover:bg-white/4 transition-colors ${i !== campaigns.length - 1 ? "border-b border-white/5" : ""}`}
                >
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{c.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${MODE_STYLES[c.mode]}`}>
                      {MODE_LABELS[c.mode]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_STYLES[c.status]}`}>
                      {c.status === "running" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                      )}
                      {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-white/70">
                    {c.mode === "verify_personalize"
                      ? `${c.total_verified.toLocaleString()} verified`
                      : c.total_scraped.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-white/70">{c.credits_used.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-white/40 text-xs">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <NewCampaignModal
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); load(); }}
          balance={balance}
        />
      )}
    </div>
  );
}
