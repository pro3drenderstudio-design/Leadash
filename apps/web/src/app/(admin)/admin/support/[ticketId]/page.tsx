"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface TicketMessage {
  id: string;
  sender_type: "user" | "admin";
  message: string;
  created_at: string;
}

interface Ticket {
  id: string; ticket_number: number; subject: string; message: string;
  category: string; priority: string; status: string;
  admin_reply: string | null; admin_replied_at: string | null;
  resolved_at: string | null; created_at: string; updated_at: string;
  user_id: string; workspace_id: string;
}

const STATUS_OPTIONS = ["open", "in_progress", "resolved", "closed"] as const;
const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"] as const;

const STATUS_MAP: Record<string, string> = {
  open:        "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  in_progress: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300",
  resolved:    "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  closed:      "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/30",
};
const PRIORITY_MAP: Record<string, string> = {
  low:    "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/30",
  medium: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300",
  high:   "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

function Badge({ label, map }: { label: string; map: Record<string, string> }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${map[label] ?? map.medium}`}>
      {label.replace("_", " ")}
    </span>
  );
}

export default function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();

  const [ticket, setTicket]     = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [userEmail, setUserEmail]       = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspacePlan, setWorkspacePlan] = useState("");
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [reply, setReply]       = useState("");
  const [replyStatus, setReplyStatus] = useState<string>("");
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState<string | null>(null);

  // Quick-action state
  const [statusVal, setStatusVal]     = useState("");
  const [priorityVal, setPriorityVal] = useState("");
  const [metaSaving, setMetaSaving]   = useState(false);

  const fetchTicket = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/support/${ticketId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setTicket(d.ticket);
        setMessages(d.messages ?? []);
        setUserEmail(d.user_email);
        setWorkspaceName(d.workspace_name);
        setWorkspacePlan(d.workspace_plan);
        setReply("");
        setReplyStatus(d.ticket.status);
        setStatusVal(d.ticket.status);
        setPriorityVal(d.ticket.priority);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load ticket"); setLoading(false); });
  }, [ticketId]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch(`/api/admin/support/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_reply: reply, status: replyStatus }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) { setSaveMsg("Reply saved."); fetchTicket(); }
    else setSaveMsg(`Error: ${data.error}`);
  }

  async function updateMeta() {
    setMetaSaving(true);
    const res = await fetch(`/api/admin/support/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: statusVal, priority: priorityVal }),
    });
    const data = await res.json();
    setMetaSaving(false);
    if (data.ok) fetchTicket();
  }

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6 animate-pulse">
        <div className="h-6 bg-slate-200 dark:bg-white/10 rounded w-48" />
        <div className="h-40 bg-slate-200 dark:bg-white/10 rounded-xl" />
        <div className="h-48 bg-slate-200 dark:bg-white/10 rounded-xl" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <p className="text-red-500">{error ?? "Ticket not found"}</p>
        <Link href="/admin/support" className="text-sm text-blue-500 hover:underline mt-2 block">← Back to tickets</Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-white/30">
        <Link href="/admin/support" className="hover:text-blue-500 transition-colors">Support</Link>
        <span>/</span>
        <span className="text-slate-700 dark:text-white/70">#{ticket.ticket_number}</span>
      </div>

      {/* Ticket header */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-mono text-slate-400 dark:text-white/30">#{ticket.ticket_number}</span>
              <Badge label={ticket.status}   map={STATUS_MAP} />
              <Badge label={ticket.priority} map={PRIORITY_MAP} />
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/40">{ticket.category}</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{ticket.subject}</h1>
          </div>
          <div className="text-right text-xs text-slate-400 dark:text-white/30">
            <p>{new Date(ticket.created_at).toLocaleString()}</p>
            {ticket.resolved_at && <p className="text-green-500 mt-0.5">Resolved {new Date(ticket.resolved_at).toLocaleDateString()}</p>}
          </div>
        </div>

        {/* User + workspace */}
        <div className="mt-4 flex items-center gap-4 flex-wrap text-sm">
          <Link href={`/admin/users/${ticket.user_id}`} className="text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            {userEmail} →
          </Link>
          {workspaceName && (
            <Link href={`/admin/workspaces/${ticket.workspace_id}`} className="text-slate-500 dark:text-white/40 hover:text-blue-500 transition-colors">
              {workspaceName} ({workspacePlan})
            </Link>
          )}
        </div>

        {/* Original message */}
        <div className="mt-5 pt-5 border-t border-slate-100 dark:border-white/10">
          <p className="text-xs text-slate-400 dark:text-white/30 font-semibold uppercase tracking-wide mb-2">User message</p>
          <p className="text-sm text-slate-700 dark:text-white/70 whitespace-pre-wrap leading-relaxed">{ticket.message}</p>
        </div>

        {/* Existing reply (if any) */}
        {ticket.admin_reply && (
          <div className="mt-5 pt-5 border-t border-slate-100 dark:border-white/10">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-green-600 dark:text-green-400 font-semibold uppercase tracking-wide">Admin reply</p>
              {ticket.admin_replied_at && (
                <p className="text-xs text-slate-400 dark:text-white/30">{new Date(ticket.admin_replied_at).toLocaleString()}</p>
              )}
            </div>
            <p className="text-sm text-slate-700 dark:text-white/70 whitespace-pre-wrap leading-relaxed">{ticket.admin_reply}</p>
          </div>
        )}
      </div>

      {/* Controls row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Quick status/priority */}
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">Quick Actions</h2>
          <div>
            <label className="text-xs text-slate-400 dark:text-white/30 block mb-1">Status</label>
            <select value={statusVal} onChange={e => setStatusVal(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none">
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 dark:text-white/30 block mb-1">Priority</label>
            <select value={priorityVal} onChange={e => setPriorityVal(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none">
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <button onClick={updateMeta} disabled={metaSaving}
            className="w-full py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-white/70 transition-colors disabled:opacity-50">
            {metaSaving ? "Saving…" : "Update"}
          </button>
        </div>

        {/* Reply form */}
        <form onSubmit={submitReply} className="md:col-span-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-white/70">
            {ticket.admin_reply ? "Edit Reply" : "Write Reply"}
          </h2>
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            rows={6}
            placeholder="Type your reply to the user…"
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
          />
          <div className="flex items-center gap-3">
            <select value={replyStatus} onChange={e => setReplyStatus(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none">
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
            <button type="submit" disabled={saving || !reply.trim()}
              className="flex-1 py-2 text-sm font-semibold rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50">
              {saving ? "Saving…" : "Send Reply"}
            </button>
          </div>
          {saveMsg && (
            <p className={`text-xs font-medium ${saveMsg.startsWith("Error") ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
              {saveMsg}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
