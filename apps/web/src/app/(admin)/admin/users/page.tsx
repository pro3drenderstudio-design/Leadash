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

// ── Create Ticket Modal ───────────────────────────────────────────────────────

const TICKET_CATEGORIES = [
  { value: "billing",         label: "Billing" },
  { value: "technical",       label: "Technical" },
  { value: "feature_request", label: "Feature Request" },
  { value: "bug",             label: "Bug Report" },
  { value: "general",         label: "General" },
];
const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

function CreateTicketModal({ target, onClose }: { target: MessageTarget; onClose: () => void }) {
  const [subject,  setSubject]  = useState("");
  const [message,  setMessage]  = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState<"low"|"medium"|"high"|"urgent">("medium");
  const [saving, setSaving]     = useState(false);
  const [done,   setDone]       = useState(false);
  const [error,  setError]      = useState<string | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  useEffect(() => { subjectRef.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function handleCreate() {
    if (!subject.trim() || !message.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/support", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ user_id: target.id, subject: subject.trim(), message: message.trim(), category, priority }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setError(data.error ?? "Failed to create ticket."); return; }
      setDone(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Create Ticket</h2>
            <p className="text-xs text-slate-400 dark:text-white/40 mt-0.5">
              For: <span className="text-slate-600 dark:text-white/60">{target.name ? `${target.name} <${target.email}>` : target.email}</span>
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
            </svg>
          </button>
        </div>

        {done ? (
          <div className="px-6 py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-emerald-600 dark:text-emerald-400">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-800 dark:text-white">Ticket created!</p>
            <p className="text-xs text-slate-400 dark:text-white/40 mt-1">User and admins have been notified by email.</p>
            <button onClick={onClose} className="mt-5 px-4 py-2 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-white/70 text-sm rounded-lg transition-colors">
              Close
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1.5">Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30">
                  {TICKET_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1.5">Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value as typeof priority)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30">
                  {TICKET_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1.5">Subject</label>
              <input ref={subjectRef} type="text" value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="Brief description of the issue"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1.5">Message</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6}
                placeholder="Describe the issue or reason for opening this ticket…"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none" />
            </div>
            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-white/50 hover:text-slate-800 dark:hover:text-white/80 transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !subject.trim() || !message.trim()}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                {saving ? (
                  <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Creating…</>
                ) : (
                  <><svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-1.5 0a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0zM10 6.5a.75.75 0 01.75.75v2.25h2.25a.75.75 0 010 1.5h-2.25v2.25a.75.75 0 01-1.5 0v-2.25H7a.75.75 0 010-1.5h2.25V7.25A.75.75 0 0110 6.5z" clipRule="evenodd"/></svg>Create Ticket</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create User Modal ─────────────────────────────────────────────────────────

interface CreatedResult {
  email:         string;
  name:          string | null;
  temp_password: string;
  email_status:  "sent" | "skipped" | "failed";
  email_error:   string | null;
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (r: CreatedResult) => void }) {
  const [email, setEmail]         = useState("");
  const [name,  setName]          = useState("");
  const [phone, setPhone]         = useState("");
  const [notes, setNotes]         = useState("");
  const [tags,  setTags]          = useState<string[]>([]);
  const [tagDraft, setTagDraft]   = useState("");
  const [suggestions, setSug]     = useState<{ tag: string; count: number }[]>([]);
  const [sendWelcome, setSend]    = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => { emailRef.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    fetch("/api/admin/crm/tags").then(r => r.json())
      .then(d => setSug((d.tags ?? []) as { tag: string; count: number }[]))
      .catch(() => setSug([]));
  }, []);

  function addTag(t: string) {
    const clean = t.trim();
    if (!clean) return;
    setTags(prev => prev.includes(clean) ? prev : [...prev, clean]);
    setTagDraft("");
  }
  function removeTag(t: string) { setTags(prev => prev.filter(x => x !== t)); }

  async function handleCreate() {
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email"); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          full_name: name.trim() || null,
          phone: phone.trim() || null,
          tags,
          notes: notes.trim() || null,
          send_welcome_email: sendWelcome,
        }),
      });
      const data = await res.json() as { error?: string } & CreatedResult;
      if (!res.ok) { setError(data.error ?? "Failed to create user"); return; }
      onCreated({
        email:         data.email,
        name:          data.name,
        temp_password: data.temp_password,
        email_status:  data.email_status,
        email_error:   data.email_error,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const remainingSuggestions = suggestions.filter(s => !tags.includes(s.tag)).slice(0, 12);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-white/10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Create user</h2>
            <p className="text-xs text-slate-400 dark:text-white/40 mt-0.5">The account gets a temp password and lands in CRM.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1.5">Email <span className="text-red-500">*</span></label>
            <input ref={emailRef} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1.5">Full name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1.5">Phone / WhatsApp</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+2348001234567"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1.5">Tags</label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300 rounded">
                    {t}
                    <button onClick={() => removeTag(t)} className="hover:text-orange-900 dark:hover:text-orange-100" aria-label={`Remove ${t}`}>×</button>
                  </span>
                ))}
              </div>
            )}
            <input type="text" value={tagDraft} onChange={e => setTagDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(tagDraft); } }}
              placeholder="Type a tag and press Enter"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
            {remainingSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {remainingSuggestions.map(s => (
                  <button key={s.tag} type="button" onClick={() => addTag(s.tag)}
                    className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-white/50 hover:bg-orange-100 hover:text-orange-700 dark:hover:bg-orange-500/20 dark:hover:text-orange-300 transition-colors">
                    + {s.tag}<span className="text-slate-400 ml-1">{s.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1.5">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Context that'll help support recognise them…"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none" />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-white/60 cursor-pointer">
            <input type="checkbox" checked={sendWelcome} onChange={e => setSend(e.target.checked)} />
            Email the temp password to the user
          </label>

          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-white/50 hover:text-slate-800 dark:hover:text-white/80 transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={saving}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
              {saving ? "Creating…" : "Create user"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Password Shown Once Modal ─────────────────────────────────────────────────

export function PasswordShownOnceModal({ email, name, tempPassword, emailStatus, emailError, onClose }: {
  email: string; name: string | null; tempPassword: string;
  emailStatus: "sent" | "skipped" | "failed"; emailError: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-white/10 px-6 py-6">
        <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mb-3">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-emerald-600 dark:text-emerald-400">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/>
          </svg>
        </div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Temporary password ready</h2>
        <p className="text-xs text-slate-500 dark:text-white/50 mt-1">
          {name ? `${name} <${email}>` : email} will be prompted to set a new password on first sign-in.
        </p>

        <div className="mt-4 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3">
          <p className="text-[10px] font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider mb-1">Password</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-sm text-slate-800 dark:text-white/90 select-all break-all">{tempPassword}</code>
            <button onClick={copy} className="text-xs px-2 py-1 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-700 dark:text-white/80 rounded transition-colors">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="mt-3">
          {emailStatus === "sent" && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">✓ Emailed to {email}.</p>
          )}
          {emailStatus === "skipped" && (
            <p className="text-[11px] text-slate-500 dark:text-white/40">Email delivery skipped. Share the password another way.</p>
          )}
          {emailStatus === "failed" && (
            <p className="text-[11px] text-red-500 dark:text-red-400">
              ⚠ Email delivery failed{emailError ? ` — ${emailError}` : ""}. Copy the password above and share it.
            </p>
          )}
        </div>

        <p className="text-[11px] text-slate-400 dark:text-white/30 mt-4">
          This password is shown once. Close this dialog to dismiss.
        </p>

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors">
            Done
          </button>
        </div>
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
  const [ticketTarget, setTicketTarget]   = useState<MessageTarget | null>(null);
  const [createOpen,   setCreateOpen]     = useState(false);
  const [passwordShown, setPasswordShown] = useState<CreatedResult | null>(null);

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

      {/* Modals */}
      {messageTarget && (
        <SendMessageModal target={messageTarget} onClose={() => setMessageTarget(null)} />
      )}
      {ticketTarget && (
        <CreateTicketModal target={ticketTarget} onClose={() => setTicketTarget(null)} />
      )}
      {createOpen && (
        <CreateUserModal
          onClose={() => setCreateOpen(false)}
          onCreated={r => { setCreateOpen(false); setPasswordShown(r); fetchUsers(); }}
        />
      )}
      {passwordShown && (
        <PasswordShownOnceModal
          email={passwordShown.email}
          name={passwordShown.name}
          tempPassword={passwordShown.temp_password}
          emailStatus={passwordShown.email_status}
          emailError={passwordShown.email_error}
          onClose={() => setPasswordShown(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="app-h1">Users</h1>
          <p className="text-sm text-slate-500 dark:text-white/40 mt-0.5">{total.toLocaleString()} total accounts</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v5.5h5.5a.75.75 0 0 1 0 1.5h-5.5v5.5a.75.75 0 0 1-1.5 0v-5.5h-5.5a.75.75 0 0 1 0-1.5h5.5v-5.5A.75.75 0 0 1 10 3Z" clipRule="evenodd"/></svg>
          Create user
        </button>
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
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setTicketTarget({ id: u.id, email: u.email, name: u.name })}
                        title="Create support ticket for this user"
                        className="text-xs text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors font-medium flex items-center gap-1"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2a1.5 1.5 0 0 1 1.5 1.5V4h.5A1.5 1.5 0 0 1 12.5 5.5v7A1.5 1.5 0 0 1 11 14H5a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 5 4h.5v-.5Zm1.5 0V4H9v-.5a.5.5 0 0 0-.5-.5H7.5a.5.5 0 0 0-.5.5ZM8 7.5a.5.5 0 0 0-1 0v1.5H5.5a.5.5 0 0 0 0 1H7v1.5a.5.5 0 0 0 1 0V10h1.5a.5.5 0 0 0 0-1H8V7.5Z"/>
                        </svg>
                        Ticket
                      </button>
                      <button
                        onClick={() => setMessageTarget({ id: u.id, email: u.email, name: u.name })}
                        title="Send email message"
                        className="text-xs text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors font-medium flex items-center gap-1"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M2.5 3A1.5 1.5 0 0 0 1 4.5v.793c.026.009.051.02.076.032L7.674 8.51c.206.1.446.1.652 0l6.598-3.185A.755.755 0 0 1 15 5.293V4.5A1.5 1.5 0 0 0 13.5 3h-11Z"/>
                          <path d="M15 6.954 8.978 9.86a2.25 2.25 0 0 1-1.956 0L1 6.954V11.5A1.5 1.5 0 0 0 2.5 13h11a1.5 1.5 0 0 0 1.5-1.5V6.954Z"/>
                        </svg>
                        Message
                      </button>
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="text-xs text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors font-medium"
                      >
                        View →
                      </Link>
                    </div>
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
