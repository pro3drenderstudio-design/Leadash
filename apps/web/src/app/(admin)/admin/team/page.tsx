"use client";
import { useEffect, useState, useCallback } from "react";

interface AdminMember {
  user_id: string;
  email:   string;
  name:    string | null;
  role:    string;
  added_at: string;
  is_you:  boolean;
}

interface PendingInvite {
  id:          string;
  email:       string;
  role:        string;
  invited_at:  string;
  expires_at:  string;
  permissions: Record<string, boolean>;
}

const ROLES = [
  { value: "super_admin", label: "Super Admin",  desc: "Full access to all admin features" },
  { value: "support",     label: "Support",       desc: "Access to tickets, users, workspaces" },
  { value: "billing",     label: "Billing",       desc: "Access to plans, billing, transactions" },
  { value: "readonly",    label: "Read-only",     desc: "Can view everything, no actions" },
];

const ROLE_COLOR: Record<string, string> = {
  super_admin: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  support:     "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  billing:     "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  readonly:    "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/40",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${ROLE_COLOR[role] ?? ROLE_COLOR.readonly}`}>
      {role.replace("_", " ")}
    </span>
  );
}

export default function AdminTeamPage() {
  const [members,  setMembers]  = useState<AdminMember[]>([]);
  const [invites,  setInvites]  = useState<PendingInvite[]>([]);
  const [myRole,   setMyRole]   = useState<string>("");
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole,  setInviteRole]  = useState("support");
  const [sending,     setSending]     = useState(false);
  const [sendMsg,     setSendMsg]     = useState<string | null>(null);

  const isSuperAdmin = myRole === "super_admin";

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/team")
      .then(r => r.json())
      .then((d: { admins?: AdminMember[]; invites?: PendingInvite[]; myRole?: string; error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setMembers(d.admins ?? []);
        setInvites(d.invites ?? []);
        setMyRole(d.myRole ?? "");
      })
      .catch(() => setError("Failed to load team"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSending(true);
    setSendMsg(null);
    try {
      const res = await fetch("/api/admin/team", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setSendMsg(`Invite sent to ${inviteEmail.trim()}`);
        setInviteEmail("");
        load();
      } else {
        setSendMsg(`Error: ${data.error}`);
      }
    } catch {
      setSendMsg("Error: Network error");
    } finally {
      setSending(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm("Remove this admin from the team?")) return;
    await fetch("/api/admin/team", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ user_id: userId }),
    });
    load();
  }

  async function handleRevokeInvite(inviteId: string) {
    await fetch("/api/admin/team", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ invite_id: inviteId }),
    });
    load();
  }

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 dark:bg-white/10 rounded w-48" />
        <div className="h-40 bg-slate-200 dark:bg-white/10 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Team</h1>
        <p className="text-sm text-slate-500 dark:text-white/40 mt-1">
          Manage who has access to the Leadash admin panel.
        </p>
      </div>

      {/* Invite form — super_admin only */}
      {isSuperAdmin && (
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70 mb-4">Invite a team member</h2>
          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              required
              className="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={sending || !inviteEmail.trim()}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {sending ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              )}
              Send invite
            </button>
          </form>

          {/* Role descriptions */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {ROLES.map(r => (
              <div key={r.value} className={`flex items-start gap-2 px-3 py-2 rounded-lg ${inviteRole === r.value ? "bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/25" : "bg-slate-50 dark:bg-white/3 border border-transparent"}`}>
                <RoleBadge role={r.value} />
                <span className="text-xs text-slate-500 dark:text-white/40">{r.desc}</span>
              </div>
            ))}
          </div>

          {sendMsg && (
            <p className={`mt-3 text-xs font-medium ${sendMsg.startsWith("Error") ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
              {sendMsg}
            </p>
          )}
        </div>
      )}

      {/* Current members */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-white/10">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">Team members ({members.length})</h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {members.map(m => (
            <div key={m.user_id} className="flex items-center gap-4 px-5 py-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {(m.name || m.email)[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-white/90 truncate">
                  {m.name || m.email}
                  {m.is_you && <span className="ml-2 text-[10px] font-bold text-slate-400 dark:text-white/30">(you)</span>}
                </p>
                {m.name && <p className="text-xs text-slate-400 dark:text-white/30 truncate">{m.email}</p>}
              </div>
              <RoleBadge role={m.role} />
              <span className="text-xs text-slate-400 dark:text-white/30 hidden sm:block">
                Since {new Date(m.added_at).toLocaleDateString()}
              </span>
              {isSuperAdmin && !m.is_you && (
                <button
                  onClick={() => handleRemoveMember(m.user_id)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors font-medium"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">Pending invites ({invites.length})</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center gap-4 px-5 py-3">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-slate-500 dark:text-white/40 text-xs font-bold flex-shrink-0">
                  {inv.email[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 dark:text-white/90 truncate">{inv.email}</p>
                  <p className="text-xs text-slate-400 dark:text-white/30">
                    Expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <RoleBadge role={inv.role} />
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 uppercase">
                  Pending
                </span>
                {isSuperAdmin && (
                  <button
                    onClick={() => handleRevokeInvite(inv.id)}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors font-medium"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
