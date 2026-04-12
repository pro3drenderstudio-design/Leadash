"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getWorkspaceId } from "@/lib/workspace/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  ticket_number: number;
  subject: string;
  category: string;
  priority: string;
  status: string;
  message: string;
  admin_reply: string | null;
  admin_replied_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "billing",         label: "Billing & Payments",   icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" },
  { value: "technical",       label: "Technical Issue",       icon: "M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" },
  { value: "feature_request", label: "Feature Request",       icon: "M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" },
  { value: "bug",             label: "Bug Report",            icon: "M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0112 12.75zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44.125 2.104.52 4.136 1.153 6.06M12 12.75a2.25 2.25 0 002.248-2.354M12 12.75a2.25 2.25 0 01-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 00-.399-2.25M12 8.25c-.995 0-1.97-.08-2.922-.236-.402-.066-.74-.358-.795-.762a3.778 3.778 0 01.4-2.25m0 0a3.44 3.44 0 011.524-.57M12 8.25a3.44 3.44 0 00-1.524-.57m0 0a3.44 3.44 0 00-2.476 1.07M8.5 5.93a3.44 3.44 0 012.476-1.07" },
  { value: "general",         label: "General Question",      icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" },
];

const PRIORITIES = [
  { value: "low",    label: "Low",    color: "text-white/40" },
  { value: "medium", label: "Medium", color: "text-blue-400" },
  { value: "high",   label: "High",   color: "text-amber-400" },
  { value: "urgent", label: "Urgent", color: "text-red-400" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  open:            { label: "Open",             color: "bg-blue-500/15 text-blue-300 border-blue-500/20",     dot: "bg-blue-400" },
  in_progress:     { label: "In Progress",      color: "bg-amber-500/15 text-amber-300 border-amber-500/20", dot: "bg-amber-400" },
  waiting_on_you:  { label: "Waiting on you",   color: "bg-purple-500/15 text-purple-300 border-purple-500/20", dot: "bg-purple-400" },
  resolved:        { label: "Resolved",         color: "bg-green-500/15 text-green-300 border-green-500/20", dot: "bg-green-400" },
  closed:          { label: "Closed",           color: "bg-white/5 text-white/30 border-white/10",           dot: "bg-white/20" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SupportPage() {
  const [view, setView]             = useState<"list" | "new" | "detail">("list");
  const [tickets, setTickets]       = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState<string>("all");

  // Form state
  const [subject, setSubject]       = useState("");
  const [message, setMessage]       = useState("");
  const [category, setCategory]     = useState("general");
  const [priority, setPriority]     = useState("medium");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted]   = useState(false);

  const wsId = () => getWorkspaceId() ?? "";

  useEffect(() => {
    fetch("/api/support/tickets", { headers: { "x-workspace-id": wsId() } })
      .then(r => r.json())
      .then(d => setTickets(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": wsId() },
        body: JSON.stringify({ subject, message, category, priority }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit");
      setTickets(prev => [data, ...prev]);
      setSubmitted(true);
      setSubject(""); setMessage(""); setCategory("general"); setPriority("medium");
      setTimeout(() => { setSubmitted(false); setView("list"); }, 2500);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = filter === "all" ? tickets : tickets.filter(t => t.status === filter);
  const openCount = tickets.filter(t => t.status === "open" || t.status === "in_progress" || t.status === "waiting_on_you").length;

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (view === "detail" && selectedTicket) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <button onClick={() => { setView("list"); setSelectedTicket(null); }} className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm transition-colors mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>
          Back to tickets
        </button>

        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-white/30 text-xs font-mono">#{selectedTicket.ticket_number}</span>
              <StatusBadge status={selectedTicket.status} />
            </div>
            <h1 className="text-xl font-bold text-white">{selectedTicket.subject}</h1>
            <p className="text-white/30 text-xs mt-1">
              {CATEGORIES.find(c => c.value === selectedTicket.category)?.label ?? selectedTicket.category}
              {" · "}Submitted {timeAgo(selectedTicket.created_at)}
            </p>
          </div>
        </div>

        {/* Conversation thread */}
        <div className="space-y-4">
          {/* User message */}
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-500/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-blue-300">
              Y
            </div>
            <div className="flex-1 bg-white/4 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3">
              <p className="text-white/40 text-xs mb-2 font-medium">You · {timeAgo(selectedTicket.created_at)}</p>
              <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">{selectedTicket.message}</p>
            </div>
          </div>

          {/* Admin reply */}
          {selectedTicket.admin_reply ? (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600/30 border border-emerald-500/30 flex items-center justify-center flex-shrink-0 flex-shrink-0">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div className="flex-1 bg-emerald-500/8 border border-emerald-500/20 rounded-2xl rounded-tl-sm px-4 py-3">
                <p className="text-emerald-400/60 text-xs mb-2 font-medium">
                  Leadash Support · {selectedTicket.admin_replied_at ? timeAgo(selectedTicket.admin_replied_at) : ""}
                </p>
                <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">{selectedTicket.admin_reply}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-4 px-4 bg-white/2 border border-white/6 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <p className="text-white/35 text-sm">Waiting for a reply from our team. We typically respond within 24 hours.</p>
            </div>
          )}
        </div>

        {/* Status indicators */}
        {selectedTicket.status === "waiting_on_you" && (
          <div className="mt-6 p-4 bg-purple-500/8 border border-purple-500/25 rounded-xl">
            <p className="text-purple-300 text-sm font-medium">Action needed</p>
            <p className="text-purple-300/60 text-xs mt-0.5">Our team is waiting for more information from you. Please reply via email or submit a new ticket with more details.</p>
          </div>
        )}
      </div>
    );
  }

  // ── New ticket form ──────────────────────────────────────────────────────────
  if (view === "new") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <button onClick={() => setView("list")} className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm transition-colors mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>
          Back
        </button>

        <h1 className="text-xl font-bold text-white mb-1">Submit a ticket</h1>
        <p className="text-white/40 text-sm mb-8">Describe your issue and we'll get back to you within 24 hours.</p>

        {submitted ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white font-semibold text-lg mb-2">Ticket submitted!</p>
            <p className="text-white/40 text-sm">We'll review it and respond within 24 hours. Redirecting…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Category */}
            <div>
              <label className="block text-white/50 text-xs font-medium mb-3">Category</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      category === cat.value
                        ? "bg-blue-600/15 border-blue-500/40 text-blue-300"
                        : "bg-white/3 border-white/8 text-white/50 hover:border-white/15 hover:text-white/70"
                    }`}
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={cat.icon} />
                    </svg>
                    <span className="text-xs font-medium leading-tight">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-white/50 text-xs font-medium mb-3">Priority</label>
              <div className="flex gap-2">
                {PRIORITIES.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      priority === p.value
                        ? `bg-white/10 border-white/20 ${p.color}`
                        : "bg-white/3 border-white/8 text-white/30 hover:border-white/15"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-white/25 text-xs mt-1.5">
                {priority === "urgent" ? "Use for outages or account lockouts only." :
                 priority === "high" ? "Use for issues blocking your workflow." :
                 priority === "medium" ? "For most issues — bugs, unexpected behavior." :
                 "For non-urgent questions and minor issues."}
              </p>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-white/50 text-xs font-medium mb-1.5">Subject</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Brief description of the issue"
                maxLength={120}
                className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors"
                required
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-white/50 text-xs font-medium mb-1.5">Details</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={"Describe what happened, what you expected, and any error messages you saw.\n\nThe more detail you provide, the faster we can help."}
                rows={6}
                className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors resize-none"
                required
              />
            </div>

            {submitError && <p className="text-red-400 text-sm">{submitError}</p>}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting || !subject.trim() || !message.trim()}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2"
              >
                {submitting && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                )}
                {submitting ? "Submitting…" : "Submit ticket"}
              </button>
              <button type="button" onClick={() => setView("list")} className="text-white/40 hover:text-white/70 text-sm transition-colors">Cancel</button>
            </div>
          </form>
        )}
      </div>
    );
  }

  // ── Ticket list ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Support</h1>
          <p className="text-white/40 text-sm">Get help from the Leadash team. We respond within 24 hours.</p>
        </div>
        <button
          onClick={() => setView("new")}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New ticket
        </button>
      </div>

      {/* Contact options */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {[
          {
            icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75",
            title: "Email support",
            desc: "support@leadash.com",
            action: () => { window.location.href = "mailto:support@leadash.com"; },
            color: "blue",
          },
          {
            icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
            title: "Submit a ticket",
            desc: "Track your issue",
            action: () => setView("new"),
            color: "purple",
          },
          {
            icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z",
            title: "Help Center",
            desc: "Browse articles & FAQs",
            action: () => { window.location.href = "/help"; },
            color: "emerald",
          },
        ].map(card => (
          <button
            key={card.title}
            onClick={card.action}
            className={`flex items-start gap-3 p-4 bg-white/3 border border-white/8 rounded-xl hover:border-white/15 hover:bg-white/5 transition-all text-left`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
              card.color === "blue" ? "bg-blue-500/15" : card.color === "purple" ? "bg-purple-500/15" : "bg-emerald-500/15"
            }`}>
              <svg className={`w-4 h-4 ${
                card.color === "blue" ? "text-blue-400" : card.color === "purple" ? "text-purple-400" : "text-emerald-400"
              }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
              </svg>
            </div>
            <div>
              <p className="text-white text-sm font-medium">{card.title}</p>
              <p className="text-white/35 text-xs mt-0.5">{card.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Tickets section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white/60 text-sm font-semibold">
            Your tickets
            {openCount > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs bg-blue-600/20 text-blue-400 border border-blue-500/30">{openCount} open</span>
            )}
          </h2>
          {/* Filter tabs */}
          <div className="flex gap-1 bg-white/4 rounded-lg p-0.5">
            {[
              { value: "all",           label: "All" },
              { value: "open",          label: "Open" },
              { value: "in_progress",   label: "In Progress" },
              { value: "resolved",      label: "Resolved" },
            ].map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${filter === f.value ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-16 bg-white/4 rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-white/6 rounded-xl bg-white/2">
            <svg className="w-12 h-12 text-white/15 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
            </svg>
            <p className="text-white/30 text-sm">
              {filter === "all" ? "No tickets yet." : `No ${filter.replace("_", " ")} tickets.`}
            </p>
            {filter === "all" && (
              <button onClick={() => setView("new")} className="mt-4 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-sm font-medium rounded-xl transition-colors">
                Submit your first ticket →
              </button>
            )}
          </div>
        ) : (
          <div className="border border-white/8 rounded-xl overflow-hidden">
            {filtered.map((ticket, i) => (
              <button
                key={ticket.id}
                onClick={() => { setSelectedTicket(ticket); setView("detail"); }}
                className={`w-full flex items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-white/3 ${i > 0 ? "border-t border-white/6" : ""} ${ticket.admin_reply && ticket.status !== "resolved" ? "bg-blue-500/3" : ""}`}
              >
                {/* Category icon */}
                <div className="w-8 h-8 rounded-lg bg-white/6 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={CATEGORIES.find(c => c.value === ticket.category)?.icon ?? CATEGORIES[4].icon} />
                  </svg>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-white text-sm font-medium truncate">{ticket.subject}</span>
                    {ticket.admin_reply && ticket.status !== "resolved" && (
                      <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-400" title="New reply" />
                    )}
                  </div>
                  <p className="text-white/30 text-xs">
                    #{ticket.ticket_number} · {CATEGORIES.find(c => c.value === ticket.category)?.label} · {timeAgo(ticket.created_at)}
                  </p>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={ticket.status} />
                  <svg className="w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* SLA note */}
      <div className="mt-8 flex items-center gap-3 px-4 py-3 bg-white/2 border border-white/6 rounded-xl">
        <svg className="w-4 h-4 text-white/25 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-white/25 text-xs">We respond to all tickets within <span className="text-white/40">24 hours</span>. Urgent issues typically within <span className="text-white/40">4 hours</span>.</p>
      </div>
    </div>
  );
}
