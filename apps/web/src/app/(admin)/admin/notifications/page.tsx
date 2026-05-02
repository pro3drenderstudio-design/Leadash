"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Notification {
  id:          string;
  created_at:  string;
  type:        string;
  severity:    string;
  title:       string;
  body:        string | null;
  workspace_id:string | null;
  dedup_key:   string;
  resolved_at: string | null;
  read_at:     string | null;
  email_sent_at:string | null;
}

interface NotifResponse {
  notifications: Notification[];
  total:         number;
  unread:        number;
  page:          number;
  limit:         number;
}

interface Settings {
  email_recipients:  string[];
  email_on_warning:  boolean;
  email_on_critical: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end:   string | null;
  slack_webhook_url: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function notifLink(n: { type: string; workspace_id: string | null }): string | null {
  if (n.workspace_id && ["inbox_limit", "trial", "warmup"].includes(n.type))
    return `/admin/workspaces/${n.workspace_id}`;
  if (n.type === "queue")  return "/admin/system";
  if (n.type === "infra" || n.type === "postal") return "/admin/infrastructure";
  return null;
}

function SevBadge({ severity }: { severity: string }) {
  const cls = severity === "critical"
    ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
    : severity === "warning"
    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
    : "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300";
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${cls}`}>
      {severity}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const TABS = ["active", "resolved", "all"] as const;
type Tab   = typeof TABS[number];
const PAGE_SIZE = 25;

export default function NotificationsPage() {
  const router = useRouter();
  const [tab,      setTab]      = useState<Tab>("active");
  const [data,     setData]     = useState<NotifResponse | null>(null);
  const [page,     setPage]     = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [emailInput, setEmailInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: tab, page: String(page), limit: String(PAGE_SIZE) });
      const res = await fetch(`/api/admin/notifications?${params}`);
      if (res.ok) setData(await res.json() as NotifResponse);
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setPage(0); }, [tab]);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/admin/notification-settings");
    if (res.ok) setSettings(await res.json() as Settings);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  async function patchAction(ids: string[], action: string) {
    setActing(action + ids.join(","));
    try {
      await fetch("/api/admin/notifications", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ids, action }),
      });
      await load();
    } finally {
      setActing(null);
    }
  }

  async function bulkAction(action: string) {
    setActing(action);
    try {
      await fetch("/api/admin/notifications", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action }),
      });
      await load();
    } finally {
      setActing(null);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSettingsSaving(true);
    try {
      await fetch("/api/admin/notification-settings", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(settings),
      });
    } finally {
      setSettingsSaving(false);
    }
  }

  function addEmail() {
    const e = emailInput.trim().toLowerCase();
    if (!e || !e.includes("@")) return;
    if (settings?.email_recipients.includes(e)) return;
    setSettings(s => s ? { ...s, email_recipients: [...s.email_recipients, e] } : s);
    setEmailInput("");
  }

  function removeEmail(e: string) {
    setSettings(s => s ? { ...s, email_recipients: s.email_recipients.filter(r => r !== e) } : s);
  }

  const notifs    = data?.notifications ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white/90">Notifications</h1>
          {(data?.unread ?? 0) > 0 && (
            <p className="text-sm text-red-500 font-medium mt-0.5">{data!.unread} unread</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {tab === "active" && notifs.length > 0 && (
            <>
              <button
                onClick={() => bulkAction("mark_all_read")}
                disabled={acting !== null}
                className="text-xs border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70 transition-colors disabled:opacity-50"
              >
                Mark all read
              </button>
              <button
                onClick={() => bulkAction("resolve_all")}
                disabled={acting !== null}
                className="text-xs border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70 transition-colors disabled:opacity-50"
              >
                Resolve all
              </button>
            </>
          )}
          <button
            onClick={() => setShowSettings(v => !v)}
            className={`text-xs border rounded-lg px-2.5 py-1.5 transition-colors ${showSettings ? "border-red-300 text-red-600 dark:border-red-500/40 dark:text-red-400" : "border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70"}`}
          >
            Alert settings
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && settings && (
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5 space-y-5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-white/80">Alert Settings</h2>

          {/* Email recipients */}
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-white/50 mb-2">Email recipients</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {settings.email_recipients.map(e => (
                <span key={e} className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/60 px-2 py-1 rounded-lg">
                  {e}
                  <button onClick={() => removeEmail(e)} className="text-slate-400 hover:text-red-500 transition-colors ml-0.5">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addEmail()}
                placeholder="Add email address"
                className="flex-1 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-slate-800 dark:text-white/80 placeholder:text-slate-300 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              />
              <button onClick={addEmail} className="text-xs bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/60 px-3 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-white/20 transition-colors">
                Add
              </button>
            </div>
          </div>

          {/* Severity thresholds */}
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-white/50 mb-2">Send emails for</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-white/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.email_on_critical}
                  onChange={e => setSettings(s => s ? { ...s, email_on_critical: e.target.checked } : s)}
                  className="rounded border-slate-300 dark:border-white/20 text-red-500"
                />
                Critical alerts
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-white/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.email_on_warning}
                  onChange={e => setSettings(s => s ? { ...s, email_on_warning: e.target.checked } : s)}
                  className="rounded border-slate-300 dark:border-white/20 text-red-500"
                />
                Warning alerts
              </label>
            </div>
          </div>

          {/* Quiet hours */}
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-white/50 mb-2">Quiet hours (no emails)</p>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={settings.quiet_hours_start ?? ""}
                onChange={e => setSettings(s => s ? { ...s, quiet_hours_start: e.target.value || null } : s)}
                className="text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-slate-800 dark:text-white/80 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              />
              <span className="text-slate-400 dark:text-white/30 text-sm">to</span>
              <input
                type="time"
                value={settings.quiet_hours_end ?? ""}
                onChange={e => setSettings(s => s ? { ...s, quiet_hours_end: e.target.value || null } : s)}
                className="text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-slate-800 dark:text-white/80 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              />
            </div>
          </div>

          <button
            onClick={saveSettings}
            disabled={settingsSaving}
            className="text-sm bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {settingsSaving ? "Saving..." : "Save settings"}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-white/10">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-red-500 text-red-600 dark:text-red-400"
                : "border-transparent text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60"
            }`}
          >
            {t}
            {t === "active" && (data?.unread ?? 0) > 0 && (
              <span className="ml-1.5 text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full">{data!.unread}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifs.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-400 dark:text-white/30 text-sm">No notifications</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifs.map(n => {
            const link = notifLink(n);
            return (
            <div
              key={n.id}
              onClick={() => link && router.push(link)}
              className={`flex items-start gap-3 p-4 rounded-xl border text-sm transition-colors ${
                !n.read_at && !n.resolved_at ? "bg-white dark:bg-white/5" : "bg-slate-50/50 dark:bg-transparent"
              } border-slate-200 dark:border-white/10 ${link ? "cursor-pointer hover:border-slate-300 dark:hover:border-white/20" : ""}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <SevBadge severity={n.severity} />
                  <span className="text-xs text-slate-400 dark:text-white/30 capitalize">{n.type.replace(/_/g, " ")}</span>
                  {!n.read_at && !n.resolved_at && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  )}
                  {n.email_sent_at && (
                    <span className="text-[9px] font-medium text-slate-300 dark:text-white/20 uppercase tracking-wide">emailed</span>
                  )}
                </div>
                <p className={`font-medium ${!n.read_at && !n.resolved_at ? "text-slate-800 dark:text-white/90" : "text-slate-500 dark:text-white/40"}`}>
                  {n.title}
                </p>
                {n.body && <p className="text-slate-400 dark:text-white/30 text-xs mt-0.5 line-clamp-2">{n.body}</p>}
                <p className="text-slate-300 dark:text-white/20 text-xs mt-1.5">{timeAgo(n.created_at)}{n.resolved_at ? ` · resolved ${timeAgo(n.resolved_at)}` : ""}</p>
              </div>
              {!n.resolved_at && (
                <div className="flex gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  {!n.read_at && (
                    <button
                      onClick={() => patchAction([n.id], "mark_read")}
                      disabled={acting !== null}
                      className="text-xs border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60 transition-colors disabled:opacity-50"
                    >
                      Read
                    </button>
                  )}
                  <button
                    onClick={() => patchAction([n.id], "resolve")}
                    disabled={acting !== null}
                    className="text-xs border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60 transition-colors disabled:opacity-50"
                  >
                    Resolve
                  </button>
                </div>
              )}
            </div>
          );})}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-slate-400 dark:text-white/30">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0)} of {data?.total}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-xs border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60 disabled:opacity-40 transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="text-xs border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
