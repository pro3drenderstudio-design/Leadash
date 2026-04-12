"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  getCrmThreads, addNote, updateCrmStatus, suggestReply,
  getCrmUnmatched, ignoreCrmUnmatched, matchReply, promoteUnmatched,
  getCrmFilters, createCrmFilter, deleteCrmFilter,
  triggerSendBatch, sendCrmReply,
} from "@/lib/outreach/api";
import type { CrmThread, CrmStatus, OutreachReply, OutreachCrmFilter } from "@/types/outreach";

// ─── Constants ────────────────────────────────────────────────────────────────

const CRM_STATUSES: { value: CrmStatus; label: string; color: string }[] = [
  { value: "neutral",        label: "Neutral",        color: "text-white/50 bg-white/8 border-white/15" },
  { value: "interested",     label: "Interested",     color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" },
  { value: "meeting_booked", label: "Meeting Booked", color: "text-blue-400 bg-blue-500/15 border-blue-500/30" },
  { value: "won",            label: "Won",            color: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30" },
  { value: "not_interested", label: "Not Interested", color: "text-red-400 bg-red-500/15 border-red-500/30" },
  { value: "ooo",            label: "OOO",            color: "text-orange-400 bg-orange-500/15 border-orange-500/30" },
  { value: "follow_up",      label: "Follow Up",      color: "text-violet-400 bg-violet-500/15 border-violet-500/30" },
];

const FILTER_TYPES = [
  { value: "phrase",         label: "Phrase in body or subject" },
  { value: "subject_phrase", label: "Subject phrase" },
  { value: "sender_email",   label: "Sender email" },
  { value: "sender_domain",  label: "Sender domain" },
];

const QUICK_FILTERS: Array<Omit<OutreachCrmFilter, "id" | "created_at" | "workspace_id">> = [
  { name: "Auto-reply",    type: "phrase",         value: "auto-reply",     action: "exclude",      auto_status: null },
  { name: "Out of office", type: "phrase",         value: "out of office",  action: "auto_status",  auto_status: "ooo" },
  { name: "Unsubscribe",   type: "phrase",         value: "unsubscribe",    action: "exclude",      auto_status: null },
  { name: "No reply",      type: "subject_phrase", value: "no-reply",       action: "exclude",      auto_status: null },
  { name: "Vacation",      type: "phrase",         value: "on vacation",    action: "auto_status",  auto_status: "ooo" },
];

type MainTab = "inbox" | "unmatched" | "filters";

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status, onClick }: { status: CrmStatus; onClick?: () => void }) {
  const s = CRM_STATUSES.find((x) => x.value === status) ?? CRM_STATUSES[0];
  return (
    <button onClick={onClick} className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${s.color} ${onClick ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}>
      {s.label}
    </button>
  );
}

function AiBadge({ category, confidence }: { category: string | null; confidence: number | null }) {
  if (!category || category === "neutral" || (confidence ?? 0) < 0.7) return null;
  const s = CRM_STATUSES.find((x) => x.value === category);
  if (!s) return null;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${s.color} opacity-80`} title="AI categorized">
      AI
    </span>
  );
}

function timeAgo(ts: string | null | undefined): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CrmClient() {
  const [mainTab, setMainTab] = useState<MainTab>("inbox");

  // ── Inbox state ────────────────────────────────────────────────────────────
  const [threads, setThreads]           = useState<CrmThread[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [selected, setSelected]         = useState<CrmThread | null>(null);
  const [filterStatus, setFilterStatus] = useState<CrmStatus | "all">("all");
  const [search, setSearch]             = useState("");
  const [noteBody, setNoteBody]         = useState("");
  const [savingNote, setSavingNote]     = useState(false);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [suggestion, setSuggestion]     = useState<string | null>(null);
  const [suggesting, setSuggesting]     = useState(false);
  const [replyCollapsed, setReplyCollapsed] = useState(false);
  const [sentCollapsed, setSentCollapsed]   = useState(false);
  const [composeBody, setComposeBody]       = useState("");
  const [sending, setSending]               = useState(false);
  const [sendError, setSendError]           = useState<string | null>(null);
  const [sendSuccess, setSendSuccess]       = useState(false);
  const [triggering, setTriggering]     = useState(false);
  const [triggerMsg, setTriggerMsg]     = useState<string | null>(null);
  const [pollDetails, setPollDetails]   = useState<Array<{ email: string; fetched: number; matched: number; unmatched: number; error?: string }>>([]);
  const [showPollDetails, setShowPollDetails] = useState(false);
  const noteRef   = useRef<HTMLTextAreaElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Unmatched state ────────────────────────────────────────────────────────
  const [unmatched, setUnmatched]         = useState<(OutreachReply & { inbox: { id: string; label: string | null; email_address: string } | null })[]>([]);
  const [unmatchedLoading, setUnmatchedLoading] = useState(false);
  const [selectedUnmatched, setSelectedUnmatched] = useState<typeof unmatched[0] | null>(null);
  const [matchSearch, setMatchSearch]     = useState("");
  const [matchResults, setMatchResults]   = useState<CrmThread[]>([]);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matching, setMatching]           = useState(false);
  const [promoting, setPromoting]         = useState(false);
  const [unmatchedCompose, setUnmatchedCompose] = useState("");
  const [unmatchedSending, setUnmatchedSending] = useState(false);
  const [unmatchedSendErr, setUnmatchedSendErr] = useState<string | null>(null);
  const [unmatchedSendOk, setUnmatchedSendOk]   = useState(false);

  // ── Filters state ──────────────────────────────────────────────────────────
  const [filters, setFilters]       = useState<OutreachCrmFilter[]>([]);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [showAddFilter, setShowAddFilter]   = useState(false);
  const [newFilter, setNewFilter]   = useState<Omit<OutreachCrmFilter, "id" | "created_at" | "workspace_id">>({
    name: "", type: "phrase", value: "", action: "exclude", auto_status: null,
  });
  const [savingFilter, setSavingFilter] = useState(false);

  // ── Load threads ──────────────────────────────────────────────────────────
  const loadThreads = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    const data = await getCrmThreads();
    setThreads(data.threads);
    if (!silent) setLoading(false); else setRefreshing(false);
  }, []);

  useEffect(() => {
    loadThreads();
    intervalRef.current = setInterval(() => loadThreads(true), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadThreads]);

  useEffect(() => {
    if (selected) {
      const updated = threads.find((t) => t.enrollment_id === selected.enrollment_id);
      if (updated) setSelected(updated);
    }
  }, [threads]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load unmatched ────────────────────────────────────────────────────────
  useEffect(() => {
    if (mainTab === "unmatched" && unmatched.length === 0) {
      setUnmatchedLoading(true);
      getCrmUnmatched().then((d) => { setUnmatched(d); setUnmatchedLoading(false); });
    }
  }, [mainTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load filters ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mainTab === "filters") {
      setFiltersLoading(true);
      getCrmFilters().then((d) => { setFilters(d); setFiltersLoading(false); });
    }
  }, [mainTab]);

  // ── Inbox actions ─────────────────────────────────────────────────────────
  async function handleAddNote() {
    if (!selected || !noteBody.trim()) return;
    setSavingNote(true);
    await addNote(selected.enrollment_id, noteBody.trim());
    const newNote = { id: Date.now().toString(), lead_id: selected.lead.id, body: noteBody.trim(), created_at: new Date().toISOString() };
    const update = (t: CrmThread) => t.enrollment_id === selected.enrollment_id ? { ...t, notes: [...(t.notes ?? []), newNote] } : t;
    setThreads((ts) => ts.map(update));
    setSelected((prev) => prev ? { ...prev, notes: [...(prev.notes ?? []), newNote] } : prev);
    setNoteBody("");
    setSavingNote(false);
  }

  async function handleStatusChange(status: CrmStatus) {
    if (!selected) return;
    setUpdatingStatus(true);
    setStatusDropdown(false);
    await updateCrmStatus(selected.enrollment_id, status);
    const update = (t: CrmThread) => t.enrollment_id === selected.enrollment_id ? { ...t, crm_status: status } : t;
    setThreads((ts) => ts.map(update));
    setSelected((prev) => prev ? { ...prev, crm_status: status } : prev);
    setUpdatingStatus(false);
  }

  async function handleSuggestReply() {
    if (!selected) return;
    setSuggesting(true);
    setSuggestion(null);
    const { suggestion: text, error } = await suggestReply(selected.enrollment_id);
    setSuggestion(error ? `Error: ${error}` : (text ?? "No suggestion generated"));
    setSuggesting(false);
  }

  async function handleSendReply() {
    if (!selected || !composeBody.trim()) return;
    setSending(true);
    setSendError(null);
    setSendSuccess(false);
    const result = await sendCrmReply(selected.enrollment_id, composeBody.trim());
    if (result.error) {
      setSendError(result.error);
    } else {
      setSendSuccess(true);
      setComposeBody("");
      setTimeout(() => setSendSuccess(false), 3000);
    }
    setSending(false);
  }

  async function handleTrigger() {
    setTriggering(true);
    setTriggerMsg(null);
    setPollDetails([]);
    setShowPollDetails(false);
    const r = await triggerSendBatch();
    const hasErrors = r.replies.details?.some((d) => d.error);
    setTriggerMsg(`Sent ${r.sends.sent} · Replies found ${r.replies.matched}`);
    if (r.replies.details?.length) {
      setPollDetails(r.replies.details);
      if (hasErrors) setShowPollDetails(true);
    }
    setTriggering(false);
    loadThreads(true);
    if (mainTab === "unmatched") {
      getCrmUnmatched().then(setUnmatched);
    }
  }

  // ── Unmatched actions ─────────────────────────────────────────────────────
  async function handleIgnore(id: string) {
    await ignoreCrmUnmatched(id);
    setUnmatched((prev) => prev.filter((u) => u.id !== id));
    if (selectedUnmatched?.id === id) setSelectedUnmatched(null);
  }

  async function handlePromote(replyId: string) {
    setPromoting(true);
    const result = await promoteUnmatched(replyId);
    setPromoting(false);
    if (result.error) { alert(`Failed to promote: ${result.error}`); return; }
    setUnmatched((prev) => prev.filter((u) => u.id !== replyId));
    setSelectedUnmatched(null);
    setUnmatchedCompose("");
    setUnmatchedSendErr(null);
    setUnmatchedSendOk(false);
    await loadThreads();
    setMainTab("inbox");
  }

  async function handleUnmatchedSend() {
    if (!selectedUnmatched || !unmatchedCompose.trim()) return;
    // Promote first (creates enrollment), then send reply
    setUnmatchedSending(true);
    setUnmatchedSendErr(null);
    setUnmatchedSendOk(false);
    const promoted = await promoteUnmatched(selectedUnmatched.id);
    if (promoted.error || !promoted.enrollment_id) {
      setUnmatchedSendErr(promoted.error ?? "Failed to create thread");
      setUnmatchedSending(false);
      return;
    }
    const sent = await sendCrmReply(promoted.enrollment_id, unmatchedCompose.trim());
    if (sent.error) {
      setUnmatchedSendErr(sent.error);
      setUnmatchedSending(false);
      return;
    }
    setUnmatchedSendOk(true);
    setUnmatchedCompose("");
    setUnmatched((prev) => prev.filter((u) => u.id !== selectedUnmatched.id));
    setSelectedUnmatched(null);
    await loadThreads();
    setMainTab("inbox");
  }

  async function handleMatch(replyId: string, enrollmentId: string) {
    setMatching(true);
    await matchReply(replyId, enrollmentId);
    setUnmatched((prev) => prev.filter((u) => u.id !== replyId));
    setSelectedUnmatched(null);
    setShowMatchModal(false);
    setMatching(false);
    loadThreads(true);
  }

  // ── Filter actions ────────────────────────────────────────────────────────
  async function handleAddFilter(data: Omit<OutreachCrmFilter, "id" | "created_at" | "workspace_id">) {
    setSavingFilter(true);
    const created = await createCrmFilter(data);
    setFilters((prev) => [...prev, created]);
    setShowAddFilter(false);
    setNewFilter({ name: "", type: "phrase", value: "", action: "exclude", auto_status: null });
    setSavingFilter(false);
  }

  async function handleDeleteFilter(id: string) {
    await deleteCrmFilter(id);
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const filteredThreads = threads.filter((t) => {
    const matchesStatus = filterStatus === "all" || t.crm_status === filterStatus;
    const q = search.toLowerCase();
    const matchesSearch = !q || [t.lead.first_name, t.lead.last_name, t.lead.email, t.lead.company].filter(Boolean).join(" ").toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const matchSearchResults = matchSearch.length >= 2
    ? threads.filter((t) => {
        const q = matchSearch.toLowerCase();
        return [t.lead.first_name, t.lead.last_name, t.lead.email, t.lead.company].filter(Boolean).join(" ").toLowerCase().includes(q);
      })
    : [];

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Top nav: tabs + actions */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-white/8 bg-white/2">
        <div className="flex gap-1">
          {(["inbox", "unmatched", "filters"] as MainTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setMainTab(t)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${mainTab === t ? "bg-white/12 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              {t}
              {t === "unmatched" && unmatched.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-[9px] rounded-full">{unmatched.length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {triggerMsg && (
            <button
              onClick={() => pollDetails.length > 0 && setShowPollDetails((v) => !v)}
              className={`text-xs transition-colors ${pollDetails.some((d) => d.error) ? "text-red-400 hover:text-red-300 cursor-pointer" : "text-white/40"}`}
              title={pollDetails.length > 0 ? "Click to toggle inbox details" : undefined}
            >
              {triggerMsg}{pollDetails.some((d) => d.error) ? " ⚠" : ""}
            </button>
          )}
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-40 text-blue-300 text-xs font-semibold rounded-lg transition-colors"
          >
            {triggering ? "Running…" : "⚡ Poll Now"}
          </button>
        </div>
      </div>

      {/* ── Poll details panel ──────────────────────────────────────────────── */}
      {showPollDetails && pollDetails.length > 0 && (
        <div className="mx-4 mb-2 rounded-lg border border-white/10 bg-white/5 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
            <span className="text-xs font-semibold text-white/70">Inbox Poll Details</span>
            <button onClick={() => setShowPollDetails(false)} className="text-white/30 hover:text-white/60 text-xs">✕</button>
          </div>
          <div className="divide-y divide-white/5">
            {pollDetails.map((d) => (
              <div key={d.email} className="px-3 py-2 flex items-start gap-3 text-xs">
                <span className="text-white/60 flex-1 min-w-0 truncate">{d.email}</span>
                <span className="text-white/40 whitespace-nowrap">fetched {d.fetched} · matched {d.matched} · unmatched {d.unmatched}</span>
                {d.error && <span className="text-red-400 flex-shrink-0 max-w-xs truncate" title={d.error}>⚠ {d.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── INBOX TAB ────────────────────────────────────────────────────────── */}
      {mainTab === "inbox" && (
        <div className="flex flex-1 overflow-hidden" onClick={() => setStatusDropdown(false)}>

          {/* Thread list */}
          <div className="w-80 flex-shrink-0 border-r border-white/8 flex flex-col overflow-hidden">
            <div className="px-3 py-2.5 border-b border-white/8 space-y-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:border-blue-500/40"
                />
                <button onClick={() => loadThreads(true)} disabled={refreshing} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/6 hover:bg-white/12 text-white/50 hover:text-white transition-colors disabled:opacity-40">
                  <svg className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
              <div className="flex gap-1 flex-wrap">
                <button onClick={() => setFilterStatus("all")} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${filterStatus === "all" ? "bg-white/15 text-white border-white/20" : "text-white/30 border-white/10 hover:border-white/20"}`}>All</button>
                {CRM_STATUSES.filter((s) => s.value !== "neutral").map((s) => (
                  <button key={s.value} onClick={() => setFilterStatus(filterStatus === s.value ? "all" : s.value)} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${filterStatus === s.value ? s.color : "text-white/30 border-white/10 hover:border-white/20"}`}>{s.label}</button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-white/5">
              {loading ? (
                [1,2,3,4,5].map((i) => <div key={i} className="h-16 bg-white/4 m-3 rounded-xl animate-pulse" />)
              ) : filteredThreads.length === 0 ? (
                <div className="text-center py-16 text-white/30 px-6">
                  <div className="text-3xl mb-3">💬</div>
                  <p className="text-sm font-medium">{search ? "No matching threads" : "No replies yet"}</p>
                </div>
              ) : filteredThreads.map((t) => {
                const replyFrom = t.latest_reply?.from_email;
                const differentEmail = replyFrom && replyFrom.toLowerCase() !== t.lead.email.toLowerCase();
                return (
                  <button
                    key={t.enrollment_id}
                    onClick={() => { setSelected(t); setSuggestion(null); setReplyCollapsed(false); setSentCollapsed(!!t.latest_reply); setComposeBody(""); setSendError(null); setSendSuccess(false); }}
                    className={`w-full text-left px-4 py-3.5 hover:bg-white/4 transition-colors ${selected?.enrollment_id === t.enrollment_id ? "bg-blue-600/10 border-r-2 border-blue-500" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-medium truncate">{[t.lead.first_name, t.lead.last_name].filter(Boolean).join(" ") || t.lead.email}</p>
                        <p className="text-white/40 text-xs truncate">{t.lead.email}</p>
                        {differentEmail && <p className="text-amber-400/60 text-[10px] truncate">replied from {replyFrom}</p>}
                        {t.lead.company && <p className="text-white/25 text-xs truncate">{t.lead.company}</p>}
                      </div>
                      <div className="text-right flex-shrink-0 space-y-1">
                        <p className="text-white/30 text-[10px]">{timeAgo(t.replied_at)}</p>
                        <div className="flex items-center gap-1 justify-end">
                          <AiBadge category={t.latest_reply?.ai_category ?? null} confidence={t.latest_reply?.ai_confidence ?? null} />
                          <StatusBadge status={t.crm_status ?? "neutral"} />
                        </div>
                      </div>
                    </div>
                    {t.latest_reply?.body_text ? (
                      <p className="text-emerald-400/50 text-xs mt-1.5 line-clamp-1">{t.latest_reply.body_text.slice(0, 80)}</p>
                    ) : (
                      <p className="text-white/30 text-xs mt-1.5 line-clamp-1">{t.latest_send?.subject}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail panel */}
          {selected ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Contact header */}
              <div className="flex-shrink-0 px-6 py-4 border-b border-white/8 bg-white/2">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-white uppercase">{(selected.lead.first_name?.[0] ?? selected.lead.email[0]).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-white font-semibold text-base">{[selected.lead.first_name, selected.lead.last_name].filter(Boolean).join(" ") || selected.lead.email}</h2>
                    <p className="text-white/40 text-xs">{selected.lead.email}</p>
                    {(selected.lead.company || selected.lead.title) && (
                      <p className="text-white/30 text-xs mt-0.5">{[selected.lead.title, selected.lead.company].filter(Boolean).join(" at ")}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="relative">
                      <div onClick={(e) => { e.stopPropagation(); setStatusDropdown((v) => !v); }} className="cursor-pointer flex items-center gap-1.5">
                        <StatusBadge status={selected.crm_status ?? "neutral"} onClick={() => {}} />
                        {updatingStatus && <span className="text-white/30 text-xs">…</span>}
                        {selected.latest_reply?.ai_category && selected.latest_reply.ai_category !== "neutral" && (selected.latest_reply.ai_confidence ?? 0) >= 0.7 && (
                          <span className="text-white/30 text-[9px]" title={`AI confidence: ${Math.round((selected.latest_reply.ai_confidence ?? 0) * 100)}%`}>AI ✓</span>
                        )}
                      </div>
                      {statusDropdown && (
                        <div className="absolute right-0 top-8 z-30 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl py-1 min-w-44" onClick={(e) => e.stopPropagation()}>
                          {CRM_STATUSES.map((s) => (
                            <button key={s.value} onClick={() => handleStatusChange(s.value)} className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-white/6 transition-colors ${selected.crm_status === s.value ? "opacity-60" : ""}`}>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${s.color}`}>{s.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-white/50 text-xs font-medium">{selected.campaign.name}</p>
                      <p className="text-white/25 text-[10px] mt-0.5">Replied {timeAgo(selected.replied_at)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Email thread */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                {/* Sent email bubble — right aligned */}
                {selected.latest_send && (
                  <div className="flex flex-col items-end">
                    <div className="max-w-[85%] w-full">
                      <div className="flex items-center justify-end gap-2 mb-1.5">
                        <span className="text-white/30 text-[10px]">
                          {selected.latest_send.sent_at ? new Date(selected.latest_send.sent_at).toLocaleString() : ""}
                        </span>
                        {selected.latest_send.opened_at && <span className="text-emerald-400/60 text-[10px]">Opened</span>}
                        <span className="text-blue-300/50 text-[10px] font-medium">You</span>
                      </div>
                      <button
                        className="w-full text-left"
                        onClick={() => setSentCollapsed((v) => !v)}
                      >
                        <div className="bg-blue-600/15 border border-blue-500/25 rounded-2xl rounded-tr-sm overflow-hidden">
                          <div className="px-4 py-2.5 border-b border-blue-500/15 flex items-center justify-between gap-2">
                            <p className="text-blue-200/80 text-xs font-medium truncate">{selected.latest_send.subject}</p>
                            <span className="text-blue-300/30 text-[10px] flex-shrink-0">{sentCollapsed ? "▸" : "▾"}</span>
                          </div>
                          {!sentCollapsed && (
                            <div className="p-4">
                              {selected.latest_send.body?.trim().startsWith("<") ? (
                                <iframe
                                  srcDoc={`<html><head><style>body{margin:0;font-family:sans-serif;font-size:13px;color:#ccc;background:transparent;line-height:1.6}a{color:#7dd3fc}*{max-width:100%}</style></head><body>${selected.latest_send.body}</body></html>`}
                                  sandbox="allow-same-origin"
                                  className="w-full border-0 min-h-[80px]"
                                  style={{ height: "auto" }}
                                  onLoad={(e) => {
                                    const iframe = e.currentTarget;
                                    if (iframe.contentDocument?.body) {
                                      iframe.style.height = iframe.contentDocument.body.scrollHeight + "px";
                                    }
                                  }}
                                />
                              ) : (
                                <pre className="text-blue-100/60 text-xs whitespace-pre-wrap font-sans leading-relaxed">{selected.latest_send.body}</pre>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {/* Their reply bubble — left aligned */}
                {selected.latest_reply && (
                  <div className="flex flex-col items-start">
                    <div className="max-w-[85%] w-full">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-emerald-300/60 text-[10px] font-medium">
                          {selected.latest_reply.from_name || selected.latest_reply.from_email}
                        </span>
                        {selected.latest_reply.from_email !== selected.lead.email && (
                          <span className="text-amber-400/50 text-[10px]">({selected.latest_reply.from_email})</span>
                        )}
                        <span className="text-white/30 text-[10px]">
                          {new Date(selected.latest_reply.received_at).toLocaleString()}
                        </span>
                        {selected.latest_reply.ai_category && selected.latest_reply.ai_category !== "neutral" && (selected.latest_reply.ai_confidence ?? 0) >= 0.7 && (
                          <span className="text-emerald-400/50 text-[10px]">
                            AI: {selected.latest_reply.ai_category.replace(/_/g, " ")} {Math.round((selected.latest_reply.ai_confidence ?? 0) * 100)}%
                          </span>
                        )}
                      </div>
                      <button className="w-full text-left" onClick={() => setReplyCollapsed((v) => !v)}>
                        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl rounded-tl-sm overflow-hidden">
                          <div className="px-4 py-2.5 border-b border-emerald-500/15 flex items-center justify-between gap-2">
                            <p className="text-emerald-200/70 text-xs font-medium truncate">
                              {selected.latest_reply.subject ?? `Re: ${selected.latest_send?.subject ?? ""}`}
                            </p>
                            <span className="text-emerald-300/30 text-[10px] flex-shrink-0">{replyCollapsed ? "▸" : "▾"}</span>
                          </div>
                          {!replyCollapsed && (
                            <div className="p-4 space-y-3">
                              <pre className="text-emerald-100/75 text-sm whitespace-pre-wrap font-sans leading-relaxed">
                                {selected.latest_reply.body_text ?? "(No body captured — reply detected via header matching)"}
                              </pre>
                              {selected.latest_reply.attachments?.length > 0 && (
                                <div className="border-t border-emerald-500/15 pt-3 space-y-1.5">
                                  <p className="text-emerald-300/40 text-[10px] font-semibold uppercase tracking-wider">
                                    {selected.latest_reply.attachments.length} attachment{selected.latest_reply.attachments.length > 1 ? "s" : ""}
                                  </p>
                                  {selected.latest_reply.attachments.map((att, i) => (
                                    <a
                                      key={i}
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-emerald-500/8 hover:bg-emerald-500/14 border border-emerald-500/15 hover:border-emerald-500/25 transition-colors group"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-400/60 flex-shrink-0">
                                        <path fillRule="evenodd" d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z" clipRule="evenodd"/>
                                      </svg>
                                      <span className="text-emerald-200/70 text-xs truncate flex-1">{att.name}</span>
                                      <span className="text-emerald-300/30 text-[10px] flex-shrink-0">
                                        {att.size < 1024 ? `${att.size} B` : att.size < 1_048_576 ? `${(att.size / 1024).toFixed(1)} KB` : `${(att.size / 1_048_576).toFixed(1)} MB`}
                                      </span>
                                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-emerald-400/30 group-hover:text-emerald-400/60 flex-shrink-0 transition-colors">
                                        <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd"/>
                                      </svg>
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {/* AI Reply Suggestion */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-white/30 uppercase tracking-wider">AI Suggestion</h3>
                    <button onClick={handleSuggestReply} disabled={suggesting} className="px-3 py-1 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5">
                      {suggesting ? <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generating…</> : <>✦ Suggest</>}
                    </button>
                  </div>
                  {suggestion && (
                    <div className={`border rounded-xl p-4 space-y-3 ${suggestion.startsWith("Error") ? "border-red-500/20 bg-red-500/8" : "border-violet-500/20 bg-violet-500/8"}`}>
                      <p className={`text-sm whitespace-pre-wrap ${suggestion.startsWith("Error") ? "text-red-400" : "text-white/70"}`}>{suggestion}</p>
                      {!suggestion.startsWith("Error") && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setComposeBody(suggestion); setSuggestion(null); }}
                            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            Use as Reply
                          </button>
                          <button onClick={() => { setNoteBody(suggestion); setSuggestion(null); noteRef.current?.focus(); }} className="px-3 py-1.5 bg-white/6 hover:bg-white/10 text-white/50 text-xs rounded-lg transition-colors">Use as Note</button>
                          <button onClick={() => setSuggestion(null)} className="px-3 py-1.5 bg-white/6 hover:bg-white/10 text-white/50 text-xs rounded-lg transition-colors">Dismiss</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div className="pt-1">
                  <h3 className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">Notes</h3>
                  {(selected.notes?.length ?? 0) > 0 && (
                    <div className="space-y-2 mb-3">
                      {(selected.notes ?? []).map((n) => (
                        <div key={n.id} className="bg-amber-500/8 border border-amber-500/15 rounded-xl p-4">
                          <p className="text-white/80 text-sm whitespace-pre-wrap">{n.body}</p>
                          <p className="text-white/25 text-[10px] mt-2">{new Date(n.created_at).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="bg-white/3 border border-white/8 rounded-xl p-3 space-y-2">
                    <textarea ref={noteRef} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add a note…" rows={2} className="w-full bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none resize-none" />
                    <div className="flex justify-end">
                      <button onClick={handleAddNote} disabled={savingNote || !noteBody.trim()} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors">
                        {savingNote ? "Saving…" : "Save Note"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Compose reply — pinned to bottom */}
              <div className="flex-shrink-0 border-t border-white/8 bg-white/2 p-4">
                <div className="bg-white/4 border border-white/10 rounded-xl overflow-hidden focus-within:border-blue-500/40 transition-colors">
                  <textarea
                    value={composeBody}
                    onChange={(e) => { setComposeBody(e.target.value); setSendError(null); setSendSuccess(false); }}
                    placeholder={`Reply to ${selected.lead.first_name || selected.lead.email}…`}
                    rows={4}
                    className="w-full bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none resize-none px-4 pt-3 pb-1"
                  />
                  <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
                    <div className="text-xs">
                      {sendError && <span className="text-red-400">⚠ {sendError}</span>}
                      {sendSuccess && <span className="text-emerald-400">✓ Sent successfully</span>}
                    </div>
                    <button
                      onClick={handleSendReply}
                      disabled={sending || !composeBody.trim()}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      {sending ? (
                        <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Sending…</>
                      ) : (
                        <>↗ Send Reply</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-white/20">
              <div className="text-center"><div className="text-5xl mb-4">←</div><p className="text-sm">Select a conversation</p></div>
            </div>
          )}
        </div>
      )}

      {/* ── UNMATCHED TAB ─────────────────────────────────────────────────────── */}
      {mainTab === "unmatched" && (
        <div className="flex flex-1 overflow-hidden">
          {/* List */}
          <div className="w-80 flex-shrink-0 border-r border-white/8 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-white/8 flex-shrink-0">
              <p className="text-white/70 text-sm font-semibold">Unmatched Replies</p>
              <p className="text-white/35 text-xs mt-0.5">Emails that couldn't be linked to a campaign lead</p>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-white/5">
              {unmatchedLoading ? (
                [1,2,3].map((i) => <div key={i} className="h-16 bg-white/4 m-3 rounded-xl animate-pulse" />)
              ) : unmatched.length === 0 ? (
                <div className="text-center py-16 text-white/30 px-6">
                  <div className="text-3xl mb-3">✅</div>
                  <p className="text-sm">No unmatched replies</p>
                </div>
              ) : unmatched.map((u) => (
                <button key={u.id} onClick={() => setSelectedUnmatched(u)} className={`w-full text-left px-4 py-3.5 hover:bg-white/4 transition-colors ${selectedUnmatched?.id === u.id ? "bg-amber-500/8 border-r-2 border-amber-500" : ""}`}>
                  <p className="text-white text-sm font-medium truncate">{u.from_name || u.from_email}</p>
                  <p className="text-white/40 text-xs truncate">{u.from_email}</p>
                  <p className="text-white/30 text-xs truncate mt-0.5">{u.subject ?? "(no subject)"}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-white/20 text-[10px]">{u.inbox?.label || u.inbox?.email_address || "unknown inbox"}</p>
                    <p className="text-white/20 text-[10px]">{timeAgo(u.received_at)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Unmatched detail */}
          {selectedUnmatched ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-shrink-0 px-6 py-4 border-b border-white/8 bg-white/2 flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold">{selectedUnmatched.from_name || selectedUnmatched.from_email}</p>
                  <p className="text-white/40 text-xs">{selectedUnmatched.from_email}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePromote(selectedUnmatched.id)}
                    disabled={promoting}
                    className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-40 text-emerald-300 text-xs font-semibold rounded-lg transition-colors"
                    title="Create a lead + thread from this reply so you can track and reply to it"
                  >
                    {promoting ? "Moving…" : "↗ Move to Inbox"}
                  </button>
                  <button onClick={() => { setShowMatchModal(true); setMatchSearch(""); setMatchResults([]); }} className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold rounded-lg transition-colors">
                    🔗 Match to Lead
                  </button>
                  <button onClick={() => handleIgnore(selectedUnmatched.id)} className="px-3 py-1.5 bg-white/6 hover:bg-white/10 text-white/50 text-xs rounded-lg transition-colors">
                    Ignore
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <p className="text-white/50 text-xs mb-1 font-medium">{selectedUnmatched.subject ?? "(no subject)"}</p>
                <p className="text-white/25 text-xs mb-4">{new Date(selectedUnmatched.received_at).toLocaleString()} · via {selectedUnmatched.inbox?.email_address ?? "unknown"}</p>
                <div className="bg-white/4 border border-white/8 rounded-xl p-5">
                  <pre className="text-white/70 text-sm whitespace-pre-wrap font-sans leading-relaxed">
                    {selectedUnmatched.body_text ?? "(No body captured)"}
                  </pre>
                </div>
              </div>

              {/* Match modal */}
              {showMatchModal && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowMatchModal(false)}>
                  <div className="bg-[#1e1e1e] border border-white/12 rounded-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-white font-semibold mb-4">Match to a Lead</h3>
                    <input
                      type="text"
                      placeholder="Search by name, email, or company…"
                      value={matchSearch}
                      onChange={(e) => {
                        setMatchSearch(e.target.value);
                        const q = e.target.value.toLowerCase();
                        setMatchResults(q.length >= 2 ? threads.filter((t) =>
                          [t.lead.first_name, t.lead.last_name, t.lead.email, t.lead.company].filter(Boolean).join(" ").toLowerCase().includes(q)
                        ) : []);
                      }}
                      className="w-full px-3 py-2.5 bg-white/6 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 mb-3"
                    />
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {matchResults.map((t) => (
                        <button
                          key={t.enrollment_id}
                          onClick={() => handleMatch(selectedUnmatched.id, t.enrollment_id)}
                          disabled={matching}
                          className="w-full text-left px-3 py-2.5 bg-white/4 hover:bg-white/8 rounded-lg transition-colors disabled:opacity-40"
                        >
                          <p className="text-white text-sm font-medium">{[t.lead.first_name, t.lead.last_name].filter(Boolean).join(" ") || t.lead.email}</p>
                          <p className="text-white/40 text-xs">{t.lead.email} · {t.campaign.name}</p>
                        </button>
                      ))}
                      {matchSearch.length >= 2 && matchResults.length === 0 && (
                        <p className="text-white/30 text-sm text-center py-4">No matching leads found</p>
                      )}
                    </div>
                    <button onClick={() => setShowMatchModal(false)} className="mt-4 w-full px-3 py-2 bg-white/6 hover:bg-white/10 text-white/50 text-sm rounded-xl transition-colors">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-white/20">
              <div className="text-center"><div className="text-4xl mb-3">←</div><p className="text-sm">Select an unmatched reply</p></div>
            </div>
          )}
        </div>
      )}

      {/* ── FILTERS TAB ──────────────────────────────────────────────────────── */}
      {mainTab === "filters" && (
        <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-white font-semibold">Inbox Filter Rules</h2>
              <p className="text-white/40 text-sm mt-0.5">Rules are applied when polling inboxes. Matching emails are excluded or auto-categorized.</p>
            </div>
            <button onClick={() => setShowAddFilter((v) => !v)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors">
              + Add Rule
            </button>
          </div>

          {/* Quick add chips */}
          <div className="mb-6">
            <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">Quick Add</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_FILTERS.map((qf) => {
                const already = filters.some((f) => f.name === qf.name);
                return (
                  <button
                    key={qf.name}
                    disabled={already || savingFilter}
                    onClick={() => handleAddFilter(qf)}
                    className="px-3 py-1.5 bg-white/6 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-white/60 text-xs rounded-lg border border-white/10 transition-colors"
                  >
                    {already ? "✓ " : "+ "}{qf.name} → {qf.action === "exclude" ? "exclude" : `auto: ${qf.auto_status}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Add rule form */}
          {showAddFilter && (
            <div className="bg-white/4 border border-white/8 rounded-xl p-5 mb-6 space-y-4">
              <h3 className="text-white/70 text-sm font-semibold">New Filter Rule</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/40 text-xs mb-1 block">Name</label>
                  <input value={newFilter.name} onChange={(e) => setNewFilter((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Auto-reply" className="w-full px-3 py-2 bg-white/6 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none" />
                </div>
                <div>
                  <label className="text-white/40 text-xs mb-1 block">Type</label>
                  <select value={newFilter.type} onChange={(e) => setNewFilter((f) => ({ ...f, type: e.target.value as OutreachCrmFilter["type"] }))} className="w-full px-3 py-2 bg-[#1e1e1e] border border-white/10 rounded-lg text-sm text-white focus:outline-none">
                    {FILTER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-white/40 text-xs mb-1 block">Value</label>
                  <input value={newFilter.value} onChange={(e) => setNewFilter((f) => ({ ...f, value: e.target.value }))} placeholder="e.g. auto-reply" className="w-full px-3 py-2 bg-white/6 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none" />
                </div>
                <div>
                  <label className="text-white/40 text-xs mb-1 block">Action</label>
                  <select value={newFilter.action} onChange={(e) => setNewFilter((f) => ({ ...f, action: e.target.value as OutreachCrmFilter["action"] }))} className="w-full px-3 py-2 bg-[#1e1e1e] border border-white/10 rounded-lg text-sm text-white focus:outline-none">
                    <option value="exclude">Exclude from CRM</option>
                    <option value="auto_status">Auto-assign status</option>
                  </select>
                </div>
                {newFilter.action === "auto_status" && (
                  <div>
                    <label className="text-white/40 text-xs mb-1 block">Status to assign</label>
                    <select value={newFilter.auto_status ?? ""} onChange={(e) => setNewFilter((f) => ({ ...f, auto_status: e.target.value }))} className="w-full px-3 py-2 bg-[#1e1e1e] border border-white/10 rounded-lg text-sm text-white focus:outline-none">
                      <option value="">Select…</option>
                      {CRM_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAddFilter(false)} className="px-4 py-2 bg-white/6 hover:bg-white/10 text-white/50 text-sm rounded-xl transition-colors">Cancel</button>
                <button
                  onClick={() => handleAddFilter(newFilter)}
                  disabled={savingFilter || !newFilter.name || !newFilter.value}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {savingFilter ? "Saving…" : "Save Rule"}
                </button>
              </div>
            </div>
          )}

          {/* Rules table */}
          {filtersLoading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 bg-white/4 rounded-xl animate-pulse" />)}</div>
          ) : filters.length === 0 ? (
            <div className="text-center py-12 text-white/30">
              <p className="text-sm">No filter rules yet</p>
              <p className="text-xs mt-1">Add rules to automatically exclude noise or categorize replies</p>
            </div>
          ) : (
            <div className="border border-white/8 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_2fr_1fr_auto] gap-3 px-5 py-3 bg-white/3 border-b border-white/6">
                {["Name", "Type", "Value", "Action", ""].map((h) => (
                  <div key={h} className="text-white/35 text-xs font-semibold uppercase tracking-wider">{h}</div>
                ))}
              </div>
              {filters.map((f, i) => (
                <div key={f.id} className={`grid grid-cols-[2fr_1fr_2fr_1fr_auto] gap-3 items-center px-5 py-3 border-b border-white/4 last:border-0 ${i % 2 === 0 ? "" : "bg-white/1"}`}>
                  <div className="text-white text-sm font-medium">{f.name}</div>
                  <div className="text-white/50 text-xs capitalize">{f.type.replace(/_/g, " ")}</div>
                  <div className="text-white/60 text-xs font-mono truncate">{f.value}</div>
                  <div className="text-xs">
                    {f.action === "exclude"
                      ? <span className="text-red-400/70">Exclude</span>
                      : <span className="text-blue-400/70">→ {f.auto_status?.replace(/_/g, " ")}</span>
                    }
                  </div>
                  <button onClick={() => handleDeleteFilter(f.id)} className="text-white/20 hover:text-red-400 text-xs transition-colors px-1">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
