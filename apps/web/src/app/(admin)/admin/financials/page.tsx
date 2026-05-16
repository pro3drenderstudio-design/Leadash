"use client";
import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

interface PlanRow {
  plan_id:   string;
  name:      string;
  count:     number;
  price_ngn: number;
  mrr_ngn:   number;
}

interface ChartPoint {
  month:   string;
  plans:   number;
  credits: number;
  addons:  number;
  academy: number;
  total:   number;
}

interface Transaction {
  id:             string;
  type:           string;
  description:    string | null;
  amount_ngn:     number;
  created_at:     string;
  workspace_name: string;
}

interface FinancialsData {
  mrr_ngn:               number;
  arr_ngn:               number;
  plans_mrr:             number;
  ip_mrr:                number;
  inbox_mrr:             number;
  all_time_revenue_ngn:  number;
  this_month_revenue_ngn: number;
  last_month_revenue_ngn: number;
  mom_delta_pct:         number | null;
  active_paid:           number;
  past_due:              number;
  trialing:              number;
  free_count:            number;
  arpu_ngn:              number;
  at_risk_mrr_ngn:       number;
  trial_pipeline_mrr_ngn: number;
  new_subs_count:        number;
  churn_count:           number;
  plan_breakdown:        PlanRow[];
  type_breakdown:        Record<string, number>;
  chart:                 ChartPoint[];
  recent_transactions:   Transaction[];
  generated_at:          string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ngn(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `₦${(n / 1_000).toFixed(1)}k`;
  return `₦${n.toLocaleString()}`;
}

function ngnFull(n: number) {
  return `₦${n.toLocaleString("en-NG")}`;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

const TYPE_COLORS: Record<string, string> = {
  plan_subscription: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  plan_renewal:      "bg-blue-500/10 text-blue-300 border-blue-500/15",
  credit_purchase:   "bg-amber-500/15 text-amber-400 border-amber-500/20",
  dedicated_ip:      "bg-purple-500/15 text-purple-400 border-purple-500/20",
  dedicated_ip_renewal: "bg-purple-500/10 text-purple-300 border-purple-500/15",
  inbox_billing:     "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  academy_enrollment:"bg-green-500/15 text-green-400 border-green-500/20",
  domain_purchase:   "bg-slate-500/15 text-slate-400 border-slate-500/20",
};

function TypeBadge({ type }: { type: string }) {
  const label = type.replace(/_/g, " ");
  const cls   = TYPE_COLORS[type] ?? "bg-white/10 text-white/40 border-white/10";
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, subColor = "text-white/30", accent = false,
}: {
  label: string; value: string; sub?: string; subColor?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-xl p-5 border flex flex-col gap-1 ${
      accent
        ? "bg-orange-500/8 border-orange-500/20"
        : "bg-white/[0.03] border-white/8"
    }`}>
      <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accent ? "text-orange-300" : "text-white/90"}`}>{value}</p>
      {sub && <p className={`text-[11px] font-medium ${subColor}`}>{sub}</p>}
    </div>
  );
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-xl px-4 py-3 shadow-2xl text-xs" style={{ background: "var(--dropdown-bg)", border: "1px solid var(--card-border)" }}>
      <p className="text-white/40 mb-2 font-medium">{label}</p>
      {payload.map(p => p.value > 0 && (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: p.color }} />
          <span className="text-white/50 capitalize">{p.name}</span>
          <span className="ml-auto font-semibold pl-4 text-white/80">{ngn(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-white/8">
          <span className="text-white/40">Total</span>
          <span className="font-bold text-white/90">{ngn(total)}</span>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FinancialsPage() {
  const [data,    setData]    = useState<FinancialsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/financials");
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json() as FinancialsData);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-white/20 border-t-orange-400 rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="p-8 text-red-400 text-sm">{error}</div>
  );

  if (!data) return null;

  const totalMrrParts = [
    { label: "Plans",        value: data.plans_mrr, color: "#3b82f6" },
    { label: "Dedicated IPs", value: data.ip_mrr,   color: "#a855f7" },
    { label: "Inbox billing", value: data.inbox_mrr, color: "#06b6d4" },
  ].filter(p => p.value > 0);

  const momArrow = data.mom_delta_pct !== null
    ? data.mom_delta_pct >= 0 ? "▲" : "▼"
    : null;
  const momColor = data.mom_delta_pct !== null
    ? data.mom_delta_pct >= 0 ? "text-emerald-400" : "text-red-400"
    : "text-white/30";

  // Revenue mix this month for mini bar
  const mixEntries = Object.entries(data.type_breakdown).sort((a, b) => b[1] - a[1]);
  const mixTotal   = mixEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white/90">Financials</h1>
          <p className="text-xs text-white/30 mt-0.5">
            Last updated {timeAgo(data.generated_at)}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white/80 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Hero KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Monthly Recurring Revenue"
          value={ngn(data.mrr_ngn)}
          sub={totalMrrParts.map(p => `${p.label} ${ngn(p.value)}`).join(" · ")}
          accent
        />
        <KpiCard
          label="Annual Run Rate"
          value={ngn(data.arr_ngn)}
          sub="MRR × 12"
        />
        <KpiCard
          label="Revenue This Month"
          value={ngn(data.this_month_revenue_ngn)}
          sub={momArrow && data.mom_delta_pct !== null
            ? `${momArrow} ${Math.abs(data.mom_delta_pct)}% vs last month`
            : "Cash collected"}
          subColor={momColor}
        />
        <KpiCard
          label="All-Time Revenue"
          value={ngn(data.all_time_revenue_ngn)}
          sub="From billing invoices"
        />
      </div>

      {/* ── Secondary KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Active Paying Users"
          value={data.active_paid.toLocaleString()}
          sub={`${data.past_due} past due · ${data.trialing} trialing`}
          subColor={data.past_due > 0 ? "text-red-400/70" : "text-white/30"}
        />
        <KpiCard
          label="ARPU"
          value={ngn(data.arpu_ngn)}
          sub="Avg revenue per paying user"
        />
        <KpiCard
          label="At-Risk MRR"
          value={ngn(data.at_risk_mrr_ngn)}
          sub={`${data.past_due} past-due accounts`}
          subColor={data.at_risk_mrr_ngn > 0 ? "text-red-400/70" : "text-emerald-400/70"}
        />
        <KpiCard
          label="Trial Pipeline"
          value={ngn(data.trial_pipeline_mrr_ngn)}
          sub={`${data.trialing} users in trial`}
          subColor="text-amber-400/70"
        />
      </div>

      {/* ── This Month + New / Churn ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="New Subscriptions"  value={String(data.new_subs_count)}  sub="This month" />
        <KpiCard label="Churned"            value={String(data.churn_count)}     sub="This month" subColor={data.churn_count > 0 ? "text-red-400/70" : "text-white/30"} />
        <KpiCard label="Free Users"         value={data.free_count.toLocaleString()} sub="Conversion opportunity" />
        <KpiCard label="Last Month Revenue" value={ngn(data.last_month_revenue_ngn)} sub="Collected" />
      </div>

      {/* ── Revenue Chart ── */}
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-bold text-white/80">Revenue — Last 12 Months</h2>
            <p className="text-[11px] text-white/30 mt-0.5">Stacked by source · NGN</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { key: "plans",   color: "#3b82f6", label: "Plans" },
              { key: "credits", color: "#f59e0b", label: "Credits" },
              { key: "addons",  color: "#a855f7", label: "Add-ons" },
              { key: "academy", color: "#10b981", label: "Academy" },
            ].map(s => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                <span className="text-[10px] text-white/40">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.chart} barSize={16} barGap={2}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => ngn(v as number)} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} width={54} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey="plans"   stackId="a" fill="#3b82f6" radius={[0,0,0,0]} name="plans" />
            <Bar dataKey="credits" stackId="a" fill="#f59e0b" radius={[0,0,0,0]} name="credits" />
            <Bar dataKey="addons"  stackId="a" fill="#a855f7" radius={[0,0,0,0]} name="add-ons" />
            <Bar dataKey="academy" stackId="a" fill="#10b981" radius={[4,4,0,0]} name="academy" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── MRR Trend line ── */}
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
        <div className="mb-5">
          <h2 className="text-sm font-bold text-white/80">Total Revenue Trend</h2>
          <p className="text-[11px] text-white/30 mt-0.5">Monthly collected · NGN</p>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data.chart}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => ngn(v as number)} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} width={54} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)" }} />
            <Line dataKey="total" stroke="#f97316" strokeWidth={2} dot={{ fill: "#f97316", r: 3 }} name="total" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Plan Breakdown + Revenue Mix ── */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* Plan Breakdown */}
        <div className="bg-white/[0.03] border border-white/8 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/6">
            <h2 className="text-sm font-bold text-white/80">Subscription Breakdown</h2>
            <p className="text-[11px] text-white/30 mt-0.5">Active paying workspaces by plan</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/6">
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider">Plan</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider">Users</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider">Price/mo</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider">MRR</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.plan_breakdown.map(p => {
                const share = data.plans_mrr > 0 ? Math.round((p.mrr_ngn / data.plans_mrr) * 100) : 0;
                return (
                  <tr key={p.plan_id} className="border-b border-white/4 hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-semibold text-white/75 capitalize">{p.name}</span>
                    </td>
                    <td className="px-5 py-3 text-right text-white/60 tabular-nums">{p.count}</td>
                    <td className="px-5 py-3 text-right text-white/45 tabular-nums">{ngn(p.price_ngn)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-white/80 tabular-nums">{ngn(p.mrr_ngn)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-12 h-1 rounded-full bg-white/8 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${share}%` }} />
                        </div>
                        <span className="text-white/35 tabular-nums w-7 text-right">{share}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr className="bg-white/[0.02]">
                <td className="px-5 py-3 font-bold text-white/60 text-[10px] uppercase tracking-wide">Total Plans</td>
                <td className="px-5 py-3 text-right font-bold text-white/70 tabular-nums">{data.active_paid}</td>
                <td className="px-5 py-3" />
                <td className="px-5 py-3 text-right font-bold text-orange-300 tabular-nums">{ngn(data.plans_mrr)}</td>
                <td className="px-5 py-3" />
              </tr>
              {/* Add-ons */}
              {(data.ip_mrr > 0 || data.inbox_mrr > 0) && (
                <>
                  {data.ip_mrr > 0 && (
                    <tr className="border-t border-white/4">
                      <td className="px-5 py-2.5 text-white/40">Dedicated IPs</td>
                      <td className="px-5 py-2.5 text-right text-white/35 tabular-nums">—</td>
                      <td className="px-5 py-2.5 text-right text-white/35">₦78,400</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-purple-400 tabular-nums">{ngn(data.ip_mrr)}</td>
                      <td className="px-5 py-2.5" />
                    </tr>
                  )}
                  {data.inbox_mrr > 0 && (
                    <tr>
                      <td className="px-5 py-2.5 text-white/40">Inbox billing</td>
                      <td className="px-5 py-2.5 text-right text-white/35 tabular-nums">—</td>
                      <td className="px-5 py-2.5 text-right text-white/35">Per mailbox</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-cyan-400 tabular-nums">{ngn(data.inbox_mrr)}</td>
                      <td className="px-5 py-2.5" />
                    </tr>
                  )}
                  <tr className="bg-white/[0.02]">
                    <td className="px-5 py-3 font-bold text-white/60 text-[10px] uppercase tracking-wide">Total MRR</td>
                    <td className="px-5 py-3" />
                    <td className="px-5 py-3" />
                    <td className="px-5 py-3 text-right font-bold text-orange-400 tabular-nums text-sm">{ngn(data.mrr_ngn)}</td>
                    <td className="px-5 py-3" />
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Revenue Mix + Health */}
        <div className="space-y-5">

          {/* Revenue Mix This Month */}
          <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
            <h2 className="text-sm font-bold text-white/80 mb-1">Revenue Mix — This Month</h2>
            <p className="text-[11px] text-white/30 mb-4">By source · NGN collected</p>
            {mixTotal === 0 ? (
              <p className="text-xs text-white/20 py-4 text-center">No invoices yet this month</p>
            ) : (
              <div className="space-y-3">
                {mixEntries.map(([type, ngn_val]) => {
                  const pct = mixTotal > 0 ? Math.round((ngn_val / mixTotal) * 100) : 0;
                  const barColors: Record<string, string> = {
                    plan_subscription: "#3b82f6",
                    plan_renewal:      "#60a5fa",
                    credit_purchase:   "#f59e0b",
                    dedicated_ip:      "#a855f7",
                    dedicated_ip_renewal: "#c084fc",
                    inbox_billing:     "#06b6d4",
                    academy_enrollment:"#10b981",
                    domain_purchase:   "#64748b",
                  };
                  const color = barColors[type] ?? "#64748b";
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-white/50 capitalize">{type.replace(/_/g, " ")}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-white/70 tabular-nums">{ngnFull(ngn_val)}</span>
                          <span className="text-[10px] text-white/25 tabular-nums w-6 text-right">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Subscription Health */}
          <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
            <h2 className="text-sm font-bold text-white/80 mb-4">Subscriber Health</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Active",    value: data.active_paid,  color: "text-emerald-400", bg: "bg-emerald-500/8 border-emerald-500/15", dot: "bg-emerald-400" },
                { label: "Trialing",  value: data.trialing,     color: "text-amber-400",   bg: "bg-amber-500/8 border-amber-500/15",   dot: "bg-amber-400" },
                { label: "Past Due",  value: data.past_due,     color: "text-red-400",     bg: "bg-red-500/8 border-red-500/15",       dot: "bg-red-400" },
                { label: "Free",      value: data.free_count,   color: "text-slate-400",   bg: "bg-white/4 border-white/8",            dot: "bg-slate-500" },
              ].map(s => (
                <div key={s.label} className={`rounded-lg p-3.5 border ${s.bg}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wide">{s.label}</span>
                  </div>
                  <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Transactions ── */}
      <div className="bg-white/[0.03] border border-white/8 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/6 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white/80">Recent Transactions</h2>
            <p className="text-[11px] text-white/30 mt-0.5">Last 25 paid billing events</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/6">
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider">Workspace</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider">Type</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider hidden md:table-cell">Description</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider">Amount</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-white/30 uppercase tracking-wider">When</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-white/20">
                    No billing invoices recorded yet
                  </td>
                </tr>
              )}
              {data.recent_transactions.map(tx => (
                <tr key={tx.id} className="border-b border-white/4 hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3 font-medium text-white/70 truncate max-w-[140px]">{tx.workspace_name}</td>
                  <td className="px-5 py-3"><TypeBadge type={tx.type} /></td>
                  <td className="px-5 py-3 text-white/35 truncate max-w-[200px] hidden md:table-cell">{tx.description ?? "—"}</td>
                  <td className="px-5 py-3 text-right font-semibold text-white/80 tabular-nums">{ngnFull(tx.amount_ngn)}</td>
                  <td className="px-5 py-3 text-right text-white/30 whitespace-nowrap">{timeAgo(tx.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
