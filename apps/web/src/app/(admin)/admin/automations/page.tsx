"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Flow {
  id:               string;
  name:             string;
  description:      string | null;
  trigger_event:    string;
  duplicate_policy: string;
  is_active:        boolean;
  version:          number;
  last_published_at: string | null;
  updated_at:        string;
}

const TRIGGER_LABELS: Record<string, string> = {
  "user.opted_in":         "User opts in (/join)",
  "user.video_milestone":  "Video watch milestone",
  "user.challenge_enrolled": "Challenge purchased",
  "user.day1_completed":   "Day 1 completed",
  "user.bundle_purchased": "Bundle purchased",
  "user.bundle_renewed":   "Bundle renewed",
  "user.bundle_expired":   "Bundle expired",
};

export default function AutomationsPage() {
  const [flows,   setFlows]   = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState("");
  const [newEvent, setNewEvent] = useState("user.opted_in");
  const [newDupe,  setNewDupe]  = useState<"deduplicate" | "parallel" | "restart">("deduplicate");
  const [showNew,  setShowNew]  = useState(false);
  const [error,    setError]    = useState("");

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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Automations</h1>
          <p className="text-sm text-slate-400 dark:text-white/40 mt-0.5">
            Visual automation flows triggered by funnel events.
          </p>
        </div>
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

      {/* New flow modal */}
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
                  If user triggers while already in this flow
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
                      {v === "deduplicate" ? "Skip" : v === "parallel" ? "Run both" : "Restart"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 dark:text-white/30 mt-1">
                  {newDupe === "deduplicate" && "Block — skip if user is already in this flow."}
                  {newDupe === "parallel"    && "Parallel — both executions run simultaneously."}
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

      {/* Flows list */}
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
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-slate-400 dark:text-white/30">
                    {TRIGGER_LABELS[flow.trigger_event] ?? flow.trigger_event}
                  </span>
                  <span className="text-slate-200 dark:text-white/10">·</span>
                  <span className="text-xs text-slate-400 dark:text-white/30">
                    {flow.duplicate_policy}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 flex-shrink-0">
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
    </div>
  );
}
