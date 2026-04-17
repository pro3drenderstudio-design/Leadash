"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  getCrmThreads, addNote, updateCrmStatus, suggestReply,
  getCrmUnmatched, getCrmWarmup, ignoreCrmUnmatched, matchReply, promoteUnmatched,
  getCrmFilters, createCrmFilter, deleteCrmFilter,
  triggerSendBatch, sendCrmReply, getConversation,
} from "@/lib/outreach/api";
import type { ConversationMessage } from "@/lib/outreach/api";
import type { CrmThread, CrmStatus, OutreachReply, OutreachCrmFilter, CrmNote } from "@/types/outreach";

// ─── Constants ────────────────────────────────────────────────────────────────

const CRM_STATUSES: { value: CrmStatus; label: string; color: string }[] = [
  { value: "neutral",        label: "Neutral",        color: "text-white/40 bg-white/6 border-white/10" },
  { value: "interested",     label: "Interested",     color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" },
  { value: "meeting_booked", label: "Meeting Booked", color: "text-white/60 bg-white/8 border-white/15" },
  { value: "won",            label: "Won",            color: "text-white/60 bg-white/8 border-white/15" },
  { value: "not_interested", label: "Not Interested", color: "text-white/40 bg-white/6 border-white/10" },
  { value: "ooo",            label: "OOO",            color: "text-white/50 bg-white/6 border-white/12" },
  { value: "follow_up",      label: "Follow Up",      color: "text-white/60 bg-white/8 border-white/15" },
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

type MainTab = "inbox" | "unmatched" | "warmup" | "filters";

// ─── Sub-components ───────────────────────────────────────────────────────────

const COMMON_EMOJIS = [
  "😀","😊","😂","🙏","👍","👎","🔥","✅","❌","⚡","🎉","🚀",
  "💡","💼","📧","📅","💰","🤝","⭐","🌟","✨","💪","🎯","📊",
  "👋","😅","🤔","😍","🥳","🤩","😎","🙌","💯","❤️","👏","🏆",
];

function EmojiPicker({ onSelect }: { onSelect: (e: string) => void }) {
  return (
    <div>
      <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider mb-2">Emoji</p>
      <div className="grid grid-cols-8 gap-0.5">
        {COMMON_EMOJIS.map((e) => (
          <button key={e} onClick={() => onSelect(e)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-base transition-colors">{e}</button>
        ))}
      </div>
    </div>
  );
}

function ToolbarBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(e); }}
      onClick={(e) => e.stopPropagation()}
      className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-white/50 hover:text-white/80 text-xs transition-colors"
    >
      {children}
    </button>
  );
}

function AttachmentList({ attachments }: { attachments: import("@/types/outreach").ReplyAttachment[] }) {
  if (!attachments?.length) return null;
  return (
    <div className="border-t border-white/10 pt-2.5 mt-2.5 space-y-1">
      {attachments.map((att, i) => (
        <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 hover:border-white/15 transition-colors group text-xs"
          onClick={e => e.stopPropagation()}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-white/40 flex-shrink-0">
            <path fillRule="evenodd" d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z" clipRule="evenodd"/>
          </svg>
          <span className="flex-1 truncate text-white/60">{att.name}</span>
          <span className="text-white/30 text-[10px] flex-shrink-0">
            {att.size < 1024 ? `${att.size}B` : att.size < 1_048_576 ? `${(att.size/1024).toFixed(0)}KB` : `${(att.size/1_048_576).toFixed(1)}MB`}
          </span>
        </a>
      ))}
    </div>
  );
}

function SentBubble({ msg, leadEmail }: { msg: ConversationMessage; leadEmail: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const isHtml = /<[a-z][\s\S]*>/i.test(msg.body ?? "");
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[82%] w-full">
        <div className="flex items-center justify-end gap-2 mb-1">
          <span className="text-white/25 text-[10px]">{msg.sent_at ? new Date(msg.sent_at).toLocaleString() : ""}</span>
          {msg.opened_at && <span className="text-white/30 text-[10px]">Opened</span>}
          {msg.clicked_at && <span className="text-white/30 text-[10px]">Clicked</span>}
          <span className="text-white/40 text-[10px] font-medium">You</span>
        </div>
        <button className="w-full text-left" onClick={() => setCollapsed(v => !v)}>
          <div className="bg-white/6 border border-white/10 rounded-2xl rounded-tr-sm overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <p className="text-white/60 text-xs font-medium truncate">{msg.subject}</p>
              <span className="text-white/20 text-[10px] flex-shrink-0 ml-2">{collapsed ? "▸" : "▾"}</span>
            </div>
            {!collapsed && (
              <div className="px-4 pb-4 border-t border-white/8 pt-3">
                {isHtml ? (
                  <iframe
                    srcDoc={`<html><head><style>body{margin:0;font-family:sans-serif;font-size:13px;color:#ccc;background:transparent;line-height:1.6}a{color:#7dd3fc}*{max-width:100%}</style></head><body>${msg.body}</body></html>`}
                    sandbox="allow-same-origin"
                    className="w-full border-0 min-h-[60px]"
                    style={{ height: "auto" }}
                    onLoad={(e) => {
                      const iframe = e.currentTarget;
                      if (iframe.contentDocument?.body) iframe.style.height = iframe.contentDocument.body.scrollHeight + "px";
                    }}
                  />
                ) : (
                  <pre className="text-white/50 text-xs whitespace-pre-wrap font-sans leading-relaxed">{msg.body}</pre>
                )}
              </div>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}

function ReplyBubble({ msg, leadEmail }: { msg: ConversationMessage; leadEmail: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const isDifferentEmail = msg.from_email && msg.from_email.toLowerCase() !== leadEmail.toLowerCase();
  return (
    <div className="flex flex-col items-start">
      <div className="max-w-[82%] w-full">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-white/55 text-[10px] font-medium">{msg.from_name || msg.from_email}</span>
          {isDifferentEmail && <span className="text-white/30 text-[10px]">({msg.from_email})</span>}
          <span className="text-white/25 text-[10px]">{msg.received_at ? new Date(msg.received_at).toLocaleString() : ""}</span>
          {msg.ai_category && msg.ai_category !== "neutral" && (msg.ai_confidence ?? 0) >= 0.7 && (
            <span className="text-white/30 text-[10px]">AI: {msg.ai_category.replace(/_/g, " ")} {Math.round((msg.ai_confidence ?? 0) * 100)}%</span>
          )}
        </div>
        <button className="w-full text-left" onClick={() => setCollapsed(v => !v)}>
          <div className="bg-white/4 border border-white/8 rounded-2xl rounded-tl-sm overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <p className="text-white/60 text-xs font-medium truncate">{msg.subject ?? "(reply)"}</p>
              <span className="text-white/20 text-[10px] flex-shrink-0 ml-2">{collapsed ? "▸" : "▾"}</span>
            </div>
            {!collapsed && (
              <div className="px-4 pb-4 border-t border-white/6 pt-3">
                <pre className="text-white/70 text-sm whitespace-pre-wrap font-sans leading-relaxed">
                  {msg.body_text ?? "(No body captured — reply detected via header matching)"}
                </pre>
                <AttachmentList attachments={msg.attachments ?? []} />
              </div>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}

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
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [suggesting, setSuggesting]     = useState(false);
  const [composeBody, setComposeBody]   = useState("");
  const [composeHtml, setComposeHtml]   = useState("");
  const [sending, setSending]           = useState(false);
  const [sendError, setSendError]       = useState<string | null>(null);
  const [sendSuccess, setSendSuccess]   = useState(false);
  const [triggering, setTriggering]     = useState(false);
  const [triggerMsg, setTriggerMsg]     = useState<string | null>(null);
  const [pollDetails, setPollDetails]   = useState<Array<{ email: string; fetched: number; matched: number; unmatched: number; error?: string }>>([]);
  const [showPollDetails, setShowPollDetails] = useState(false);
  // Conversation
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [convNotes, setConvNotes]       = useState<CrmNote[]>([]);
  const [convLoading, setConvLoading]   = useState(false);
  // Notes drawer
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);
  const [noteBody, setNoteBody]         = useState("");
  const [savingNote, setSavingNote]     = useState(false);
  // Compose rich text
  const composeRef  = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments]   = useState<File[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showLinkDialog, setShowLinkDialog]   = useState(false);
  const [linkUrl, setLinkUrl]           = useState("");
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

  // ── Warmup state ──────────────────────────────────────────────────────────
  type WarmupReply = OutreachReply & { inbox: { id: string; label: string | null; email_address: string } | null };
  const [warmup, setWarmup]               = useState<WarmupReply[]>([]);
  const [warmupLoading, setWarmupLoading] = useState(false);
  const [selectedWarmup, setSelectedWarmup] = useState<WarmupReply | null>(null);

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

  // ── Auto-sync replies in background ──────────────────────────────────────
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt]   = useState<Date | null>(null);

  const runAutoSync = useCallback(async () => {
    if (autoSyncing) return;
    setAutoSyncing(true);
    try {
      await fetch("/api/outreach/crm/sync", { method: "POST" });
      setLastSyncAt(new Date());
      loadThreads(true);
    } catch { /* silent */ } finally {
      setAutoSyncing(false);
    }
  }, [autoSyncing, loadThreads]);

  useEffect(() => {
    // Run once on mount after a 3s delay (let the page settle first)
    const t = setTimeout(runAutoSync, 3000);
    // Then every 5 minutes
    const iv = setInterval(runAutoSync, 5 * 60 * 1000);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (mainTab === "warmup" && warmup.length === 0) {
      setWarmupLoading(true);
      getCrmWarmup().then((d) => { setWarmup(d); setWarmupLoading(false); });
    }
  }, [mainTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load filters ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mainTab === "filters") {
      setFiltersLoading(true);
      getCrmFilters().then((d) => { setFilters(d); setFiltersLoading(false); });
    }
  }, [mainTab]);

  // ── Conversation loader ───────────────────────────────────────────────────
  const loadConversation = useCallback(async (enrollmentId: string) => {
    setConvLoading(true);
    try {
      const data = await getConversation(enrollmentId);
      setConversation(data.messages);
      setConvNotes(data.notes);
    } finally {
      setConvLoading(false);
    }
  }, []);

  // ── Inbox actions ─────────────────────────────────────────────────────────
  async function handleAddNote() {
    if (!selected || !noteBody.trim()) return;
    setSavingNote(true);
    await addNote(selected.enrollment_id, noteBody.trim());
    const newNote: CrmNote = { id: Date.now().toString(), lead_id: selected.lead.id, body: noteBody.trim(), created_at: new Date().toISOString() };
    setConvNotes((prev) => [...prev, newNote]);
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
    try {
      const { suggestion: text, error } = await suggestReply(selected.enrollment_id);
      if (error) {
        setSendError(`AI suggestion failed: ${error}`);
      } else if (text && composeRef.current) {
        composeRef.current.innerText = text;
        setComposeBody(text);
        setComposeHtml(composeRef.current.innerHTML);
        // Move cursor to end
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(composeRef.current);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
        composeRef.current.focus();
      }
    } catch (err) {
      setSendError(`AI suggestion failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSendReply() {
    const plainText = composeRef.current?.innerText?.trim() ?? composeBody.trim();
    const htmlContent = composeRef.current?.innerHTML ?? "";
    if (!selected || !plainText) return;
    setSending(true);
    setSendError(null);
    setSendSuccess(false);
    const result = await sendCrmReply(selected.enrollment_id, plainText, htmlContent);
    if (result.error) {
      setSendError(result.error);
    } else {
      setSendSuccess(true);
      if (composeRef.current) composeRef.current.innerHTML = "";
      setComposeBody("");
      setComposeHtml("");
      setAttachments([]);
      // Reload conversation to show sent message
      await loadConversation(selected.enrollment_id);
      setTimeout(() => setSendSuccess(false), 3000);
    }
    setSending(false);
  }

  function execFormat(cmd: string, value?: string) {
    composeRef.current?.focus();
    document.execCommand(cmd, false, value);
    setComposeHtml(composeRef.current?.innerHTML ?? "");
    setComposeBody(composeRef.current?.innerText ?? "");
  }

  function handleInsertLink() {
    if (!linkUrl.trim()) return;
    execFormat("createLink", linkUrl.trim());
    setShowLinkDialog(false);
    setLinkUrl("");
  }

  function handleInsertEmoji(emoji: string) {
    composeRef.current?.focus();
    document.execCommand("insertText", false, emoji);
    setComposeHtml(composeRef.current?.innerHTML ?? "");
    setComposeBody(composeRef.current?.innerText ?? "");
    // Keep picker open so user can insert multiple emojis
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setAttachments((prev) => [...prev, ...files]);
    e.target.value = "";
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
    setUnmatchedSending(false);
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
          {(["inbox", "unmatched", "warmup", "filters"] as MainTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setMainTab(t)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${mainTab === t ? "bg-white/12 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              {t}
              {t === "unmatched" && unmatched.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-[9px] rounded-full">{unmatched.length}</span>
              )}
              {t === "warmup" && warmup.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-[9px] rounded-full">{warmup.length}</span>
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
          {autoSyncing && (
            <span className="text-white/25 text-[10px] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-pulse inline-block" />
              Checking replies…
            </span>
          )}
          {!autoSyncing && lastSyncAt && (
            <span className="text-white/20 text-[10px]">synced {timeAgo(lastSyncAt.toISOString())}</span>
          )}
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 disabled:opacity-40 text-orange-300 text-xs font-semibold rounded-lg transition-colors"
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

          {/* Thread list — full-width on mobile when no thread selected, hidden when one is selected */}
          <div className={`${selected ? "hidden md:flex" : "flex"} w-full md:w-80 md:flex-shrink-0 border-r border-white/8 flex-col overflow-hidden`}>
            <div className="px-3 py-2.5 border-b border-white/8 space-y-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:border-orange-500/40"
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
                    onClick={() => {
                      setSelected(t);
                      setComposeBody(""); setComposeHtml(""); setSendError(null); setSendSuccess(false);
                      setAttachments([]); setShowNotesDrawer(false); setShowEmojiPicker(false); setShowLinkDialog(false);
                      if (composeRef.current) composeRef.current.innerHTML = "";
                      loadConversation(t.enrollment_id);
                    }}
                    className={`w-full text-left px-4 py-3.5 hover:bg-white/4 transition-colors ${selected?.enrollment_id === t.enrollment_id ? "bg-white/6 border-r-2 border-white/30" : ""}`}
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
                      <p className="text-white/40 text-xs mt-1.5 line-clamp-1">{t.latest_reply.body_text.slice(0, 80)}</p>
                    ) : (
                      <p className="text-white/30 text-xs mt-1.5 line-clamp-1">{t.latest_send?.subject}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail panel — full-width on mobile when thread selected, hidden otherwise */}
          {selected ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Contact header */}
              <div className="flex-shrink-0 px-4 md:px-6 py-4 border-b border-white/8 bg-white/2">
                {/* Back button — mobile only */}
                <button
                  onClick={() => setSelected(null)}
                  className="md:hidden flex items-center gap-1.5 text-white/50 hover:text-white text-xs mb-3 transition-colors"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd"/></svg>
                  Back to inbox
                </button>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-white uppercase">{(selected.lead.first_name?.[0] ?? selected.lead.email[0]).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-white font-semibold text-base">{[selected.lead.first_name, selected.lead.last_name].filter(Boolean).join(" ") || selected.lead.email}</h2>
                    <p className="text-white/40 text-xs">{selected.lead.email}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {(selected.lead.company || selected.lead.title) && (
                        <p className="text-white/30 text-xs">{[selected.lead.title, selected.lead.company].filter(Boolean).join(" at ")}</p>
                      )}
                      <p className="text-white/20 text-xs">{selected.campaign?.name ?? "Direct inbound"} · {timeAgo(selected.replied_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Notes drawer button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowNotesDrawer((v) => !v); }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${showNotesDrawer ? "bg-amber-500/20 border-amber-500/30 text-amber-300" : "bg-white/6 border-white/10 text-white/50 hover:text-white/70 hover:bg-white/10"}`}
                      title="Notes"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10 1a1 1 0 000 2h5a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1v-3a1 1 0 10-2 0v3a3 3 0 003 3h10a3 3 0 003-3V4a3 3 0 00-3-3h-5zM3.293 9.707a1 1 0 011.414 0L8 13V5a1 1 0 012 0v8l3.293-3.293a1 1 0 111.414 1.414l-5 5a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414z"/></svg>
                      Notes {convNotes.length > 0 && <span className="ml-0.5 px-1.5 py-0.5 bg-amber-500/30 text-amber-200 text-[9px] rounded-full">{convNotes.length}</span>}
                    </button>
                    {/* Status picker */}
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
                  </div>
                </div>
              </div>

              {/* Main area: thread + optional notes drawer */}
              <div className="flex flex-1 overflow-hidden relative">
                {/* Thread */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-3">
                    {convLoading ? (
                      [1,2,3].map((i) => <div key={i} className={`h-20 rounded-2xl animate-pulse ${i % 2 === 0 ? "bg-white/5 mr-12" : "bg-white/8 ml-12"}`} />)
                    ) : conversation.length === 0 ? (
                      <div className="text-center py-12 text-white/20">
                        <p className="text-sm">No messages yet</p>
                      </div>
                    ) : conversation.map((msg) => (
                      msg.type === "send" ? (
                        <SentBubble key={msg.id} msg={msg} leadEmail={selected.lead.email} />
                      ) : (
                        <ReplyBubble key={msg.id} msg={msg} leadEmail={selected.lead.email} />
                      )
                    ))}
                  </div>

                  {/* Rich text compose — pinned to bottom */}
                  <div className="flex-shrink-0 border-t border-white/8 bg-[#0e0e0e] p-3" onClick={() => { setShowEmojiPicker(false); }}>
                    {/* Toolbar */}
                    <div className="flex items-center gap-0.5 mb-2 px-1">
                      <ToolbarBtn title="Bold" onClick={() => execFormat("bold")}><b>B</b></ToolbarBtn>
                      <ToolbarBtn title="Italic" onClick={() => execFormat("italic")}><i>I</i></ToolbarBtn>
                      <ToolbarBtn title="Underline" onClick={() => execFormat("underline")}><u>U</u></ToolbarBtn>
                      <div className="w-px h-4 bg-white/10 mx-1" />
                      <div className="relative">
                        <ToolbarBtn title="Insert link" onClick={(e) => { e.stopPropagation(); setShowLinkDialog((v) => !v); setShowEmojiPicker(false); }}>
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd"/></svg>
                        </ToolbarBtn>
                        {showLinkDialog && (
                          <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1a] border border-white/12 rounded-xl p-3 shadow-2xl z-20 w-64" onClick={(e) => e.stopPropagation()}>
                            <p className="text-white/50 text-xs mb-2 font-medium">Insert link</p>
                            <input
                              type="url"
                              placeholder="https://example.com"
                              value={linkUrl}
                              onChange={(e) => setLinkUrl(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && handleInsertLink()}
                              className="w-full px-2.5 py-1.5 bg-white/8 border border-white/10 rounded-lg text-xs text-white placeholder-white/25 focus:outline-none focus:border-orange-500/40 mb-2"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button onClick={handleInsertLink} className="flex-1 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-lg transition-colors">Insert</button>
                              <button onClick={() => { setShowLinkDialog(false); setLinkUrl(""); }} className="px-3 py-1.5 bg-white/6 hover:bg-white/10 text-white/50 text-xs rounded-lg transition-colors">Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="relative">
                        <ToolbarBtn title="Emoji" onClick={(e) => { e.stopPropagation(); setShowEmojiPicker((v) => !v); setShowLinkDialog(false); }}>
                          <span className="text-sm leading-none">☺</span>
                        </ToolbarBtn>
                        {showEmojiPicker && (
                          <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1a] border border-white/12 rounded-xl p-3 shadow-2xl z-20 w-64" onClick={(e) => e.stopPropagation()}>
                            <EmojiPicker onSelect={handleInsertEmoji} />
                          </div>
                        )}
                      </div>
                      <div className="w-px h-4 bg-white/10 mx-1" />
                      <ToolbarBtn title="Attach file" onClick={() => fileInputRef.current?.click()}>
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z" clipRule="evenodd"/></svg>
                      </ToolbarBtn>
                      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
                      <div className="flex-1" />
                      {/* AI Generate button */}
                      <button
                        onClick={handleSuggestReply}
                        disabled={suggesting}
                        className="px-2.5 py-1 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/25 text-violet-300 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5"
                        title="Generate AI reply — fills compose field"
                      >
                        {suggesting ? (
                          <><svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generating…</>
                        ) : <>✦ Generate Reply</>}
                      </button>
                    </div>

                    {/* Compose area */}
                    <div className="relative bg-white/4 border border-white/10 rounded-xl overflow-hidden focus-within:border-orange-500/40 transition-colors">
                      <div
                        ref={composeRef}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={() => {
                          setComposeHtml(composeRef.current?.innerHTML ?? "");
                          setComposeBody(composeRef.current?.innerText ?? "");
                          setSendError(null);
                          setSendSuccess(false);
                        }}
                        className="min-h-[90px] max-h-[200px] overflow-y-auto text-white text-sm focus:outline-none px-4 py-3 leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-white/25 empty:before:pointer-events-none"
                        data-placeholder={`Reply to ${selected.lead.first_name || selected.lead.email}…`}
                        style={{ wordBreak: "break-word" }}
                      />
                      {/* Attachments */}
                      {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-white/8 pt-2">
                          {attachments.map((f, i) => (
                            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-white/8 border border-white/12 rounded-lg text-xs text-white/70">
                              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-white/40"><path fillRule="evenodd" d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z" clipRule="evenodd"/></svg>
                              <span className="max-w-[120px] truncate">{f.name}</span>
                              <span className="text-white/30 text-[10px]">{f.size < 1_048_576 ? `${(f.size/1024).toFixed(0)}KB` : `${(f.size/1_048_576).toFixed(1)}MB`}</span>
                              <button onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))} className="text-white/30 hover:text-red-400 transition-colors ml-0.5">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between px-3 pb-2 pt-1">
                        <div className="text-xs">
                          {sendError && <span className="text-red-400">⚠ {sendError}</span>}
                          {sendSuccess && <span className="text-emerald-400">✓ Sent</span>}
                        </div>
                        <button
                          onClick={handleSendReply}
                          disabled={sending || !composeBody.trim()}
                          className="px-4 py-1.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          {sending ? (
                            <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Sending…</>
                          ) : (
                            <><svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z"/></svg>Send</>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes drawer */}
                {showNotesDrawer && (
                  <div className="absolute inset-0 z-10 md:relative md:inset-auto md:z-auto md:w-72 md:flex-shrink-0 border-l border-white/8 bg-[#0a0a0a] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 flex-shrink-0">
                      <h3 className="text-white/70 text-sm font-semibold">Notes</h3>
                      <button onClick={() => setShowNotesDrawer(false)} className="text-white/30 hover:text-white/60 transition-colors">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {convNotes.length === 0 ? (
                        <p className="text-white/25 text-xs text-center py-6">No notes yet</p>
                      ) : convNotes.map((n) => (
                        <div key={n.id} className="bg-amber-500/8 border border-amber-500/15 rounded-xl p-3">
                          <p className="text-white/80 text-sm whitespace-pre-wrap">{n.body}</p>
                          <p className="text-white/25 text-[10px] mt-2">{new Date(n.created_at).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex-shrink-0 border-t border-white/8 p-3">
                      <textarea
                        ref={noteRef}
                        value={noteBody}
                        onChange={(e) => setNoteBody(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote(); }}
                        placeholder="Add a note… (⌘↵ to save)"
                        rows={3}
                        className="w-full bg-white/4 border border-white/8 rounded-xl text-white text-sm placeholder:text-white/25 focus:outline-none resize-none p-3 focus:border-amber-500/30 transition-colors"
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={savingNote || !noteBody.trim()}
                        className="mt-2 w-full px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 text-amber-200 text-xs font-semibold rounded-lg transition-colors"
                      >
                        {savingNote ? "Saving…" : "Save Note"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center text-white/20">
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
                <button key={u.id} onClick={() => { setSelectedUnmatched(u); setUnmatchedCompose(""); setUnmatchedSendErr(null); setUnmatchedSendOk(false); }} className={`w-full text-left px-4 py-3.5 hover:bg-white/4 transition-colors ${selectedUnmatched?.id === u.id ? "bg-amber-500/8 border-r-2 border-amber-500" : ""}`}>
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
                  <button onClick={() => { setShowMatchModal(true); setMatchSearch(""); setMatchResults([]); }} className="px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 text-xs font-semibold rounded-lg transition-colors">
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
                    {selectedUnmatched.body_text || "(No body captured — body will appear after next poll if transfer encoding is base64)"}
                  </pre>
                </div>
              </div>

              {/* Quick reply compose */}
              <div className="flex-shrink-0 border-t border-white/8 bg-white/2 p-4">
                <div className="bg-white/4 border border-white/10 rounded-xl overflow-hidden focus-within:border-emerald-500/40 transition-colors">
                  <textarea
                    value={unmatchedCompose}
                    onChange={(e) => { setUnmatchedCompose(e.target.value); setUnmatchedSendErr(null); setUnmatchedSendOk(false); }}
                    placeholder={`Reply to ${selectedUnmatched.from_name || selectedUnmatched.from_email}… (creates a lead + inbox thread automatically)`}
                    rows={3}
                    className="w-full bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none resize-none px-4 pt-3 pb-1"
                  />
                  <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
                    <div className="text-xs">
                      {unmatchedSendErr && <span className="text-red-400">⚠ {unmatchedSendErr}</span>}
                      {unmatchedSendOk  && <span className="text-emerald-400">✓ Sent — moved to inbox</span>}
                    </div>
                    <button
                      onClick={handleUnmatchedSend}
                      disabled={unmatchedSending || !unmatchedCompose.trim()}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      {unmatchedSending ? (
                        <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Sending…</>
                      ) : <>↗ Reply &amp; Move to Inbox</>}
                    </button>
                  </div>
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
                      className="w-full px-3 py-2.5 bg-white/6 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-orange-500/50 mb-3"
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
                          <p className="text-white/40 text-xs">{t.lead.email} · {t.campaign?.name ?? "Direct inbound"}</p>
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
            <button onClick={() => setShowAddFilter((v) => !v)} className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors">
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
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
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
                      : <span className="text-orange-400/70">→ {f.auto_status?.replace(/_/g, " ")}</span>
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
