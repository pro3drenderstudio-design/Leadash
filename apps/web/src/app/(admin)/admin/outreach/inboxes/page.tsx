"use client";
import { useEffect, useState, useCallback } from "react";

interface AdminInbox {
  id: string;
  email_address: string;
  label: string | null;
  provider: string | null;
  status: string;
  last_error: string | null;
  smtp_host: string | null;
  smtp_user: string | null;
  warmup_enabled: boolean | null;
  warmup_current_daily: number | null;
  warmup_target_daily: number | null;
  warmup_ends_at: string | null;
  daily_send_limit: number | null;
  domain_id: string | null;
  workspace_id: string;
  workspace_name: string;
  created_at: string;
}

interface DetailPanel {
  inbox: AdminInbox;
  warmup_sends_7d: number;
  warmup_replies_7d: number;
}

const STATUS_COLORS: Record<string, string> = {
  active:          "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  disabled:        "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/40",
  payment_failed:  "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  suspended:       "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  paused:          "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  error:           "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

const PROVIDER_LABELS: Record<string, string> = {
  leadash_smtp: "Leadash SMTP",
  gmail:        "Gmail",
  outlook:      "Outlook",
  smtp:         "Custom SMTP",
};

export default function AdminOutreachInboxesPage() {
  const [inboxes, setInboxes]   = useState<AdminInbox[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(0);
  const [loading, setLoading]   = useState(true);

  // Filters
  const [search, setSearch]     = useState("");
  const [status, setStatus]     = useState("");
  const [hasError, setHasError] = useState("");
  const [warmup, setWarmup]     = useState("");

  // Detail panel
  const [detail, setDetail]         = useState<DetailPanel | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Actions
  const [actionWorking, setActionWorking] = useState<string | null>(null);
  const [actionMsg, setActionMsg]         = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [smtpHostInput, setSmtpHostInput] = useState("");

  const PAGE = 50;

  const fetchInboxes = useCallback(() => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (search)   sp.set("search", search);
    if (status)   sp.set("status", status);
    if (hasError) sp.set("has_error", hasError);
    if (warmup)   sp.set("warmup", warmup);
    sp.set("page", String(page));

    fetch(`/api/admin/outreach/inboxes?${sp}`)
      .then(r => r.json())
      .then(d => {
        setInboxes(d.inboxes ?? []);
        setTotal(d.total ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [search, status, hasError, warmup, page]);

  useEffect(() => { fetchInboxes(); }, [fetchInboxes]);

  async function openDetail(inbox: AdminInbox) {
    if (detail?.inbox.id === inbox.id) { setDetail(null); return; }
    setDetailLoading(true);
    setActionMsg(null);
    setSmtpHostInput(inbox.smtp_host ?? "");
    const d = await fetch(`/api/admin/outreach/inboxes/${inbox.id}`).then(r => r.json());
    setDetail(d.inbox ? d : null);
    setDetailLoading(false);
  }

  async function doAction(action: string, extra?: Record<string, string>) {
    if (!detail) return;
    setActionWorking(action);
    setActionMsg(null);
    const res  = await fetch(`/api/admin/outreach/inboxes/${detail.inbox.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    setActionWorking(null);
    if (data.ok) {
      setActionMsg({ type: "ok", text: `${action.replace(/_/g, " ")} applied.` });
      fetchInboxes();
      // Refresh detail
      const refreshed = await fetch(`/api/admin/outreach/inboxes/${detail.inbox.id}`).then(r => r.json());
      if (refreshed.inbox) setDetail(refreshed);
    } else {
      setActionMsg({ type: "err", text: data.error ?? "Failed" });
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Outreach Inboxes</h1>
        <p className="text-sm text-slate-400 dark:text-white/40 mt-0.5">All user inboxes across every workspace — configurations, errors, warmup state.</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search email…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 w-56"
        />
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(0); }}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
          <option value="paused">Paused</option>
          <option value="payment_failed">Payment failed</option>
          <option value="suspended">Suspended</option>
        </select>
        <select
          value={hasError}
          onChange={e => { setHasError(e.target.value); setPage(0); }}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        >
          <option value="">Any error state</option>
          <option value="true">Has error</option>
          <option value="false">No error</option>
        </select>
        <select
          value={warmup}
          onChange={e => { setWarmup(e.target.value); setPage(0); }}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        >
          <option value="">Any warmup</option>
          <option value="true">Warmup on</option>
          <option value="false">Warmup off</option>
        </select>
        <span className="self-center text-xs text-slate-400 dark:text-white/30">{total.toLocaleString()} total</span>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3 animate-pulse">
            {[...Array(8)].map((_, i) => <div key={i} className="h-10 bg-slate-100 dark:bg-white/5 rounded" />)}
          </div>
        ) : inboxes.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400 dark:text-white/30">No inboxes match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/10">
                  {["Email", "Workspace", "Provider", "Status", "Warmup", "Error", "Created"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {inboxes.map(inbox => (
                  <>
                    <tr
                      key={inbox.id}
                      onClick={() => openDetail(inbox)}
                      className={`cursor-pointer transition-colors ${detail?.inbox.id === inbox.id ? "bg-orange-50 dark:bg-orange-500/5" : "hover:bg-slate-50 dark:hover:bg-white/3"}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs text-slate-800 dark:text-white/80 truncate max-w-[200px]">{inbox.email_address}</p>
                        {inbox.label && <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5">{inbox.label}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-white/60 max-w-[140px] truncate">{inbox.workspace_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-white/40">{PROVIDER_LABELS[inbox.provider ?? ""] ?? inbox.provider ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${STATUS_COLORS[inbox.status] ?? STATUS_COLORS.disabled}`}>
                          {inbox.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-white/40 whitespace-nowrap">
                        {inbox.warmup_enabled
                          ? <span className="text-blue-600 dark:text-blue-400">{inbox.warmup_current_daily ?? 0}/{inbox.warmup_target_daily ?? "—"}/day</span>
                          : <span className="text-slate-300 dark:text-white/20">Off</span>}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        {inbox.last_error
                          ? <p className="text-[10px] text-red-500 truncate">{inbox.last_error}</p>
                          : <span className="text-[10px] text-slate-300 dark:text-white/20">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 dark:text-white/30 whitespace-nowrap">{new Date(inbox.created_at).toLocaleDateString()}</td>
                    </tr>

                    {/* Inline detail panel */}
                    {detail?.inbox.id === inbox.id && (
                      <tr key={`${inbox.id}-detail`}>
                        <td colSpan={7} className="p-0">
                          <div className="bg-orange-50 dark:bg-orange-500/5 border-t border-orange-100 dark:border-orange-500/10 px-5 py-4 space-y-4">
                            {detailLoading ? (
                              <p className="text-xs text-slate-400 dark:text-white/30 animate-pulse">Loading detail…</p>
                            ) : (
                              <>
                                {/* Full error */}
                                {detail.inbox.last_error && (
                                  <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3">
                                    <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1">Last Error</p>
                                    <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">{detail.inbox.last_error}</p>
                                  </div>
                                )}

                                {/* Config summary */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  {[
                                    { label: "SMTP Host",    value: detail.inbox.smtp_host ?? "—" },
                                    { label: "SMTP User",    value: detail.inbox.smtp_user ?? "—" },
                                    { label: "Daily Limit",  value: String(detail.inbox.daily_send_limit ?? 30) },
                                    { label: "Warmup Sends 7d", value: `${detail.warmup_sends_7d} (${detail.warmup_replies_7d} replied)` },
                                  ].map(({ label, value }) => (
                                    <div key={label} className="bg-white dark:bg-white/5 rounded-lg px-3 py-2.5 border border-slate-100 dark:border-white/10">
                                      <p className="text-[9px] text-slate-400 dark:text-white/30 uppercase tracking-wider font-semibold">{label}</p>
                                      <p className="text-xs text-slate-700 dark:text-white/70 mt-0.5 font-mono break-all">{value}</p>
                                    </div>
                                  ))}
                                </div>

                                {/* Admin actions */}
                                <div className="flex flex-wrap items-center gap-2">
                                  {detail.inbox.last_error && (
                                    <button
                                      onClick={() => doAction("clear_error")}
                                      disabled={actionWorking === "clear_error"}
                                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-600 dark:text-white/60 transition-colors disabled:opacity-50"
                                    >
                                      {actionWorking === "clear_error" ? "Clearing…" : "Clear Error"}
                                    </button>
                                  )}
                                  {detail.inbox.status !== "active" && (
                                    <button
                                      onClick={() => doAction("reset_status")}
                                      disabled={actionWorking === "reset_status"}
                                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-100 dark:bg-emerald-500/15 hover:bg-emerald-200 dark:hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 transition-colors disabled:opacity-50"
                                    >
                                      {actionWorking === "reset_status" ? "Resetting…" : "Reset to Active"}
                                    </button>
                                  )}
                                  {detail.inbox.status === "active" && (
                                    <button
                                      onClick={() => doAction("disable")}
                                      disabled={actionWorking === "disable"}
                                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-100 dark:bg-amber-500/15 hover:bg-amber-200 dark:hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 transition-colors disabled:opacity-50"
                                    >
                                      {actionWorking === "disable" ? "Disabling…" : "Disable"}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => doAction("toggle_warmup")}
                                    disabled={actionWorking === "toggle_warmup"}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-100 dark:bg-blue-500/15 hover:bg-blue-200 dark:hover:bg-blue-500/25 text-blue-700 dark:text-blue-400 transition-colors disabled:opacity-50"
                                  >
                                    {actionWorking === "toggle_warmup" ? "Toggling…" : detail.inbox.warmup_enabled ? "Disable Warmup" : "Enable Warmup"}
                                  </button>

                                  {/* Fix SMTP host inline */}
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={smtpHostInput}
                                      onChange={e => setSmtpHostInput(e.target.value)}
                                      placeholder="smtp.host.com"
                                      className="px-2.5 py-1.5 text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500/30 w-44"
                                    />
                                    <button
                                      onClick={() => doAction("update_smtp_host", { smtp_host: smtpHostInput })}
                                      disabled={actionWorking === "update_smtp_host" || !smtpHostInput.trim()}
                                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 transition-colors disabled:opacity-50"
                                    >
                                      {actionWorking === "update_smtp_host" ? "Saving…" : "Fix SMTP Host"}
                                    </button>
                                  </div>
                                </div>

                                {actionMsg && (
                                  <p className={`text-xs font-medium ${actionMsg.type === "ok" ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                                    {actionMsg.text}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE && (
          <div className="px-4 py-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-xs text-slate-400 dark:text-white/30">
            <span>{page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total.toLocaleString()}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-2.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors">←</button>
              <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE >= total}
                className="px-2.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 transition-colors">→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
