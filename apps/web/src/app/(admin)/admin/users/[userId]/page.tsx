"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Workspace {
  id: string; name: string; plan_id: string; plan_status: string;
  lead_credits_balance: number; created_at: string;
  stripe_customer_id: string | null;
  sends_this_month: number; max_monthly_sends: number; max_inboxes: number;
}
interface Ticket {
  id: string; subject: string; status: string; priority: string; created_at: string;
}
interface UserDetail {
  id: string; email: string; name: string | null;
  created_at: string; last_sign_in_at: string | null;
  email_confirmed: boolean; banned_until: string | null;
  user_metadata: Record<string, unknown>;
}

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, string> = {
    free:    "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50",
    starter: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300",
    growth:  "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300",
    scale:   "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${map[plan] ?? map.free}`}>{plan}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open:        "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
    in_progress: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300",
    resolved:    "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
    closed:      "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/30",
  };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${map[status] ?? map.open}`}>{status.replace("_", " ")}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    low:      "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/30",
    medium:   "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300",
    high:     "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300",
    urgent:   "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${map[priority] ?? map.medium}`}>{priority}</span>;
}

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const router = useRouter();

  const [user, setUser]       = useState<UserDetail | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg]         = useState<string | null>(null);
  const [showMetadata, setShowMetadata]   = useState(false);

  const fetchUser = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/users/${userId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setUser(d.user);
        setWorkspaces(d.workspaces ?? []);
        setTickets(d.tickets ?? []);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load user"); setLoading(false); });
  }, [userId]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActionLoading(action);
    setActionMsg(null);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    setActionLoading(null);
    if (data.ok) {
      setActionMsg(action === "ban" ? "User banned." : action === "unban" ? "User unbanned." : action === "reset_password" ? "Password reset email sent." : "Done.");
      fetchUser();
    } else {
      setActionMsg(`Error: ${data.error}`);
    }
  }

  async function doDelete() {
    if (!confirm("Permanently delete this user? This cannot be undone.")) return;
    setActionLoading("delete");
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete" }),
    });
    const data = await res.json();
    if (data.ok) router.push("/admin/users");
    else { setActionLoading(null); setActionMsg(`Error: ${data.error}`); }
  }

  async function doImpersonate() {
    setActionLoading("impersonate");
    setActionMsg(null);
    const res = await fetch(`/api/admin/users/${userId}/impersonate`, { method: "POST" });
    const data = await res.json();
    setActionLoading(null);
    if (data.url) {
      window.location.href = data.url;
    } else {
      setActionMsg(`Error: ${data.error ?? "Failed to impersonate"}`);
    }
  }

  const isBanned = user?.banned_until && new Date(user.banned_until) > new Date();

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6 animate-pulse">
        <div className="h-6 bg-slate-200 dark:bg-white/10 rounded w-48" />
        <div className="h-32 bg-slate-200 dark:bg-white/10 rounded-xl" />
        <div className="h-48 bg-slate-200 dark:bg-white/10 rounded-xl" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <p className="text-red-500">{error ?? "User not found"}</p>
        <Link href="/admin/users" className="text-sm text-blue-500 hover:underline mt-2 block">← Back to users</Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-white/30">
        <Link href="/admin/users" className="hover:text-blue-500 transition-colors">Users</Link>
        <span>/</span>
        <span className="text-slate-700 dark:text-white/70">{user.name || user.email}</span>
      </div>

      {/* Profile card */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
              {(user.name || user.email)[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{user.name || user.email}</h1>
              {user.name && <p className="text-sm text-slate-400 dark:text-white/40">{user.email}</p>}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {!user.email_confirmed && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300 uppercase">Unverified</span>
                )}
                {isBanned && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 uppercase">Banned</span>
                )}
                <span className="text-[10px] text-slate-400 dark:text-white/30">ID: {user.id}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={doImpersonate}
              disabled={actionLoading === "impersonate"}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-500 hover:bg-violet-600 text-white transition-colors disabled:opacity-50"
            >
              {actionLoading === "impersonate" ? "Loading…" : "Impersonate"}
            </button>
            <button
              onClick={() => doAction("reset_password")}
              disabled={!!actionLoading}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-white/70 transition-colors disabled:opacity-50"
            >
              {actionLoading === "reset_password" ? "Sending…" : "Send Password Reset"}
            </button>
            {isBanned ? (
              <button
                onClick={() => doAction("unban")}
                disabled={!!actionLoading}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-100 dark:bg-green-500/20 hover:bg-green-200 dark:hover:bg-green-500/30 text-green-700 dark:text-green-300 transition-colors disabled:opacity-50"
              >
                {actionLoading === "unban" ? "Unbanning…" : "Unban"}
              </button>
            ) : (
              <button
                onClick={() => doAction("ban")}
                disabled={!!actionLoading}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-100 dark:bg-orange-500/20 hover:bg-orange-200 dark:hover:bg-orange-500/30 text-orange-700 dark:text-orange-300 transition-colors disabled:opacity-50"
              >
                {actionLoading === "ban" ? "Banning…" : "Ban"}
              </button>
            )}
            <button
              onClick={doDelete}
              disabled={!!actionLoading}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-100 dark:bg-red-500/20 hover:bg-red-200 dark:hover:bg-red-500/30 text-red-700 dark:text-red-300 transition-colors disabled:opacity-50"
            >
              {actionLoading === "delete" ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>

        {actionMsg && (
          <div className={`mt-4 px-4 py-2.5 rounded-lg text-sm font-medium ${actionMsg.startsWith("Error") ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" : "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300"}`}>
            {actionMsg}
          </div>
        )}

        {/* Info grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Joined", value: new Date(user.created_at).toLocaleDateString() },
            { label: "Last sign in", value: user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : "Never" },
            { label: "Email confirmed", value: user.email_confirmed ? "Yes" : "No" },
            { label: "Workspaces", value: String(workspaces.length) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-50 dark:bg-white/5 rounded-lg px-4 py-3">
              <p className="text-[11px] text-slate-400 dark:text-white/30 uppercase tracking-wide font-semibold">{label}</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-white/80 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Workspaces */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-white/10">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">Workspaces</h2>
        </div>
        {workspaces.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400 dark:text-white/30">No workspaces.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/10">
                {["Name", "Plan", "Credits", "Sends", "Inboxes", "Created"].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {workspaces.map(ws => (
                <tr key={ws.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-white/80">{ws.name}</td>
                  <td className="px-4 py-3"><PlanBadge plan={ws.plan_id} /></td>
                  <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-white/60">{ws.lead_credits_balance.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-500 dark:text-white/40 text-xs">{ws.sends_this_month} / {ws.max_monthly_sends}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-500 dark:text-white/40 text-xs">{ws.max_inboxes}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-white/40 text-xs">{new Date(ws.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Support Tickets */}
      {tickets.length > 0 && (
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">Support Tickets</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/10">
                {["Subject", "Status", "Priority", "Created"].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {tickets.map(t => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-slate-800 dark:text-white/80">{t.subject}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                  <td className="px-4 py-3 text-slate-500 dark:text-white/40 text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Raw Metadata */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowMetadata(v => !v)}
          className="w-full px-5 py-3 flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-white/70 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
        >
          <span>Raw user_metadata</span>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${showMetadata ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showMetadata && (
          <pre className="px-5 py-4 text-xs text-slate-600 dark:text-white/50 overflow-x-auto border-t border-slate-100 dark:border-white/10 font-mono">
            {JSON.stringify(user.user_metadata, null, 2)}
          </pre>
        )}
      </div>

    </div>
  );
}
