"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface CrmContact {
  id:              string;
  display_name:    string | null;
  email:           string | null;
  whatsapp_number: string | null;
  user_id:         string | null;
}

interface LatestMessage {
  id:         string;
  direction:  string;
  body:       string | null;
  channel:    string;
  created_at: string;
}

interface Conversation {
  id:                 string;
  channel:            string;
  inbox_address:      string;
  channel_identifier: string;
  subject:            string | null;
  status:             string;
  assigned_to:        string | null;
  snooze_until:      string | null;
  unread_count:       number;
  last_message_at:    string;
  last_inbound_at:    string | null;
  crm_contacts:       CrmContact | null;
  latest_message:     LatestMessage | null;
}

interface CrmMessage {
  id:                  string;
  direction:           "inbound" | "outbound";
  channel:             string;
  body:                string | null;
  body_html:           string | null;
  subject:             string | null;
  from_address:        string | null;
  from_name:           string | null;
  wa_message_type:     string | null;
  status:              string;
  delivered_at:        string | null;
  read_at:             string | null;
  created_at:          string;
  sent_by:             string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function windowOpen(lastInbound: string | null) {
  if (!lastInbound) return false;
  return (Date.now() - new Date(lastInbound).getTime()) < 24 * 60 * 60 * 1000;
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === "whatsapp") {
    return (
      <svg className="w-3.5 h-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.555 4.118 1.528 5.845L0 24l6.335-1.51A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.75 9.75 0 110-19.5 9.75 9.75 0 010 19.5z"/>
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

// ── Conversation list item ────────────────────────────────────────────────────

function ConvoItem({
  convo,
  active,
  onClick,
}: {
  convo: Conversation;
  active: boolean;
  onClick: () => void;
}) {
  const name = convo.crm_contacts?.display_name
    ?? convo.crm_contacts?.email
    ?? convo.crm_contacts?.whatsapp_number
    ?? convo.channel_identifier;

  const preview = convo.latest_message?.body
    ? convo.latest_message.body.slice(0, 70)
    : "";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-slate-100 dark:border-white/5 transition-colors ${
        active
          ? "bg-orange-50 dark:bg-orange-500/10 border-l-2 border-l-orange-500"
          : "hover:bg-slate-50 dark:hover:bg-white/5"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <ChannelIcon channel={convo.channel} />
            <span className={`text-sm font-semibold truncate ${active ? "text-orange-700 dark:text-orange-300" : "text-slate-800 dark:text-white"}`}>
              {name}
            </span>
          </div>
          {convo.subject && (
            <p className="text-xs text-slate-500 dark:text-white/40 truncate mb-0.5">{convo.subject}</p>
          )}
          {preview && (
            <p className="text-xs text-slate-400 dark:text-white/30 truncate">{preview}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[10px] text-slate-400 dark:text-white/20 whitespace-nowrap">
            {timeAgo(convo.last_message_at)}
          </span>
          {convo.unread_count > 0 && (
            <span className="w-4 h-4 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center">
              {convo.unread_count > 9 ? "9+" : convo.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Thread ────────────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: CrmMessage }) {
  const isOutbound = msg.direction === "outbound";
  const isNote     = msg.body?.startsWith("[NOTE] ");

  if (isNote) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-lg px-3 py-2 max-w-sm text-xs text-yellow-800 dark:text-yellow-300">
          <span className="font-semibold mr-1">Note:</span>{(msg.body ?? "").replace("[NOTE] ", "")}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[70%] rounded-2xl px-3.5 py-2.5 text-sm ${
          isOutbound
            ? "bg-orange-500 text-white rounded-br-sm"
            : "bg-white dark:bg-white/10 border border-slate-100 dark:border-white/10 text-slate-800 dark:text-white rounded-bl-sm"
        }`}
      >
        {msg.body}
        <div className={`text-[10px] mt-1 ${isOutbound ? "text-orange-200" : "text-slate-400 dark:text-white/30"}`}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {isOutbound && msg.status === "read" && " ✓✓"}
          {isOutbound && msg.status === "delivered" && " ✓✓"}
          {isOutbound && msg.status === "sent" && " ✓"}
        </div>
      </div>
    </div>
  );
}

// ── Main page (wrapped in Suspense for useSearchParams) ───────────────────────

function CrmInboxContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const activeId     = searchParams.get("id");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages,      setMessages]      = useState<CrmMessage[]>([]);
  const [activeConvo,   setActiveConvo]   = useState<Conversation | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [sending,       setSending]       = useState(false);
  const [composeText,   setComposeText]   = useState("");
  const [isNote,        setIsNote]        = useState(false);
  const [statusFilter,  setStatusFilter]  = useState("open");
  const [channelFilter, setChannelFilter] = useState("all");
  const [winOpen,       setWinOpen]       = useState(false);
  const [error,         setError]         = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  // ── Load conversations ──────────────────────────────────────────────────
  const loadConvos = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status: statusFilter });
    if (channelFilter !== "all") params.set("channel", channelFilter);
    const res = await fetch(`/api/crm/conversations?${params}`);
    const d   = await res.json() as { conversations?: Conversation[] };
    setConversations(d.conversations ?? []);
    setLoading(false);
  }, [statusFilter, channelFilter]);

  useEffect(() => { loadConvos(); }, [loadConvos]);

  // ── Select conversation ─────────────────────────────────────────────────
  useEffect(() => {
    if (!activeId) { setActiveConvo(null); setMessages([]); return; }
    const c = conversations.find(c => c.id === activeId);
    if (c) {
      setActiveConvo(c);
      setWinOpen(windowOpen(c.last_inbound_at));
      loadMessages(c.id);
      // Mark as read
      if (c.unread_count > 0) {
        fetch(`/api/crm/conversations?id=${c.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unread_count: 0 }),
        }).then(() => loadConvos());
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, conversations]);

  async function loadMessages(id: string) {
    const res = await fetch(`/api/crm/messages?conversation_id=${id}`);
    const d = await res.json() as { messages?: CrmMessage[] };
    setMessages(d.messages ?? []);
  }

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Send ──────────────────────────────────────────────────────────────────
  async function handleSend() {
    if (!activeConvo || !composeText.trim()) return;
    setSending(true);
    setError("");
    const res = await fetch("/api/crm/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: activeConvo.id,
        body:            composeText,
        channel:         activeConvo.channel,
        note:            isNote || undefined,
      }),
    });
    const d = await res.json() as { error?: string; requires_template?: boolean };
    setSending(false);
    if (!res.ok) {
      if (d.requires_template) {
        setError("24-hour window has closed. Use a WhatsApp template message instead.");
      } else {
        setError(d.error ?? "Send failed");
      }
      return;
    }
    setComposeText("");
    setIsNote(false);
    await loadMessages(activeConvo.id);
    await loadConvos();
  }

  // ── Status change ─────────────────────────────────────────────────────────
  async function updateStatus(status: string) {
    if (!activeConvo) return;
    await fetch(`/api/crm/conversations?id=${activeConvo.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadConvos();
    router.replace("/admin/crm");
    setActiveConvo(null);
  }

  const contactName = activeConvo?.crm_contacts?.display_name
    ?? activeConvo?.crm_contacts?.email
    ?? activeConvo?.crm_contacts?.whatsapp_number
    ?? activeConvo?.channel_identifier
    ?? "";

  return (
    <div className="flex h-full min-h-screen bg-slate-50 dark:bg-[#0f0f0f]">

      {/* ── Left: conversation list ─────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-r border-slate-200 dark:border-white/10 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-white/10">
          <h1 className="text-base font-bold text-slate-800 dark:text-white mb-3">Inbox</h1>
          <div className="flex gap-1 mb-2">
            {["open", "resolved", "all"].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex-1 text-[11px] font-semibold py-1 rounded-md transition-colors ${
                  statusFilter === s
                    ? "bg-orange-500 text-white"
                    : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/60"
                }`}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {["all", "email", "whatsapp"].map(c => (
              <button
                key={c}
                onClick={() => setChannelFilter(c)}
                className={`flex-1 text-[11px] font-semibold py-1 rounded-md transition-colors ${
                  channelFilter === c
                    ? "bg-slate-800 dark:bg-white/20 text-white dark:text-white"
                    : "bg-slate-100 dark:bg-white/10 text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/50"
                }`}
              >
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-1 p-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-slate-100 dark:bg-white/5 rounded-lg animate-pulse" />)}
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 dark:text-white/20">
              No conversations
            </div>
          ) : (
            conversations.map(c => (
              <ConvoItem
                key={c.id}
                convo={c}
                active={c.id === activeId}
                onClick={() => router.push(`/admin/crm?id=${c.id}`, { scroll: false })}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Middle: thread ─────────────────────────────────────────────── */}
      {activeConvo ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Thread header */}
          <div className="bg-white dark:bg-[#1a1a1a] border-b border-slate-200 dark:border-white/10 px-6 py-3 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <ChannelIcon channel={activeConvo.channel} />
                <h2 className="text-sm font-bold text-slate-800 dark:text-white truncate">{contactName}</h2>
                {!winOpen && activeConvo.channel === "whatsapp" && (
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded font-semibold">
                    24hr closed
                  </span>
                )}
              </div>
              {activeConvo.subject && (
                <p className="text-xs text-slate-400 dark:text-white/30 truncate">{activeConvo.subject}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {activeConvo.status === "open" ? (
                <button
                  onClick={() => updateStatus("resolved")}
                  className="text-xs font-semibold px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 rounded-lg transition-colors"
                >
                  Resolve
                </button>
              ) : (
                <button
                  onClick={() => updateStatus("open")}
                  className="text-xs font-semibold px-3 py-1.5 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/40 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Reopen
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div ref={threadRef} className="flex-1 overflow-y-auto px-6 py-4">
            {messages.length === 0 ? (
              <div className="text-center text-xs text-slate-300 dark:text-white/20 mt-20">
                No messages yet
              </div>
            ) : (
              messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
            )}
          </div>

          {/* Compose */}
          <div className="bg-white dark:bg-[#1a1a1a] border-t border-slate-200 dark:border-white/10 p-4">
            {error && (
              <p className="text-xs text-red-400 mb-2">{error}</p>
            )}

            {/* Note toggle */}
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setIsNote(false)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${!isNote ? "bg-orange-500 text-white" : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/30"}`}
              >
                Reply
              </button>
              <button
                onClick={() => setIsNote(true)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${isNote ? "bg-yellow-400 text-yellow-900" : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/30"}`}
              >
                Note
              </button>
            </div>

            <div className="flex gap-3 items-end">
              <textarea
                value={composeText}
                onChange={e => setComposeText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend(); }}
                placeholder={
                  isNote
                    ? "Add an internal note…"
                    : activeConvo.channel === "whatsapp" && !winOpen
                      ? "24hr window closed — use a template…"
                      : "Type a message… (Cmd+Enter to send)"
                }
                rows={3}
                className="flex-1 resize-none px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
              <button
                onClick={handleSend}
                disabled={sending || !composeText.trim()}
                className="px-4 py-2.5 text-sm font-semibold bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white rounded-xl transition-colors"
              >
                {sending ? "…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-300 dark:text-white/20 text-sm">
          Select a conversation
        </div>
      )}

      {/* ── Right: contact panel ───────────────────────────────────────── */}
      {activeConvo && (
        <div className="w-64 flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-l border-slate-200 dark:border-white/10 p-5 overflow-y-auto">
          <h3 className="text-xs font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest mb-4">Contact</h3>

          <div className="space-y-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center">
              <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
                {(contactName[0] ?? "?").toUpperCase()}
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-white">{contactName}</p>

            {activeConvo.crm_contacts?.email && (
              <div>
                <p className="text-[10px] text-slate-400 dark:text-white/30 uppercase tracking-widest mb-0.5">Email</p>
                <p className="text-xs text-slate-600 dark:text-white/50 break-all">{activeConvo.crm_contacts.email}</p>
              </div>
            )}
            {activeConvo.crm_contacts?.whatsapp_number && (
              <div>
                <p className="text-[10px] text-slate-400 dark:text-white/30 uppercase tracking-widest mb-0.5">WhatsApp</p>
                <p className="text-xs text-slate-600 dark:text-white/50">{activeConvo.crm_contacts.whatsapp_number}</p>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 dark:border-white/10">
              <p className="text-[10px] text-slate-400 dark:text-white/30 uppercase tracking-widest mb-1">Conversation</p>
              <p className="text-xs text-slate-500 dark:text-white/40">
                Status: <span className={`font-semibold ${activeConvo.status === "open" ? "text-orange-500" : "text-slate-400"}`}>{activeConvo.status}</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-white/40 mt-1">
                Inbox: <span className="font-semibold">{activeConvo.inbox_address}</span>
              </p>
              {activeConvo.channel === "whatsapp" && (
                <p className="text-xs mt-1">
                  <span className={`font-semibold ${winOpen ? "text-emerald-500" : "text-amber-500"}`}>
                    {winOpen ? "24hr window open" : "24hr window closed"}
                  </span>
                </p>
              )}
            </div>

            {activeConvo.crm_contacts?.user_id && (
              <div className="pt-2 border-t border-slate-100 dark:border-white/10">
                <p className="text-[10px] text-slate-400 dark:text-white/30 uppercase tracking-widest mb-1">Leadash User</p>
                <a
                  href={`/admin/users?id=${activeConvo.crm_contacts.user_id}`}
                  className="text-xs text-orange-500 hover:text-orange-400"
                >
                  View profile →
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CrmInboxPage() {
  return (
    <Suspense>
      <CrmInboxContent />
    </Suspense>
  );
}
