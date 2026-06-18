"use client";
import { useEffect, useState, useCallback } from "react";
import { ADMIN_MODULES, isAlwaysOnModule, type AdminModuleKey } from "@/lib/admin/modules";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AdminMember {
  user_id:     string;
  email:       string;
  name:        string | null;
  role:        string;
  preset_id:   string | null;
  permissions: string[];
  added_at:    string;
  is_you:      boolean;
}

interface PendingInvite {
  id:          string;
  email:       string;
  role:        string;
  preset_id:   string | null;
  permissions: string[];
  invited_at:  string;
  expires_at:  string;
}

interface Preset {
  id:           string;
  name:         string;
  modules:      string[];
  in_use_count: number;
  created_at:   string;
  updated_at:   string;
}

// ── Built-in role display info (kept in sync with lib/admin/modules.ts) ────────

const BUILTIN_ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin",  desc: "Full access to all admin features" },
  { value: "support",     label: "Support",       desc: "Tickets, users, workspaces" },
  { value: "billing",     label: "Billing",       desc: "Plans, financials, LeadPay" },
  { value: "readonly",    label: "Read-only",     desc: "Can view all modules except Team Config" },
];

const ROLE_COLOR: Record<string, string> = {
  super_admin: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  support:     "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  billing:     "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  readonly:    "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/40",
  custom:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
};

function RoleBadge({ role, presetName }: { role: string; presetName?: string | null }) {
  const label = role === "custom" && presetName ? presetName : role.replace("_", " ");
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${ROLE_COLOR[role] ?? ROLE_COLOR.readonly}`}>
      {label}
    </span>
  );
}

// ── Module checkbox grid — reused for preset create + edit ─────────────────────

function ModulePicker({
  selected, onChange, disabled = false,
}: {
  selected: Set<string>; onChange: (next: Set<string>) => void; disabled?: boolean;
}) {
  function toggle(key: AdminModuleKey) {
    if (isAlwaysOnModule(key) || disabled) return; // Overview is mandatory
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(next);
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {ADMIN_MODULES.map(m => {
        const isOn = isAlwaysOnModule(m.key) || selected.has(m.key);
        const locked = isAlwaysOnModule(m.key);
        return (
          <label
            key={m.key}
            className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border transition-colors ${
              isOn
                ? "bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/25"
                : "bg-slate-50 dark:bg-white/3 border-slate-200 dark:border-white/8 hover:border-slate-300 dark:hover:border-white/15"
            } ${locked ? "opacity-60 cursor-not-allowed" : disabled ? "opacity-50" : "cursor-pointer"}`}
          >
            <input
              type="checkbox"
              checked={isOn}
              disabled={locked || disabled}
              onChange={() => toggle(m.key)}
              className="mt-0.5 accent-orange-500"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-white/85 flex items-center gap-1.5">
                {m.label}
                {locked && <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-white/30">Always on</span>}
              </p>
              <p className="text-xs text-slate-500 dark:text-white/40">{m.description}</p>
            </div>
          </label>
        );
      })}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminTeamPage() {
  const [members,        setMembers]        = useState<AdminMember[]>([]);
  const [invites,        setInvites]        = useState<PendingInvite[]>([]);
  const [presets,        setPresets]        = useState<Preset[]>([]);
  const [myRole,         setMyRole]         = useState<string>("");
  const [canManageTeam,  setCanManageTeam]  = useState<boolean>(false);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);

  // Invite form state — role can be a built-in role value OR `custom:<presetId>` for a saved preset
  const [inviteEmail,    setInviteEmail]    = useState("");
  const [inviteRole,     setInviteRole]     = useState("support");
  const [sending,        setSending]        = useState(false);
  const [sendMsg,        setSendMsg]        = useState<string | null>(null);

  // Preset editor state
  const [editingPreset,  setEditingPreset]  = useState<Preset | "new" | null>(null);
  const [presetName,     setPresetName]     = useState("");
  const [presetModules,  setPresetModules]  = useState<Set<string>>(new Set());
  const [presetSaving,   setPresetSaving]   = useState(false);
  const [presetError,    setPresetError]    = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/team").then(r => r.json()),
      fetch("/api/admin/team/presets").then(r => r.json()).catch(() => ({ presets: [] })),
    ])
      .then(([team, p]: [{ admins?: AdminMember[]; invites?: PendingInvite[]; presets?: Preset[]; myRole?: string; canManageTeam?: boolean; error?: string }, { presets?: Preset[] }]) => {
        if (team.error) { setError(team.error); return; }
        setMembers(team.admins ?? []);
        setInvites(team.invites ?? []);
        setMyRole(team.myRole ?? "");
        setCanManageTeam(!!team.canManageTeam);
        // Prefer the enriched preset list (with in_use_count) from the presets endpoint
        setPresets(p.presets ?? team.presets ?? []);
      })
      .catch(() => setError("Failed to load team"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Invites ──────────────────────────────────────────────────────────────────

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSending(true);
    setSendMsg(null);

    // inviteRole is either a built-in role string ("super_admin", "support", ...)
    // or a preset reference of the form "custom:<presetId>"
    let role: string;
    let preset_id: string | null = null;
    if (inviteRole.startsWith("custom:")) {
      role      = "custom";
      preset_id = inviteRole.slice("custom:".length);
    } else {
      role = inviteRole;
    }

    try {
      const res = await fetch("/api/admin/team", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: inviteEmail.trim(), role, preset_id }),
      });
      const data = await res.json() as {
        ok?: boolean;
        error?: string;
        email_status?: "sent" | "skipped" | "failed";
        email_error?: string | null;
        accept_url?: string | null;
      };
      if (data.ok) {
        // The invite row was created server-side — but the email itself may
        // have failed (e.g. Resend domain not verified). Distinguish so the
        // operator can fall back to copying the accept URL out.
        const target = inviteEmail.trim();
        if (data.email_status === "sent") {
          setSendMsg(`Invite sent to ${target}.`);
        } else if (data.email_status === "failed") {
          setSendMsg(
            `Invite created for ${target}, but the email failed to send (${data.email_error ?? "unknown error"}). ` +
            `Send them this link manually: ${data.accept_url}`,
          );
        } else if (data.email_status === "skipped") {
          setSendMsg(
            `Invite created for ${target}, but the email service isn't configured on the server. ` +
            `Send them this link manually: ${data.accept_url}`,
          );
        } else {
          setSendMsg(`Invite created for ${target}.`);
        }
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
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    load();
  }

  async function handleRevokeInvite(inviteId: string) {
    await fetch("/api/admin/team", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_id: inviteId }),
    });
    load();
  }

  // ── Presets ──────────────────────────────────────────────────────────────────

  function startNewPreset() {
    setEditingPreset("new");
    setPresetName("");
    setPresetModules(new Set());
    setPresetError(null);
  }
  function startEditPreset(p: Preset) {
    setEditingPreset(p);
    setPresetName(p.name);
    setPresetModules(new Set(p.modules));
    setPresetError(null);
  }
  function cancelPreset() {
    setEditingPreset(null);
    setPresetError(null);
  }

  async function savePreset() {
    if (!editingPreset) return;
    if (!presetName.trim()) { setPresetError("Name is required"); return; }
    const userPicked = Array.from(presetModules).filter(m => !isAlwaysOnModule(m as AdminModuleKey));
    if (!userPicked.length) { setPresetError("Pick at least one module"); return; }

    setPresetSaving(true);
    setPresetError(null);
    try {
      const isNew = editingPreset === "new";
      const url   = isNew ? "/api/admin/team/presets" : `/api/admin/team/presets/${editingPreset.id}`;
      const res = await fetch(url, {
        method:  isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: presetName.trim(), modules: userPicked }),
      });
      const data = await res.json() as { preset?: Preset; error?: string };
      if (!res.ok || !data.preset) { setPresetError(data.error ?? "Failed to save"); return; }
      setEditingPreset(null);
      load();
    } finally {
      setPresetSaving(false);
    }
  }

  async function deletePreset(p: Preset) {
    if (!confirm(`Delete the "${p.name}" preset?`)) return;
    const res = await fetch(`/api/admin/team/presets/${p.id}`, { method: "DELETE" });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok) {
      alert(data.error ?? "Failed to delete preset");
      return;
    }
    load();
  }

  // ── Render ───────────────────────────────────────────────────────────────────

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

  const presetById = new Map(presets.map(p => [p.id, p]));

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Team</h1>
        <p className="text-sm text-slate-500 dark:text-white/40 mt-1">
          Manage who has access to the Leadash admin panel and what each member can see.
        </p>
      </div>

      {/* Invite form */}
      {canManageTeam && (
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
              <optgroup label="Built-in roles">
                {BUILTIN_ROLE_OPTIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </optgroup>
              {presets.length > 0 && (
                <optgroup label="Custom presets">
                  {presets.map(p => (
                    <option key={p.id} value={`custom:${p.id}`}>{p.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              type="submit"
              disabled={sending || !inviteEmail.trim()}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {sending ? "Sending…" : "Send invite"}
            </button>
          </form>
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
          {members.map(m => {
            const preset = m.preset_id ? presetById.get(m.preset_id) : null;
            return (
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
                <RoleBadge role={m.role} presetName={preset?.name} />
                <span className="text-xs text-slate-400 dark:text-white/30 hidden sm:block">
                  Since {new Date(m.added_at).toLocaleDateString()}
                </span>
                {canManageTeam && !m.is_you && (
                  <button
                    onClick={() => handleRemoveMember(m.user_id)}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors font-medium"
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">Pending invites ({invites.length})</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {invites.map(inv => {
              const preset = inv.preset_id ? presetById.get(inv.preset_id) : null;
              return (
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
                  <RoleBadge role={inv.role} presetName={preset?.name} />
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 uppercase">
                    Pending
                  </span>
                  {canManageTeam && (
                    <button onClick={() => handleRevokeInvite(inv.id)} className="text-xs text-slate-400 hover:text-red-500 transition-colors font-medium">
                      Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Custom presets */}
      {canManageTeam && (
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">Custom role presets</h2>
              <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">Save module bundles as named templates and reuse them when inviting team members.</p>
            </div>
            <button
              onClick={startNewPreset}
              className="px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              + New preset
            </button>
          </div>

          {/* Editor panel — inline create or edit */}
          {editingPreset !== null && (
            <div className="px-5 py-4 bg-slate-50 dark:bg-white/3 border-b border-slate-100 dark:border-white/10 space-y-3">
              <input
                type="text"
                placeholder="Preset name (e.g. Content moderator)"
                value={presetName}
                onChange={e => setPresetName(e.target.value)}
                maxLength={60}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
              <ModulePicker selected={presetModules} onChange={setPresetModules} disabled={presetSaving} />
              {presetError && <p className="text-red-500 text-xs">{presetError}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={savePreset}
                  disabled={presetSaving}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {presetSaving ? "Saving…" : editingPreset === "new" ? "Create preset" : "Save changes"}
                </button>
                <button onClick={cancelPreset} disabled={presetSaving} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/70 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {presets.length === 0 && editingPreset === null ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400 dark:text-white/30">
              No custom presets yet. Click <strong>+ New preset</strong> to create one.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {presets.map(p => (
                <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-white/90 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400 dark:text-white/30">
                      {p.modules.length} module{p.modules.length === 1 ? "" : "s"}
                      {p.in_use_count > 0 && (
                        <span className="ml-2 text-emerald-600 dark:text-emerald-400">· in use by {p.in_use_count} admin{p.in_use_count === 1 ? "" : "s"}</span>
                      )}
                    </p>
                  </div>
                  <button onClick={() => startEditPreset(p)} className="text-xs text-slate-500 hover:text-slate-800 dark:text-white/40 dark:hover:text-white/80 transition-colors font-medium">
                    Edit
                  </button>
                  <button
                    onClick={() => deletePreset(p)}
                    disabled={p.in_use_count > 0}
                    title={p.in_use_count > 0 ? "Reassign all admins on this preset before deleting" : undefined}
                    className="text-xs text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My role footer */}
      <p className="text-xs text-slate-400 dark:text-white/30 text-center">
        You are signed in as <strong className="font-semibold">{myRole.replace("_", " ")}</strong>.
      </p>
    </div>
  );
}
