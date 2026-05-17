"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
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
  workspace_id:   string | null;
}

interface TopCustomer {
  id:          string;
  name:        string;
  plan_id:     string;
  plan_status: string;
  mrr_ngn:     number;
  created_at:  string | null;
}

interface WsItem {
  id:           string;
  name:         string;
  slug:         string;
  plan_id:      string | null;
  plan_status:  string | null;
  trial_ends_at: string | null;
  created_at:   string | null;
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
  beta_count:            number;
  beta_mrr_ngn:          number;
  at_risk_mrr_ngn:       number;
  trial_pipeline_mrr_ngn: number;
  new_subs_count:        number;
  churn_count:           number;
  plan_breakdown:        PlanRow[];
  type_breakdown:        Record<string, number>;
  chart:                 ChartPoint[];
  top_customers:         TopCustomer[];
  recent_transactions:   Transaction[];
  generated_at:          string;
}

type DrillType = "plan" | "status" | "beta" | "free";

interface DrawerState {
  open:        boolean;
  title:       string;
  subtitle?:   string;
  drillType?:  DrillType;
  planId?:     string;
  status?:     string;
  transaction?: Transaction;
}

const CLOSED: DrawerState = { open: false, title: "" };

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
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "2-digit" });
}

const TYPE_COLORS: Record<string, string> = {
  plan_subscription:    "bg-blue-500/15 text-blue-400 border-blue-500/20",
  plan_renewal:         "bg-blue-500/10 text-blue-300 border-blue-500/15",
  credit_purchase:      "bg-amber-500/15 text-amber-400 border-amber-500/20",
  dedicated_ip:         "bg-purple-500/15 text-purple-400 border-purple-500/20",
  dedicated_ip_renewal: "bg-purple-500/10 text-purple-300 border-purple-500/15",
  inbox_billing:        "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  academy_enrollment:   "bg-green-500/15 text-green-400 border-green-500/20",
  domain_purchase:      "bg-slate-500/15 text-slate-400 border-slate-500/20",
};

const STATUS_STYLES: Record<string, string> = {
  active:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  past_due: "bg-red-500/10 text-red-400 border-red-500/20",
  trialing: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  canceled: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

function TypeBadge({ type }: { type: string }) {
  const cls = TYPE_COLORS[type] ?? "bg-white/10 text-white/40 border-white/10";
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${cls}`}>
      {type.replace(/_/g, " ")}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const cls = STATUS_STYLES[status ?? ""] ?? "bg-white/10 text-white/35 border-white/10";
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${cls}`}>
      {status ?? "—"}
    </span>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, subColor = "text-white/30", accent = false, onClick,
}: {
  label: string; value: string; sub?: string; subColor?: string; accent?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl p-5 border flex flex-col gap-1 transition-all ${
        accent
          ? "bg-orange-500/8 border-orange-500/20"
          : "bg-white/[0.03] border-white/8"
      } ${onClick ? "cursor-pointer hover:bg-white/[0.06] hover:border-white/15 active:scale-[0.99]" : ""}`}
    >
      <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accent ? "text-orange-300" : "text-white/90"}`}>{value}</p>
      {sub && <p className={`text-[11px] font-medium ${subColor}`}>{sub}</p>}
      {onClick && (
        <p className="text-[9px] text-white/20 mt-1 uppercase tracking-wide">Click to drill down ›</p>
      )}
    </div>
  );
}

// ── Chart Tooltip ─────────────────────────────────────────────────────────────

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

// ── Workspace List (drawer content) ──────────────────────────────────────────

function WorkspaceList({ workspaces }: { workspaces: WsItem[] }) {
  if (workspaces.length === 0) {
    return <p className="text-sm text-white/25 text-center py-16">No workspaces</p>;
  }
  return (
    <div className="divide-y divide-white/5">
      {workspaces.map(w => (
        <a
          key={w.id}
          href={`/admin/workspaces/${w.id}`}
          className="flex items-start justify-between px-5 py-3.5 hover:bg-white/[0.03] transition-colors group"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white/80 group-hover:text-white truncate">{w.name}</p>
            <p className="text-[10px] text-white/30 mt-0.5">{w.slug}</p>
            {w.trial_ends_at && (
              <p className="text-[10px] text-amber-400/70 mt-0.5">
                Beta expires {fmtDate(w.trial_ends_at)}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 ml-3 flex-shrink-0">
            <StatusBadge status={w.plan_status} />
            <span className="text-[9px] text-white/25">{fmtDate(w.created_at)}</span>
          </div>
        </a>
      ))}
    </div>
  );
}

// ── Transaction Detail (drawer content) ──────────────────────────────────────

function TransactionDetail({ tx }: { tx: Transaction }) {
  return (
    <div className="px-5 py-5 space-y-5">
      {/* Amount */}
      <div className="rounded-xl bg-white/[0.04] border border-white/8 p-5 text-center">
        <p className="text-3xl font-bold text-white/90 tabular-nums">{ngnFull(tx.amount_ngn)}</p>
        <p className="text-[11px] text-white/35 mt-1">{timeAgo(tx.created_at)}</p>
      </div>

      {/* Details grid */}
      <div className="space-y-3">
        {[
          { label: "Type",        value: <TypeBadge type={tx.type} /> },
          { label: "Workspace",   value: tx.workspace_id
              ? <a href={`/admin/workspaces/${tx.workspace_id}`} className="text-orange-400 hover:text-orange-300 underline underline-offset-2">{tx.workspace_name}</a>
              : <span className="text-white/50">{tx.workspace_name}</span>
          },
          { label: "Description", value: <span className="text-white/60">{tx.description ?? "—"}</span> },
          { label: "Date",        value: <span className="text-white/60">{new Date(tx.created_at).toLocaleString("en-NG")}</span> },
          { label: "Invoice ID",  value: <span className="font-mono text-[10px] text-white/35 break-all">{tx.id}</span> },
        ].map(row => (
          <div key={row.label} className="flex items-start justify-between gap-4">
            <span className="text-[11px] font-semibold text-white/30 uppercase tracking-wide flex-shrink-0">{row.label}</span>
            <div className="text-xs text-right">{row.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────

function Drawer({ state, onClose }: { state: DrawerState; onClose: () => void }) {
  const [workspaces, setWorkspaces] = useState<WsItem[]>([]);
  const [loading,    setLoading]    = useState(false);
  const cacheRef = useRef<Record<string, WsItem[]>>({});

  useEffect(() => {
    if (!state.open || state.transaction) return;
    const key = `${state.drillType}:${state.planId ?? ""}:${state.status ?? ""}`;
    if (cacheRef.current[key]) { setWorkspaces(cacheRef.current[key]); return; }

    const params = new URLSearchParams({ type: state.drillType ?? "" });
    if (state.planId) params.set("plan_id", state.planId);
    if (state.status) params.set("status", state.status);

    setLoading(true);
    setWorkspaces([]);
    fetch(`/api/admin/financials/drill?${params}`)
      .then(r => r.json())
      .then(d => {
        const list = (d.workspaces ?? []) as WsItem[];
        cacheRef.current[key] = list;
        setWorkspaces(list);
      })
      .finally(() => setLoading(false));
  }, [state.open, state.drillType, state.planId, state.status, state.transaction]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!state.open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#060d1a] border-l border-white/10 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/8 flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-white/90">{state.title}</h3>
            {state.subtitle && <p className="text-[11px] text-white/35 mt-0.5">{state.subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/70 transition-colors ml-4 flex-shrink-0 mt-0.5"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {state.transaction ? (
            <TransactionDetail tx={state.transaction} />
          ) : loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-5 h-5 border-2 border-white/20 border-t-orange-400 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {!loading && workspaces.length > 0 && (
                <p className="text-[10px] text-white/25 px-5 py-2.5 border-b border-white/5">
                  {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""}
                </p>
              )}
              <WorkspaceList workspaces={workspaces} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FinancialsPage() {
  const [data,    setData]    = useState<FinancialsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [drawer,  setDrawer]  = useState<DrawerState>(CLOSED);

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

  const openDrill = useCallback((title: string, subtitle: string, drillType: DrillType, planId?: string, status?: string) => {
    setDrawer({ open: true, title, subtitle, drillType, planId, status });
  }, []);

  const openTx = useCallback((tx: Transaction) => {
    setDrawer({ open: true, title: "Transaction Detail", subtitle: tx.workspace_name, transaction: tx });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-white/20 border-t-orange-400 rounded-full animate-spin" />
    </div>
  );

  if (error) return <div className="p-8 text-red-400 text-sm">{error}</div>;
  if (!data)  return null;

  const totalMrrParts = [
    { label: "Plans",         value: data.plans_mrr, color: "#3b82f6" },
    { label: "Dedicated IPs", value: data.ip_mrr,    color: "#a855f7" },
    { label: "Inbox billing", value: data.inbox_mrr, color: "#06b6d4" },
  ].filter(p => p.value > 0);

  const momArrow = data.mom_delta_pct !== null ? (data.mom_delta_pct >= 0 ? "▲" : "▼") : null;
  const momColor = data.mom_delta_pct !== null ? (data.mom_delta_pct >= 0 ? "text-emerald-400" : "text-red-400") : "text-white/30";

  const mixEntries = Object.entries(data.type_breakdown).sort((a, b) => b[1] - a[1]);
  const mixTotal   = mixEntries.reduce((s, [, v]) => s + v, 0);

  const barColors: Record<string, string> = {
    plan_subscription: "#3b82f6", plan_renewal: "#60a5fa",
    credit_purchase: "#f59e0b", dedicated_ip: "#a855f7",
    dedicated_ip_renewal: "#c084fc", inbox_billing: "#06b6d4",
    academy_enrollment: "#10b981", domain_purchase: "#64748b",
  };

  return (
    <>
      <Drawer state={drawer} onClose={() => setDrawer(CLOSED)} />

      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white/90">Financials</h1>
            <p className="text-xs text-white/30 mt-0.5">Last updated {timeAgo(data.generated_at)}</p>
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
          <KpiCard label="Annual Run Rate" value={ngn(data.arr_ngn)} sub="MRR × 12" />
          <KpiCard
            label="Revenue This Month"
            value={ngn(data.this_month_revenue_ngn)}
            sub={momArrow && data.mom_delta_pct !== null
              ? `${momArrow} ${Math.abs(data.mom_delta_pct)}% vs last month`
              : "Cash collected"}
            subColor={momColor}
          />
          <KpiCard label="All-Time Revenue" value={ngn(data.all_time_revenue_ngn)} sub="From billing invoices" />
        </div>

        {/* ── Secondary KPIs ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Active Paying"
            value={data.active_paid.toLocaleString()}
            sub={`${data.past_due} past due · ${data.trialing} trialing`}
            subColor={data.past_due > 0 ? "text-red-400/70" : "text-white/30"}
            onClick={() => openDrill("Active Paying Workspaces", `${data.active_paid} workspaces`, "status", undefined, "active")}
          />
          <KpiCard label="ARPU" value={ngn(data.arpu_ngn)} sub="Avg revenue per paying user" />
          <KpiCard
            label="At-Risk MRR"
            value={ngn(data.at_risk_mrr_ngn)}
            sub={`${data.past_due} past-due accounts`}
            subColor={data.at_risk_mrr_ngn > 0 ? "text-red-400/70" : "text-emerald-400/70"}
            onClick={data.past_due > 0 ? () => openDrill("Past Due Workspaces", `${data.past_due} accounts at risk`, "status", undefined, "past_due") : undefined}
          />
          <KpiCard
            label="Trial Pipeline"
            value={ngn(data.trial_pipeline_mrr_ngn)}
            sub={`${data.trialing} users in trial`}
            subColor="text-amber-400/70"
            onClick={data.trialing > 0 ? () => openDrill("Trialing Workspaces", `${data.trialing} workspaces`, "status", undefined, "trialing") : undefined}
          />
        </div>

        {/* ── This Month + New / Churn / Beta ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="New Subscriptions" value={String(data.new_subs_count)} sub="This month" />
          <KpiCard label="Churned" value={String(data.churn_count)} sub="This month" subColor={data.churn_count > 0 ? "text-red-400/70" : "text-white/30"} />
          <KpiCard
            label="Free Users"
            value={data.free_count.toLocaleString()}
            sub="Conversion opportunity"
            onClick={() => openDrill("Free Workspaces", `${data.free_count} workspaces on free plan`, "free")}
          />
          <KpiCard label="Last Month Revenue" value={ngn(data.last_month_revenue_ngn)} sub="Collected" />
        </div>

        {/* ── Beta Programme ── */}
        {data.beta_count > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <h2 className="text-sm font-bold text-amber-300/90">Beta Programme</h2>
                </div>
                <p className="text-[11px] text-white/40 mb-3">
                  These workspaces are in the beta programme. They are excluded from commercial MRR.
                </p>
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-2xl font-bold text-amber-300 tabular-nums">{data.beta_count}</p>
                    <p className="text-[10px] text-white/30 uppercase tracking-wide mt-0.5">Workspaces</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-300/70 tabular-nums">{ngn(data.beta_mrr_ngn)}</p>
                    <p className="text-[10px] text-white/30 uppercase tracking-wide mt-0.5">Pipeline MRR</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => openDrill("Beta Programme Workspaces", `${data.beta_count} workspaces — excluded from MRR`, "beta")}
                className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border border-amber-500/25 text-amber-400/80 hover:bg-amber-500/10 hover:text-amber-300 transition-colors"
              >
                View all ›
              </button>
            </div>
          </div>
        )}

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

        {/* ── MRR Trend ── */}
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
              <p className="text-[11px] text-white/30 mt-0.5">Active commercial workspaces · click row to drill down</p>
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
                    <tr
                      key={p.plan_id}
                      onClick={() => p.count > 0 && openDrill(
                        `${p.name} Workspaces`,
                        `${p.count} active workspaces · ${ngn(p.mrr_ngn)}/mo`,
                        "plan",
                        p.plan_id,
                      )}
                      className={`border-b border-white/4 transition-colors ${
                        p.count > 0
                          ? "hover:bg-white/[0.03] cursor-pointer"
                          : "opacity-40"
                      }`}
                    >
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
                <tr className="bg-white/[0.02]">
                  <td className="px-5 py-3 font-bold text-white/60 text-[10px] uppercase tracking-wide">Total Plans</td>
                  <td className="px-5 py-3 text-right font-bold text-white/70 tabular-nums">{data.active_paid}</td>
                  <td className="px-5 py-3" />
                  <td className="px-5 py-3 text-right font-bold text-orange-300 tabular-nums">{ngn(data.plans_mrr)}</td>
                  <td className="px-5 py-3" />
                </tr>
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
                    const pct   = mixTotal > 0 ? Math.round((ngn_val / mixTotal) * 100) : 0;
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

            {/* Subscriber Health */}
            <div className="bg-white/[0.03] border border-white/8 rounded-xl p-5">
              <h2 className="text-sm font-bold text-white/80 mb-4">Subscriber Health</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Active",   value: data.active_paid, color: "text-emerald-400", bg: "bg-emerald-500/8 border-emerald-500/15", dot: "bg-emerald-400", type: "status" as const, status: "active" },
                  { label: "Trialing", value: data.trialing,    color: "text-amber-400",   bg: "bg-amber-500/8 border-amber-500/15",   dot: "bg-amber-400",   type: "status" as const, status: "trialing" },
                  { label: "Past Due", value: data.past_due,    color: "text-red-400",     bg: "bg-red-500/8 border-red-500/15",       dot: "bg-red-400",     type: "status" as const, status: "past_due" },
                  { label: "Free",     value: data.free_count,  color: "text-slate-400",   bg: "bg-white/4 border-white/8",            dot: "bg-slate-500",   type: "free" as const,   status: undefined },
                ].map(s => (
                  <div
                    key={s.label}
                    onClick={() => s.value > 0 && openDrill(
                      `${s.label} Workspaces`,
                      `${s.value} workspaces`,
                      s.type,
                      undefined,
                      s.status,
                    )}
                    className={`rounded-lg p-3.5 border transition-all ${s.bg} ${
                      s.value > 0 ? "cursor-pointer hover:opacity-80 active:scale-[0.98]" : "opacity-50"
                    }`}
                  >
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

        {/* ── Top Customers ── */}
        {data.top_customers.length > 0 && (
          <div className="bg-white/[0.03] border border-white/8 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/6">
              <h2 className="text-sm font-bold text-white/80">Top Customers</h2>
              <p className="text-[11px] text-white/30 mt-0.5">Commercial paying · ranked by plan MRR</p>
            </div>
            <div className="divide-y divide-white/4">
              {data.top_customers.map((c, i) => (
                <a
                  key={c.id}
                  href={`/admin/workspaces/${c.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.03] transition-colors group"
                >
                  <span className="text-sm font-bold text-white/20 tabular-nums w-5 text-center flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/75 group-hover:text-white truncate">{c.name}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">Since {fmtDate(c.created_at)}</p>
                  </div>
                  <StatusBadge status={c.plan_status} />
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-white/80 tabular-nums">{ngn(c.mrr_ngn)}</p>
                    <p className="text-[9px] text-white/25 uppercase tracking-wide">MRR</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── Recent Transactions ── */}
        <div className="bg-white/[0.03] border border-white/8 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/6">
            <h2 className="text-sm font-bold text-white/80">Recent Transactions</h2>
            <p className="text-[11px] text-white/30 mt-0.5">Last 25 paid billing events · click row for details</p>
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
                  <tr
                    key={tx.id}
                    onClick={() => openTx(tx)}
                    className="border-b border-white/4 hover:bg-white/[0.03] cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 max-w-[140px]">
                      {tx.workspace_id ? (
                        <span
                          onClick={e => { e.stopPropagation(); window.location.href = `/admin/workspaces/${tx.workspace_id}`; }}
                          className="font-medium text-white/70 hover:text-orange-400 hover:underline cursor-pointer truncate block"
                        >
                          {tx.workspace_name}
                        </span>
                      ) : (
                        <span className="font-medium text-white/70 truncate block">{tx.workspace_name}</span>
                      )}
                    </td>
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
    </>
  );
}
