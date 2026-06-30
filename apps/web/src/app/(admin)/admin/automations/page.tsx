"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────

interface Flow {
  id:               string;
  name:             string;
  description:      string | null;
  trigger_event:    string;
  duplicate_policy: string;
  is_active:        boolean;
  version:          number;
  last_published_at: string | null;
  run_count:        number | null;
  last_run_at:      string | null;
  updated_at:       string;
}

interface Template {
  id:          string;
  name:        string;
  description: string | null;
  category:    string;
  preview_img: string | null;
  definition:  Record<string, unknown>;
  is_system:   boolean;
}

interface ExecutionStep {
  id:           string;
  node_id:      string;
  node_type:    string;
  status:       "completed" | "failed" | "skipped" | "running";
  started_at:   string | null;
  completed_at: string | null;
  skip_reason:  string | null;
  output:       Record<string, unknown> | null;
}

interface Execution {
  id:           string;
  status:       "running" | "completed" | "failed" | "cancelled" | "paused";
  started_at:   string | null;
  completed_at: string | null;
  contact_id:   string | null;
  chain_depth:  number | null;
  automation_execution_steps: ExecutionStep[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  "user.opted_in":                    "User opts in",
  "user.video_milestone":             "Video watch milestone",
  "user.challenge_enrolled":          "Challenge purchased",
  "user.day1_completed":              "Day 1 completed",
  "user.bundle_purchased":            "Bundle purchased",
  "user.bundle_renewed":              "Bundle renewed",
  "user.bundle_expired":              "Bundle expired",
  "challenge.daily_reminder":         "Daily challenge reminder",
  "challenge.day_missed":             "Challenge day missed",
  "billing.payment_failed":           "Billing payment failed",
  "academy.enrollment_created":       "Academy enrollment created",
  "academy.lesson_completed":         "Academy lesson completed",
  "academy.course_completed":         "Academy course completed",
  "academy.challenge_day_completed":  "Challenge day completed",
  "academy.streak_broken":            "Academy streak broken",
  "offers.purchase_created":          "Offer purchased (any price)",
  "offers.refund_issued":             "Offer refund issued",
  "offers.custom_grant_pending":      "Custom grant needs fulfillment",
  "crm.tag_added":                    "CRM tag added",
};

const DUP_LABELS: Record<string, string> = {
  deduplicate: "Skip dupes",
  parallel:    "Allow parallel",
  restart:     "Restart",
};

const CATEGORY_COLORS: Record<string, string> = {
  "Welcome":       "bg-violet-500/20 text-violet-300",
  "Billing":       "bg-red-500/20 text-red-300",
  "Academy":       "bg-indigo-500/20 text-indigo-300",
  "CRM":           "bg-slate-500/20 text-slate-300",
  "Lead Nurture":  "bg-orange-500/20 text-orange-300",
  "Re-engagement": "bg-amber-500/20 text-amber-300",
  "Conversion":    "bg-emerald-500/20 text-emerald-300",
};

const STATUS_COLORS: Record<string, string> = {
  running:   "text-blue-400",
  completed: "text-emerald-400",
  failed:    "text-red-400",
  cancelled: "text-slate-400",
  paused:    "text-amber-400",
};

const STEP_STATUS_ICON: Record<string, string> = {
  completed: "✓",
  failed:    "✗",
  skipped:   "⊘",
  running:   "●",
};

const STEP_STATUS_COLOR: Record<string, string> = {
  completed: "text-emerald-400",
  failed:    "text-red-400",
  skipped:   "text-slate-400",
  running:   "text-blue-400",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function fmtRunCount(n: number | null) {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Template modal ─────────────────────────────────────────────────────────

function TemplatesModal({
  onClose,
  onUse,
}: {
  onClose: () => void;
  onUse: (templateId: string, name: string) => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/automations?type=templates")
      .then(r => r.json())
      .then((d: { templates?: Template[] }) => { setTemplates(d.templates ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-[#1a1a1a] border border-white/10 rounded-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-base font-bold text-white">Start from a template</h2>
            <p className="text-xs text-white/40 mt-0.5">Pre-built automation flows ready to customise</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />)}
            </div>
          ) : templates.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-12">No system templates found.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {templates.map(tmpl => (
                <div
                  key={tmpl.id}
                  className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-4 hover:border-orange-500/30 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-white">{tmpl.name}</p>
                      {tmpl.category && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[tmpl.category] ?? "bg-white/10 text-white/40"}`}>
                          {tmpl.category}
                        </span>
                      )}
                    </div>
                    {tmpl.description && (
                      <p className="text-xs text-white/40 leading-relaxed">{tmpl.description}</p>
                    )}
                  </div>
                  <button
                    disabled={!!creating}
                    onClick={() => { setCreating(tmpl.id); onUse(tmpl.id, tmpl.name); }}
                    className={`flex-shrink-0 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
                      creating === tmpl.id
                        ? "bg-orange-500/20 text-orange-300 cursor-wait"
                        : "bg-orange-500 hover:bg-orange-400 text-white"
                    }`}
                  >
                    {creating === tmpl.id ? "Creating…" : "Use this template"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Execution step drawer ──────────────────────────────────────────────────

function ExecutionDrawer({
  execution,
  onClose,
}: {
  execution: Execution;
  onClose: () => void;
}) {
  const steps = execution.automation_execution_steps ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/50">
      <div className="w-full max-w-md bg-[#1a1a1a] border-l border-white/10 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <p className="text-sm font-bold text-white">Execution details</p>
            <p className="text-[11px] text-white/30 mt-0.5">{execution.id}</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white text-xl">×</button>
        </div>

        <div className="px-5 py-3 border-b border-white/10 flex items-center gap-4 text-xs text-white/50">
          <span>Status: <span className={`font-semibold ${STATUS_COLORS[execution.status] ?? "text-white"}`}>{execution.status}</span></span>
          <span>Started: {fmtDate(execution.started_at)}</span>
          {execution.completed_at && <span>Done: {fmtDate(execution.completed_at)}</span>}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {steps.length === 0 ? (
            <p className="text-white/30 text-xs text-center py-8">No steps recorded.</p>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-3 top-0 bottom-0 w-px bg-white/10" />
              <div className="space-y-4">
                {steps.map((step, i) => (
                  <div key={step.id ?? i} className="flex items-start gap-3 pl-1">
                    <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-bold flex-shrink-0 relative z-10 ${
                      step.status === "completed" ? "border-emerald-500/50 bg-emerald-500/10" :
                      step.status === "failed"    ? "border-red-500/50 bg-red-500/10" :
                      step.status === "skipped"   ? "border-slate-500/50 bg-slate-500/10" :
                                                    "border-blue-500/50 bg-blue-500/10"
                    } ${STEP_STATUS_COLOR[step.status]}`}>
                      {STEP_STATUS_ICON[step.status] ?? "•"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white">
                        {step.node_type ?? step.node_id}
                      </p>
                      {step.skip_reason && (
                        <p className="text-[10px] text-slate-400 mt-0.5">Skipped: {step.skip_reason}</p>
                      )}
                      <p className="text-[10px] text-white/30 mt-0.5">{fmtDate(step.started_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Executions tab ─────────────────────────────────────────────────────────

function ExecutionsTab({ flowId }: { flowId: string }) {
  const [executions,  setExecutions]  = useState<Execution[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState<"all" | "running" | "completed" | "failed" | "cancelled">("all");
  const [selected,    setSelected]    = useState<Execution | null>(null);

  useEffect(() => {
    fetch(`/api/admin/automations?type=executions&flow_id=${flowId}`)
      .then(r => r.json())
      .then((d: { executions?: Execution[] }) => { setExecutions(d.executions ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [flowId]);

  const FILTERS = ["all", "running", "completed", "failed", "cancelled"] as const;
  const filtered = filter === "all" ? executions : executions.filter(e => e.status === filter);

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-1 mb-4 p-1 bg-white/5 rounded-lg w-fit">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize ${
              filter === f ? "bg-white/20 text-white" : "text-white/30 hover:text-white/60"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-xl p-10 text-center">
          <p className="text-white/30 text-sm">No executions found.</p>
        </div>
      ) : (
        <div className="border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/3">
                <th className="px-4 py-2.5 text-left text-white/30 font-semibold">Contact</th>
                <th className="px-4 py-2.5 text-left text-white/30 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-left text-white/30 font-semibold">Started</th>
                <th className="px-4 py-2.5 text-left text-white/30 font-semibold">Completed</th>
                <th className="px-4 py-2.5 text-left text-white/30 font-semibold">Steps</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(exec => (
                <tr
                  key={exec.id}
                  onClick={() => setSelected(exec)}
                  className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5 text-white/50 font-mono">{exec.contact_id ? exec.contact_id.slice(0, 8) + "…" : "—"}</td>
                  <td className={`px-4 py-2.5 font-semibold ${STATUS_COLORS[exec.status] ?? "text-white"}`}>{exec.status}</td>
                  <td className="px-4 py-2.5 text-white/40">{fmtDate(exec.started_at)}</td>
                  <td className="px-4 py-2.5 text-white/40">{fmtDate(exec.completed_at)}</td>
                  <td className="px-4 py-2.5 text-white/40">{exec.automation_execution_steps?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <ExecutionDrawer execution={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const [flows,     setFlows]     = useState<Flow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);
  const [newName,   setNewName]   = useState("");
  const [newEvent,  setNewEvent]  = useState("user.opted_in");
  const [newDupe,   setNewDupe]   = useState<"deduplicate" | "parallel" | "restart">("deduplicate");
  const [showNew,   setShowNew]   = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [error,     setError]     = useState("");
  const [activeTab, setActiveTab] = useState<"flows" | "executions">("flows");
  const [execFlow,  setExecFlow]  = useState<Flow | null>(null);

  async function load() {
    const res = await fetch("/api/admin/automations");
    const d   = await res.json() as { flows?: Flow[] };
    setFlows(d.flows ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createFlow() {
    if (!newName.trim()) { setError("Flow name is required."); return; }
    setCreating(true);
    setError("");
    const res = await fetch("/api/admin/automations", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, trigger_event: newEvent, duplicate_policy: newDupe }),
    });
    const d = await res.json() as { id?: string; error?: string };
    setCreating(false);
    if (!res.ok) { setError(d.error ?? "Failed to create flow."); return; }
    window.location.href = `/admin/automations/builder?id=${d.id}`;
  }

  async function createFromTemplate(templateId: string, name: string) {
    const res = await fetch("/api/admin/automations", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ from_template_id: templateId, name }),
    });
    const d = await res.json() as { id?: string; error?: string };
    if (!res.ok) { setShowTemplates(false); setError(d.error ?? "Failed to create from template."); return; }
    window.location.href = `/admin/automations/builder?id=${d.id}`;
  }

  async function toggleActive(flow: Flow) {
    await fetch(`/api/admin/automations?id=${flow.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !flow.is_active }),
    });
    await load();
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="app-h1">Automations</h1>
          <p className="text-sm text-slate-400 dark:text-white/40 mt-0.5">
            Visual automation flows triggered by funnel events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplates(true)}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            From Template
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Flow
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-white/10">
        {(["flows", "executions"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab === "executions" && !execFlow && flows.length > 0) setExecFlow(flows[0]);
            }}
            className={`px-4 py-2 text-sm font-semibold capitalize transition-all border-b-2 -mb-px ${
              activeTab === tab
                ? "border-orange-500 text-orange-400"
                : "border-transparent text-white/30 hover:text-white/60"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Global error */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
          {error}
          <button onClick={() => setError("")} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* ── Flows tab ── */}
      {activeTab === "flows" && (
        <>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-200 dark:bg-white/10 rounded-xl animate-pulse" />)}
            </div>
          ) : flows.length === 0 ? (
            <div className="border border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-16 text-center">
              <p className="text-slate-400 dark:text-white/30 text-sm">No automation flows yet.</p>
              <button
                onClick={() => setShowNew(true)}
                className="mt-4 text-sm font-semibold text-orange-500 hover:text-orange-400"
              >
                Create your first flow →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {flows.map(flow => (
                <div
                  key={flow.id}
                  className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-5 py-4 flex items-center gap-4"
                >
                  {/* Active indicator */}
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      flow.is_active ? "bg-emerald-400" : "bg-slate-300 dark:bg-white/20"
                    }`}
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{flow.name}</p>
                      <span className="text-[10px] font-bold text-slate-400 dark:text-white/20 uppercase tracking-widest">
                        v{flow.version}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-400 dark:text-white/30">
                        {TRIGGER_LABELS[flow.trigger_event] ?? flow.trigger_event}
                      </span>
                      <span className="text-slate-200 dark:text-white/10">·</span>
                      <span className="text-xs text-slate-400 dark:text-white/30">
                        {DUP_LABELS[flow.duplicate_policy] ?? flow.duplicate_policy}
                      </span>
                      <span className="text-slate-200 dark:text-white/10">·</span>
                      <span className="text-xs text-slate-400 dark:text-white/30">
                        {fmtRunCount(flow.run_count)} runs
                      </span>
                      {flow.last_run_at && (
                        <>
                          <span className="text-slate-200 dark:text-white/10">·</span>
                          <span className="text-xs text-slate-400 dark:text-white/30">
                            Last run {fmtDate(flow.last_run_at)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => { setExecFlow(flow); setActiveTab("executions"); }}
                      className="text-xs font-semibold px-3 py-1.5 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/30 hover:text-white rounded-lg transition-colors"
                      title="View executions"
                    >
                      Executions
                    </button>
                    <button
                      onClick={() => toggleActive(flow)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                        flow.is_active
                          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
                          : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/40 hover:bg-slate-200 dark:hover:bg-white/20"
                      }`}
                    >
                      {flow.is_active ? "Active" : "Inactive"}
                    </button>
                    <Link
                      href={`/admin/automations/builder?id=${flow.id}`}
                      className="text-xs font-semibold px-3 py-1.5 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/50 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Executions tab ── */}
      {activeTab === "executions" && (
        <div>
          {/* Flow selector */}
          {flows.length > 0 && (
            <div className="mb-4 flex items-center gap-3">
              <label className="text-xs text-white/40 flex-shrink-0">Showing executions for:</label>
              <select
                value={execFlow?.id ?? ""}
                onChange={e => setExecFlow(flows.find(f => f.id === e.target.value) ?? null)}
                className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-orange-500"
              >
                {flows.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}
          {execFlow ? (
            <ExecutionsTab flowId={execFlow.id} />
          ) : (
            <p className="text-white/30 text-sm text-center py-12">Select a flow to view executions.</p>
          )}
        </div>
      )}

      {/* ── New flow modal ── */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-4">New Automation Flow</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-white/50 mb-1 block">Flow name</label>
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createFlow()}
                  placeholder="e.g. Welcome sequence"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-white/50 mb-1 block">Trigger event</label>
                <select
                  value={newEvent}
                  onChange={e => setNewEvent(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                >
                  {Object.entries(TRIGGER_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                  <option value="custom">Custom event</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-white/50 mb-1 block">
                  If contact re-triggers while already enrolled
                </label>
                <div className="flex gap-1 p-1 bg-slate-100 dark:bg-white/10 rounded-lg">
                  {(["deduplicate", "parallel", "restart"] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setNewDupe(v)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        newDupe === v
                          ? "bg-white dark:bg-white/20 text-slate-800 dark:text-white shadow-sm"
                          : "text-slate-500 dark:text-white/40"
                      }`}
                    >
                      {v === "deduplicate" ? "Skip" : v === "parallel" ? "Allow parallel" : "Restart"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 dark:text-white/30 mt-1">
                  {newDupe === "deduplicate" && "Skip — don't start a new run if already enrolled."}
                  {newDupe === "parallel"    && "Allow parallel — run multiple instances at once."}
                  {newDupe === "restart"     && "Restart — cancel current run, start fresh."}
                </p>
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowNew(false); setError(""); }}
                  className="flex-1 py-2 text-sm text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/60 border border-slate-200 dark:border-white/10 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createFlow}
                  disabled={creating}
                  className="flex-1 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white rounded-lg transition-colors"
                >
                  {creating ? "Creating…" : "Create & Open Builder"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Templates modal ── */}
      {showTemplates && (
        <TemplatesModal
          onClose={() => setShowTemplates(false)}
          onUse={createFromTemplate}
        />
      )}
    </div>
  );
}
