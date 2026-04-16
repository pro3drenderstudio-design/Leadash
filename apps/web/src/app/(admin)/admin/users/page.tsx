"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

interface Workspace { id: string; name: string; plan_id: string; lead_credits_balance: number; }
interface User {
  id: string; email: string; name: string | null;
  created_at: string; last_sign_in_at: string | null;
  email_confirmed: boolean; banned: boolean;
  workspaces: Workspace[];
}

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, string> = {
    free:    "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50",
    starter: "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300",
    growth:  "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300",
    scale:   "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${map[plan] ?? map.free}`}>{plan}</span>;
}

function Avatar({ email, name }: { email: string; name?: string | null }) {
  const letter = (name || email)[0]?.toUpperCase() ?? "?";
  const colors = ["from-blue-400 to-indigo-500","from-violet-400 to-purple-500","from-emerald-400 to-teal-500","from-orange-400 to-red-500","from-pink-400 to-rose-500"];
  const idx = email.charCodeAt(0) % colors.length;
  return (
    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${colors[idx]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
      {letter}
    </div>
  );
}

// ── Send Message Modal ────────────────────────────────────────────────────────

interface MessageTarget { id: string; email: string; name: string | null }

function SendMessageModal({ target, onClose }: { target: MessageTarget; onClose: () => void }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  useEffect(() => { subjectRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function handleSend() {
    if (!subject.trim() || !message.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${target.id}/message`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setError(data.error ?? "Failed to send."); return; }
      setSent(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Send Message</h2>
            <p className="text-xs text-slate-400 dark:text-white/40 mt-0.5">
              To: <span className="text-slate-600 dark:text-white/60">{target.name ? `${target.name} <${target.email}>` : target.email}</span>
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
            </svg>
          </button>
        </div>

        {sent ? (
          <div className="px-6 py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-emerald-600 dark:text-emerald-400">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-800 dark:text-white">Message sent!</p>
            <p className="text-xs text-slate-400 dark:text-white/40 mt-1">Email delivered to {target.email}</p>
            <button onClick={onClose} className="mt-5 px-4 py-2 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-white/70 text-sm rounded-lg transition-colors">
              Close
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            {/* Subject */}
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1.5">Subject</label>
              <input
                ref={subjectRef}
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="e.g. Important update about your account"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1.5">Message</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Write your message here…"
                rows={7}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 dark:text-white/50 hover:text-slate-800 dark:hover:text-white/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !subject.trim() || !message.trim()}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {sending ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Sending…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M3.105 2.289a.75.75 0 0 0-.826.95l1.414 4.925A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.289Z"/>
                    </svg>
                    Send
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Users Page ────────────────────────────────────────────────────────────────

function UsersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [users, setUsers]   = useState<User[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [messageTarget, setMessageTarget] = useState<MessageTarget | null>(null);

  const page   = parseInt(searchParams.get("page")   ?? "1");
  const search = searchParams.get("search") ?? "";
  const plan   = searchParams.get("plan")   ?? "";

  const fetchUsers = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ page: String(page), search, plan });
    fetch(`/api/admin/users?${q}`)
      .then(r => r.json())
      .then(d => { setUsers(d.users ?? []); setTotal(d.total ?? 0); setLoading(false); });
  }, [page, search, plan]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function setParam(key: string, val: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (val) p.set(key, val); else p.delete(key);
    if (key !== "page") p.delete("page");
    router.push(`/admin/users?${p}`);
  }

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Users</h1>
          <p className="text-sm text-slate-500 dark:text-white/40 mt-0.5">{total.toLocaleString()} total accounts</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-60">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            placeholder="Search by email or name…"
            defaultValue={search}
            onKeyDown={e => e.key === "Enter" && setParam("search", (e.target as HTMLInputElement).value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
        </div>
        <select
          value={plan}
          onChange={e => setParam("plan", e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        >
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="growth">Growth</option>
          <option value="scale">Scale</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/10">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden md:table-cell">Plan</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden lg:table-cell">Credits</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden lg:table-cell">Joined</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden lg:table-cell">Last seen</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {loading && Array.from({ length: 10 }).map((_, i) => (
              <tr key={i}>
                <td className="px-5 py-3"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-48" /></td>
                <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-16" /></td>
                <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-12" /></td>
                <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-24" /></td>
                <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse w-24" /></td>
                <td className="px-4 py-3" />
              </tr>
            ))}
            {!loading && users.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">No users found.</td></tr>
            )}
            {!loading && users.map(u => {
              const ws = u.workspaces[0];
              const totalCredits = u.workspaces.reduce((s, w) => s + w.lead_credits_balance, 0);
              return (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar email={u.email} name={u.name} />
                      <div>
                        <Link href={`/admin/users/${u.id}`} className="font-medium text-slate-800 dark:text-white/90 hover:text-orange-600 dark:hover:text-orange-400 transition-colors">
                          {u.name || u.email}
                        </Link>
                        {u.name && <p className="text-xs text-slate-400 dark:text-white/30">{u.email}</p>}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {!u.email_confirmed && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300 uppercase">Unverified</span>}
                          {u.banned && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 uppercase">Banned</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {ws ? <PlanBadge plan={ws.plan_id} /> : <span className="text-slate-300 dark:text-white/20 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-slate-600 dark:text-white/60 tabular-nums">
                    {totalCredits.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-slate-500 dark:text-white/40 text-xs">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-slate-500 dark:text-white/40 text-xs">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="text-xs text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors font-medium"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
            <p className="text-xs text-slate-400 dark:text-white/30">
              Showing {((page - 1) * 25) + 1}–{Math.min(page * 25, total)} of {total}
            </p>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = i + 1;
                return (
                  <button
                    key={p}
                    onClick={() => setParam("page", String(p))}
                    className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                      p === page
                        ? "bg-orange-500 text-white"
                        : "text-slate-500 dark:text-white/40 hover:bg-slate-100 dark:hover:bg-white/10"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function UsersPage() {
  return <Suspense><UsersPageInner /></Suspense>;
}
