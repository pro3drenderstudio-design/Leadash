"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Workspace {
  id: string; name: string; slug: string; owner_id: string; owner_email: string;
  plan_id: string; plan_status: string; lead_credits_balance: number;
  sends_this_month: number; max_monthly_sends: number; max_inboxes: number; max_seats: number;
  created_at: string; updated_at: string;
  stripe_customer_id: string | null; stripe_sub_id: string | null; billing_email: string | null;
  trial_ends_at: string | null;
}
interface CreditTx {
  id: string; amount: number; type: string; description: string; created_at: string;
}
interface Campaign {
  id: string; name: string; status: string; total_scraped: number; credits_used: number; created_at: string;
}

const PLANS = ["free", "starter", "growth", "scale"] as const;
const PLAN_STATUSES = ["active", "trialing", "past_due", "canceled", "paused"] as const;

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, string> = {
    free:    "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50",
    starter: "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300",
    growth:  "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300",
    scale:   "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${map[plan] ?? map.free}`}>{plan}</span>;
}

function TxBadge({ type }: { type: string }) {
  if (type.includes("grant"))   return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300">{type}</span>;
  if (type.includes("deduct") || type.includes("used")) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">{type}</span>;
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/40">{type}</span>;
}

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [credits, setCredits]     = useState<CreditTx[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [campaignPage, setCampaignPage] = useState(0);
  const [txPage, setTxPage]             = useState(0);
  const PAGE_SIZE = 10;

  // Plan change state
  const [planForm, setPlanForm]   = useState({ plan_id: "", plan_status: "active" });
  const [planLoading, setPlanLoading] = useState(false);
  const [planMsg, setPlanMsg]     = useState<string | null>(null);

  // Credit adjustment state
  const [creditForm, setCreditForm] = useState({ amount: "", description: "" });
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditMsg, setCreditMsg] = useState<string | null>(null);

  const fetchWorkspace = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/workspaces/${workspaceId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setWorkspace(d.workspace);
        setPlanForm({ plan_id: d.workspace.plan_id, plan_status: d.workspace.plan_status });
        setCredits(d.credits ?? []);
        setCampaigns(d.campaigns ?? []);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load workspace"); setLoading(false); });
  }, [workspaceId]);

  useEffect(() => { fetchWorkspace(); }, [fetchWorkspace]);

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    setPlanLoading(true);
    setPlanMsg(null);
    const res = await fetch(`/api/admin/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "change_plan", ...planForm }),
    });
    const data = await res.json();
    setPlanLoading(false);
    if (data.ok) { setPlanMsg("Plan updated."); fetchWorkspace(); }
    else setPlanMsg(`Error: ${data.error}`);
  }

  async function adjustCredits(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseInt(creditForm.amount);
    if (!amount) return;
    setCreditLoading(true);
    setCreditMsg(null);
    const res = await fetch(`/api/admin/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "adjust_credits", amount, description: creditForm.description || undefined }),
    });
    const data = await res.json();
    setCreditLoading(false);
    if (data.ok) {
      setCreditMsg(`${amount > 0 ? "Granted" : "Deducted"} ${Math.abs(amount)} credits.`);
      setCreditForm({ amount: "", description: "" });
      fetchWorkspace();
    } else {
      setCreditMsg(`Error: ${data.error}`);
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6 animate-pulse">
        <div className="h-6 bg-slate-200 dark:bg-white/10 rounded w-48" />
        <div className="h-36 bg-slate-200 dark:bg-white/10 rounded-xl" />
        <div className="h-48 bg-slate-200 dark:bg-white/10 rounded-xl" />
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <p className="text-red-500">{error ?? "Workspace not found"}</p>
        <Link href="/admin/workspaces" className="text-sm text-orange-500 hover:underline mt-2 block">← Back to workspaces</Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-white/30">
        <Link href="/admin/workspaces" className="hover:text-orange-500 transition-colors">Workspaces</Link>
        <span>/</span>
        <span className="text-slate-700 dark:text-white/70">{workspace.name}</span>
      </div>

      {/* Overview card */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{workspace.name}</h1>
            <p className="text-sm text-slate-400 dark:text-white/40">{workspace.slug}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <PlanBadge plan={workspace.plan_id} />
              <span className="text-[10px] text-slate-400 dark:text-white/30">ID: {workspace.id}</span>
            </div>
          </div>
          <Link
            href={`/admin/users/${workspace.owner_id}`}
            className="text-sm text-orange-500 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
          >
            Owner: {workspace.owner_email} →
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Credits", value: workspace.lead_credits_balance.toLocaleString() },
            { label: "Sends this month", value: `${workspace.sends_this_month.toLocaleString()} / ${workspace.max_monthly_sends.toLocaleString()}` },
            { label: "Max inboxes", value: String(workspace.max_inboxes) },
            { label: "Max seats", value: String(workspace.max_seats) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-50 dark:bg-white/5 rounded-lg px-4 py-3">
              <p className="text-[11px] text-slate-400 dark:text-white/30 uppercase tracking-wide font-semibold">{label}</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-white/80 mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {(workspace.stripe_customer_id || workspace.billing_email) && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/10 grid grid-cols-2 gap-4 text-xs text-slate-500 dark:text-white/40">
            {workspace.stripe_customer_id && <p>Stripe customer: <span className="font-mono">{workspace.stripe_customer_id}</span></p>}
            {workspace.stripe_sub_id && <p>Stripe sub: <span className="font-mono">{workspace.stripe_sub_id}</span></p>}
            {workspace.billing_email && <p>Billing email: {workspace.billing_email}</p>}
            {workspace.trial_ends_at && <p>Trial ends: {new Date(workspace.trial_ends_at).toLocaleDateString()}</p>}
          </div>
        )}
      </div>

      {/* Controls row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Change plan */}
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70 mb-4">Change Plan</h2>
          <form onSubmit={savePlan} className="space-y-3">
            <div>
              <label className="text-xs text-slate-500 dark:text-white/40 block mb-1">Plan</label>
              <select
                value={planForm.plan_id}
                onChange={e => setPlanForm(f => ({ ...f, plan_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              >
                {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-white/40 block mb-1">Status</label>
              <select
                value={planForm.plan_status}
                onChange={e => setPlanForm(f => ({ ...f, plan_status: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              >
                {PLAN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {planMsg && (
              <p className={`text-xs font-medium ${planMsg.startsWith("Error") ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                {planMsg}
              </p>
            )}
            <button
              type="submit"
              disabled={planLoading}
              className="w-full py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-50"
            >
              {planLoading ? "Saving…" : "Save Plan"}
            </button>
          </form>
        </div>

        {/* Adjust credits */}
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70 mb-1">Adjust Credits</h2>
          <p className="text-xs text-slate-400 dark:text-white/30 mb-4">
            Current balance: <strong className="text-slate-700 dark:text-white/70">{workspace.lead_credits_balance.toLocaleString()}</strong>
          </p>
          <form onSubmit={adjustCredits} className="space-y-3">
            <div>
              <label className="text-xs text-slate-500 dark:text-white/40 block mb-1">Amount (negative to deduct)</label>
              <input
                type="number"
                value={creditForm.amount}
                onChange={e => setCreditForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 500 or -100"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-white/40 block mb-1">Description (optional)</label>
              <input
                type="text"
                value={creditForm.description}
                onChange={e => setCreditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Promotional grant"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
            {creditMsg && (
              <p className={`text-xs font-medium ${creditMsg.startsWith("Error") ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                {creditMsg}
              </p>
            )}
            <button
              type="submit"
              disabled={creditLoading || !creditForm.amount}
              className="w-full py-2 text-sm font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50"
            >
              {creditLoading ? "Applying…" : "Apply Adjustment"}
            </button>
          </form>
        </div>
      </div>

      {/* Tables row — 2 columns */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Campaigns */}
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">Lead Campaigns</h2>
            <span className="text-xs text-slate-400 dark:text-white/30">{campaigns.length} total</span>
          </div>
          {campaigns.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-400 dark:text-white/30">No campaigns yet</p>
          ) : (
            <>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-white/10">
                      {["Name", "Status", "Leads", "Credits", "Date"].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {campaigns.slice(campaignPage * PAGE_SIZE, (campaignPage + 1) * PAGE_SIZE).map(c => (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-slate-800 dark:text-white/80 font-medium max-w-[120px] truncate">{c.name}</td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50">{c.status}</span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-white/60">{(c.total_scraped ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-500 dark:text-white/40 text-xs">{(c.credits_used ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-white/40 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {campaigns.length > PAGE_SIZE && (
                <div className="px-4 py-2.5 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-xs text-slate-400 dark:text-white/30">
                  <span>{campaignPage * PAGE_SIZE + 1}–{Math.min((campaignPage + 1) * PAGE_SIZE, campaigns.length)} of {campaigns.length}</span>
                  <div className="flex gap-1">
                    <button onClick={() => setCampaignPage(p => Math.max(0, p - 1))} disabled={campaignPage === 0} className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors">←</button>
                    <button onClick={() => setCampaignPage(p => p + 1)} disabled={(campaignPage + 1) * PAGE_SIZE >= campaigns.length} className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors">→</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Credit transaction log */}
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">Credit Transactions</h2>
            <span className="text-xs text-slate-400 dark:text-white/30">{credits.length} total</span>
          </div>
          {credits.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-400 dark:text-white/30">No transactions yet</p>
          ) : (
            <>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-white/10">
                      {["Type", "Amount", "Description", "Date"].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {credits.slice(txPage * PAGE_SIZE, (txPage + 1) * PAGE_SIZE).map(tx => (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3"><TxBadge type={tx.type} /></td>
                        <td className={`px-4 py-3 tabular-nums font-semibold text-sm ${tx.amount > 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                          {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-white/50 text-xs max-w-[100px] truncate">{tx.description}</td>
                        <td className="px-4 py-3 text-slate-400 dark:text-white/30 text-xs">{new Date(tx.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {credits.length > PAGE_SIZE && (
                <div className="px-4 py-2.5 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-xs text-slate-400 dark:text-white/30">
                  <span>{txPage * PAGE_SIZE + 1}–{Math.min((txPage + 1) * PAGE_SIZE, credits.length)} of {credits.length}</span>
                  <div className="flex gap-1">
                    <button onClick={() => setTxPage(p => Math.max(0, p - 1))} disabled={txPage === 0} className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors">←</button>
                    <button onClick={() => setTxPage(p => p + 1)} disabled={(txPage + 1) * PAGE_SIZE >= credits.length} className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors">→</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </div>

    </div>
  );
}
