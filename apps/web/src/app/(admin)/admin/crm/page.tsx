"use client";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { Linkify, AttachmentGrid, LocationCard, ContactCard, HtmlBody } from "@/components/crm/rich-message";
import { VoiceRecorderButton } from "@/components/crm/voice-recorder";
import { createClient } from "@/lib/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────────

interface CrmContact {
  id:              string;
  display_name:    string | null;
  email:           string | null;
  whatsapp_number: string | null;
  phone:           string | null;
  company:         string | null;
  instagram_id:    string | null;
  facebook_id:     string | null;
  lifecycle_stage: string;
  custom_fields:   Record<string, string>;
  tags:            string[];
  notes:           string | null;
  user_id:         string | null;
  workspace_id:    string | null;
  avatar_url:      string | null;
}

interface LatestMessage {
  id: string; direction: string; body: string | null; channel: string; created_at: string;
}

interface Conversation {
  id:                 string;
  channel:            string;
  inbox_address:      string;
  channel_identifier: string;
  subject:            string | null;
  status:             string;
  assigned_to:        string | null;
  snooze_until:       string | null;
  unread_count:       number;
  last_message_at:    string;
  last_inbound_at:    string | null;
  tags:               string[];
  crm_contacts:       CrmContact | null;
  latest_message:     LatestMessage | null;
}

interface CrmAttachment { name: string; mimeType: string; size: number; url: string; }
interface CrmLocation { latitude: number; longitude: number; name?: string; address?: string; }
interface WaSharedContact { name: string; phone: string; }

interface CrmMediaRef { path: string; name: string; mimeType: string; size: number; url?: string; }
interface ComposerAttachment {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  ref?: CrmMediaRef;
  error?: string;
}

interface CrmMessage {
  id: string; direction: "inbound"|"outbound"; channel: string;
  body: string|null; body_html: string|null; subject: string|null;
  from_address: string|null; from_name: string|null;
  wa_message_type: string|null; status: string;
  delivered_at: string|null; read_at: string|null;
  created_at: string; sent_by: string|null;
  attachments: CrmAttachment[]; location: CrmLocation|null; contacts: WaSharedContact[];
}

interface ContactProfile {
  contact:         CrmContact;
  workspace:       { id: string; name: string; plan_configs: { name: string } | null; lead_credits_balance: number; created_at: string } | null;
  funnel_state:    { challenge_enrolled_at: string|null; day1_completed_at: string|null; upsell_purchased_at: string|null; current_offer: string|null } | null;
  tasks:           Array<{ id: string; title: string; due_at: string|null; completed_at: string|null }>;
  recent_messages: Array<{ id: string; direction: string; channel: string; body: string|null; created_at: string }>;
  conversations:   Array<{ id: string; channel: string; status: string; last_message_at: string }>;
}

interface Task { id: string; title: string; due_at: string|null; completed_at: string|null; }

// ── Helpers ──────────────────────────────────────────────────────────────────

function playNotificationBeep() {
  try {
    const ctx  = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    ctx.close().catch(() => {});
  } catch { /* blocked without prior user gesture */ }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function windowOpen(lastInbound: string | null) {
  if (!lastInbound) return false;
  return (Date.now() - new Date(lastInbound).getTime()) < 24 * 60 * 60 * 1000;
}

// ── Tag color ────────────────────────────────────────────────────────────────

const TAG_COLORS = [
  "bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-500/20",
  "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/20",
  "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20",
  "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/20",
  "bg-pink-100 dark:bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-500/20",
  "bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/20",
];

function tagColor(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xff;
  return TAG_COLORS[h % TAG_COLORS.length];
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [input,  setInput]  = useState("");

  function commit() {
    const t = input.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput("");
    setAdding(false);
  }

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {tags.map(t => (
        <span key={t} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${tagColor(t)}`}>
          {t}
          <button onClick={() => onChange(tags.filter(x => x !== t))} className="hover:opacity-70">×</button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setInput(""); setAdding(false); }
          }}
          onBlur={commit}
          placeholder="tag…"
          className="w-16 text-[10px] px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-white/10 bg-transparent text-slate-700 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:outline-none"
        />
      ) : (
        <button onClick={() => setAdding(true)} className="text-[10px] text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60 px-1">+ tag</button>
      )}
    </div>
  );
}

// ── Channel icon ─────────────────────────────────────────────────────────────

function ChannelIcon({ channel, size = "sm" }: { channel: string; size?: "sm"|"md" }) {
  const cls = size === "md" ? "w-5 h-5" : "w-3.5 h-3.5";
  if (channel === "whatsapp") return (
    <svg className={`${cls} text-emerald-500`} fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.555 4.118 1.528 5.845L0 24l6.335-1.51A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.75 9.75 0 110-19.5 9.75 9.75 0 010 19.5z"/>
    </svg>
  );
  if (channel === "instagram") return (
    <svg className={`${cls} text-pink-500`} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  );
  if (channel === "facebook") return (
    <svg className={`${cls} text-blue-500`} fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
  if (channel === "sms") return (
    <svg className={`${cls} text-teal-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
    </svg>
  );
  return (
    <svg className={`${cls} text-blue-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
    </svg>
  );
}

// ── Lifecycle badge ───────────────────────────────────────────────────────────

const LIFECYCLE_COLORS: Record<string, string> = {
  lead:      "bg-slate-500/20 text-slate-300",
  prospect:  "bg-blue-500/20 text-blue-300",
  customer:  "bg-emerald-500/20 text-emerald-300",
  churned:   "bg-red-500/20 text-red-300",
  blocked:   "bg-red-800/30 text-red-400",
};

function LifecycleBadge({ stage }: { stage: string }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${LIFECYCLE_COLORS[stage] ?? "bg-slate-500/20 text-slate-300"}`}>
      {stage}
    </span>
  );
}

// ── Conversation list item ────────────────────────────────────────────────────

function ConvoItem({ convo, active, selected, onSelect, onClick }: {
  convo: Conversation; active: boolean; selected: boolean;
  onSelect: (e: React.MouseEvent) => void; onClick: () => void;
}) {
  const name = convo.crm_contacts?.display_name ?? convo.crm_contacts?.email ?? convo.crm_contacts?.whatsapp_number ?? convo.channel_identifier;
  const preview = convo.latest_message?.body?.slice(0, 60) ?? "";

  return (
    <div className={`relative group w-full text-left border-b border-slate-100 dark:border-white/5 transition-colors cursor-pointer ${active ? "bg-orange-50 dark:bg-orange-500/10 border-l-2 border-l-orange-500" : "hover:bg-slate-50 dark:hover:bg-white/5"}`}>
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
        <input
          type="checkbox"
          checked={selected}
          onClick={onSelect}
          onChange={() => {}}
          className="w-3.5 h-3.5 rounded border-white/20 bg-white/10 accent-orange-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        />
      </div>
      <button onClick={onClick} className="w-full text-left px-4 py-3.5 pl-8">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <ChannelIcon channel={convo.channel} />
              <span className={`text-sm font-semibold truncate ${active ? "text-orange-700 dark:text-orange-300" : "text-slate-800 dark:text-white"}`}>{name}</span>
            </div>
            {convo.subject && <p className="text-xs text-slate-500 dark:text-white/40 truncate mb-0.5">{convo.subject}</p>}
            {preview && <p className="text-xs text-slate-400 dark:text-white/30 truncate">{preview}</p>}
            {(convo.tags ?? []).length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1">
                {convo.tags.map(t => (
                  <span key={t} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${tagColor(t)}`}>{t}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-[10px] text-slate-400 dark:text-white/20 whitespace-nowrap">{timeAgo(convo.last_message_at)}</span>
            {convo.unread_count > 0 && (
              <span className="w-4 h-4 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center">
                {convo.unread_count > 9 ? "9+" : convo.unread_count}
              </span>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

// ── Emoji picker + formatting toolbar ───────────────────────────────────────────

const COMMON_EMOJIS = [
  "😀","😊","😂","🙏","👍","👎","🔥","✅","❌","⚡","🎉","🚀",
  "💡","💼","📧","📅","💰","🤝","⭐","🌟","✨","💪","🎯","📊",
  "👋","😅","🤔","😍","🥳","🤩","😎","🙌","💯","❤️","👏","🏆",
];

function EmojiPicker({ onSelect }: { onSelect: (e: string) => void }) {
  return (
    <div className="bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-xl shadow-lg p-2.5">
      <div className="grid grid-cols-8 gap-0.5">
        {COMMON_EMOJIS.map(e => (
          <button key={e} onClick={() => onSelect(e)}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-white/10 text-base transition-colors">
            {e}
          </button>
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
      onMouseDown={e => { e.preventDefault(); onClick(e); }}
      onClick={e => e.stopPropagation()}
      className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-white/50 hover:text-slate-800 dark:hover:text-white/80 text-xs transition-colors"
    >
      {children}
    </button>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: CrmMessage }) {
  const isOutbound = msg.direction === "outbound";
  const isNote     = msg.body?.startsWith("[NOTE] ");

  if (isNote) return (
    <div className="flex justify-center my-2">
      <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-lg px-3 py-2 max-w-sm text-xs text-yellow-800 dark:text-yellow-300">
        <span className="font-semibold mr-1">Note:</span>{(msg.body ?? "").replace("[NOTE] ", "")}
      </div>
    </div>
  );

  const isEmailHtml = msg.channel === "email" && !!msg.body_html;

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`max-w-[70%] rounded-2xl px-3.5 py-2.5 text-sm ${isOutbound ? "bg-orange-500 text-white rounded-br-sm" : "bg-white dark:bg-white/10 border border-slate-100 dark:border-white/10 text-slate-800 dark:text-white rounded-bl-sm"}`}>
        {isEmailHtml
          ? <HtmlBody html={msg.body_html!} />
          : msg.body ? <Linkify text={msg.body} /> : null}
        <AttachmentGrid attachments={msg.attachments} />
        <LocationCard location={msg.location} />
        <ContactCard contacts={msg.contacts} />
        <div className={`text-[10px] mt-1 ${isOutbound ? "text-orange-200" : "text-slate-400 dark:text-white/30"}`}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {isOutbound && msg.status === "read"      && " ✓✓"}
          {isOutbound && msg.status === "delivered" && " ✓✓"}
          {isOutbound && msg.status === "sent"      && " ✓"}
        </div>
      </div>
    </div>
  );
}

// ── Contact profile panel ─────────────────────────────────────────────────────

function TaskItem({ task, contactId, onToggle }: { task: Task; contactId: string; onToggle: () => void }) {
  const [loading, setLoading] = useState(false);
  const done = !!task.completed_at;

  async function toggle() {
    setLoading(true);
    await fetch(`/api/crm/contacts/${contactId}/tasks?task=${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !done }),
    });
    setLoading(false);
    onToggle();
  }

  return (
    <div className={`flex items-start gap-2 py-1.5 ${done ? "opacity-50" : ""}`}>
      <button onClick={toggle} disabled={loading} className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${done ? "bg-emerald-500 border-emerald-500" : "border-white/20 hover:border-orange-500"}`}>
        {done && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-xs ${done ? "line-through text-white/30" : "text-white/70"}`}>{task.title}</p>
        {task.due_at && <p className="text-[10px] text-white/30 mt-0.5">{new Date(task.due_at).toLocaleDateString()}</p>}
      </div>
    </div>
  );
}

function ContactProfilePanel({ contact: propContact, conversationId }: { contact: CrmContact; conversationId: string }) {
  const [profile, setProfile] = useState<ContactProfile | null>(null);
  // The parent-owned conversation object supplies `propContact` as read-only.
  // When we PATCH a field (name, notes, tags…) the parent doesn't know to
  // re-fetch, so its `crm_contacts` prop stays stale and the render bounces
  // back to the old value the moment we clear editingField. Overlaying a
  // local copy that we update from the PATCH response fixes that: reads flow
  // through `contact`, writes update `contact` immediately.
  const [contact, setContact] = useState<CrmContact>(propContact);
  useEffect(() => { setContact(propContact); }, [propContact.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [loading, setLoading] = useState(true);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldVal, setFieldVal] = useState("");
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/crm/contacts/${contact.id}`);
      const d = await r.json() as ContactProfile & { contact: CrmContact };
      setProfile(d);
    } finally {
      setLoading(false);
    }
  }, [contact.id]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  async function addTask() {
    if (!newTaskTitle.trim()) return;
    await fetch(`/api/crm/contacts/${contact.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTaskTitle.trim(), conversation_id: conversationId }),
    });
    setNewTaskTitle("");
    setAddingTask(false);
    loadProfile();
  }

  async function saveField(field: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: fieldVal }),
      });
      const d = await res.json().catch(() => null) as { contact?: CrmContact } | null;
      if (res.ok && d?.contact) {
        // Merge the fresh row into local state so the render reflects the
        // saved value the instant we drop out of edit mode — no waiting on
        // loadProfile to hit the server.
        setContact(prev => ({ ...prev, ...d.contact }));
      }
    } finally {
      setSaving(false);
      setEditingField(null);
      loadProfile();
    }
  }

  function startEdit(field: string, current: string) {
    setEditingField(field);
    setFieldVal(current);
  }

  const inp = "w-full px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white placeholder-white/30 focus:outline-none focus:border-orange-500";
  const label = "text-[10px] text-white/30 uppercase tracking-widest mb-1 block";
  const val   = "text-xs text-white/60";

  const name = contact.display_name ?? contact.email ?? contact.whatsapp_number ?? "Unknown";
  const initials = name.slice(0, 2).toUpperCase();

  const fs = profile?.funnel_state;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 text-white">
      {/* Avatar + name */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-orange-400">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          {editingField === "display_name" ? (
            <div className="flex gap-1">
              <input className={inp} value={fieldVal} onChange={e => setFieldVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveField("display_name"); if (e.key === "Escape") setEditingField(null); }} autoFocus />
              <button onClick={() => saveField("display_name")} disabled={saving} className="text-[10px] bg-orange-500 text-white px-2 rounded">{saving ? "…" : "✓"}</button>
            </div>
          ) : (
            <button onClick={() => startEdit("display_name", contact.display_name ?? "")} className="text-sm font-semibold text-white hover:text-orange-300 text-left truncate w-full">{name}</button>
          )}
          {contact.company && <p className="text-xs text-white/40 truncate">{contact.company}</p>}
        </div>
      </div>

      {/* Lifecycle + tags */}
      <div className="flex flex-wrap gap-1.5">
        <LifecycleBadge stage={contact.lifecycle_stage ?? "lead"} />
        {(contact.tags ?? []).map((t: string) => (
          <span key={t} className="text-[10px] bg-white/10 text-white/50 px-2 py-0.5 rounded-full">{t}</span>
        ))}
      </div>

      {/* Contact details */}
      <div className="space-y-2 pt-1 border-t border-white/10">
        <p className={label}>Contact</p>
        {contact.email && <div>
          <p className={label}>Email</p>
          <p className={val}>{contact.email}</p>
        </div>}
        {contact.phone && <div>
          <p className={label}>Phone</p>
          <p className={val}>{contact.phone}</p>
        </div>}
        {contact.whatsapp_number && <div>
          <p className={label}>WhatsApp</p>
          <p className={val}>{contact.whatsapp_number}</p>
        </div>}
        {contact.instagram_id && <div>
          <p className={label}>Instagram ID</p>
          <p className={val}>{contact.instagram_id}</p>
        </div>}
        {contact.facebook_id && <div>
          <p className={label}>Facebook ID</p>
          <p className={val}>{contact.facebook_id}</p>
        </div>}
      </div>

      {/* Channels */}
      {profile && profile.conversations.length > 0 && (
        <div className="pt-1 border-t border-white/10">
          <p className={label}>Channels</p>
          <div className="space-y-1">
            {["email","whatsapp","instagram","facebook","sms"].map(ch => {
              const c = profile.conversations.filter(cv => cv.channel === ch);
              if (!c.length) return null;
              return (
                <div key={ch} className="flex items-center gap-2">
                  <ChannelIcon channel={ch} />
                  <span className="text-xs text-white/50 capitalize">{ch}</span>
                  <span className="text-[10px] text-white/30 ml-auto">{c.length} thread{c.length !== 1 ? "s" : ""}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Workspace / Leadash account */}
      {loading && (
        <div className="pt-1 border-t border-white/10 space-y-2">
          <div className="h-3 bg-white/10 rounded animate-pulse w-1/2" />
          <div className="h-3 bg-white/10 rounded animate-pulse w-3/4" />
        </div>
      )}
      {profile?.workspace && (
        <div className="pt-1 border-t border-white/10">
          <p className={label}>Leadash Workspace</p>
          <a href={`/admin/workspaces/${profile.workspace.id}`} className="block p-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
            <p className="text-xs font-semibold text-white">{profile.workspace.name}</p>
            <p className="text-[11px] text-white/40 mt-0.5">{profile.workspace.plan_configs?.name ?? "Unknown plan"}</p>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[11px] text-emerald-400">{(profile.workspace.lead_credits_balance ?? 0).toLocaleString()} credits</span>
              <span className="text-[10px] text-white/30">→</span>
            </div>
          </a>
        </div>
      )}

      {/* Academy / Funnel journey */}
      {fs && (
        <div className="pt-1 border-t border-white/10">
          <p className={label}>Academy Journey</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${fs.challenge_enrolled_at ? "bg-emerald-500" : "bg-white/10"}`}>
                {fs.challenge_enrolled_at ? "✓" : ""}
              </span>
              <span className="text-xs text-white/50">Challenge enrolled</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${fs.day1_completed_at ? "bg-emerald-500" : "bg-white/10"}`}>
                {fs.day1_completed_at ? "✓" : ""}
              </span>
              <span className="text-xs text-white/50">Day 1 complete</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${fs.upsell_purchased_at ? "bg-emerald-500" : "bg-white/10"}`}>
                {fs.upsell_purchased_at ? "✓" : ""}
              </span>
              <span className="text-xs text-white/50">Bundle purchased</span>
            </div>
          </div>
        </div>
      )}

      {/* Tasks */}
      <div className="pt-1 border-t border-white/10">
        <div className="flex items-center justify-between mb-2">
          <p className={`${label} mb-0`}>Tasks</p>
          <button onClick={() => setAddingTask(true)} className="text-[10px] text-orange-400 hover:text-orange-300">+ Add</button>
        </div>
        {addingTask && (
          <div className="flex gap-1 mb-2">
            <input
              className={inp}
              placeholder="Task title…"
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addTask(); if (e.key === "Escape") setAddingTask(false); }}
              autoFocus
            />
            <button onClick={addTask} className="text-[10px] bg-orange-500 text-white px-2 rounded">✓</button>
          </div>
        )}
        {(profile?.tasks ?? []).length === 0 && !addingTask && (
          <p className="text-[11px] text-white/20">No open tasks</p>
        )}
        {(profile?.tasks ?? []).map(t => (
          <TaskItem key={t.id} task={t} contactId={contact.id} onToggle={loadProfile} />
        ))}
      </div>

      {/* Custom fields */}
      {Object.keys(contact.custom_fields ?? {}).length > 0 && (
        <div className="pt-1 border-t border-white/10">
          <p className={label}>Custom Fields</p>
          {Object.entries(contact.custom_fields).map(([k, v]) => (
            <div key={k} className="mb-1.5">
              <p className={label}>{k}</p>
              <p className={val}>{String(v)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      <div className="pt-1 border-t border-white/10">
        <p className={label}>Notes</p>
        {editingField === "notes" ? (
          <div>
            <textarea className={`${inp} resize-none`} rows={4} value={fieldVal} onChange={e => setFieldVal(e.target.value)} autoFocus />
            <div className="flex gap-1 mt-1">
              <button onClick={() => saveField("notes")} disabled={saving} className="text-[10px] bg-orange-500 text-white px-2 py-1 rounded">{saving ? "Saving…" : "Save"}</button>
              <button onClick={() => setEditingField(null)} className="text-[10px] text-white/30 hover:text-white px-2 py-1">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => startEdit("notes", contact.notes ?? "")} className="text-xs text-white/40 hover:text-white/70 text-left w-full">
            {contact.notes || <span className="text-white/20">Add notes…</span>}
          </button>
        )}
      </div>
    </div>
  );
}

// ── New Conversation Modal ────────────────────────────────────────────────────

interface ContactResult {
  id: string; display_name: string | null; email: string | null;
  whatsapp_number: string | null; phone: string | null; lifecycle_stage: string;
}

type WaTemplate = { id: string; name: string; status: string; components: Array<{ type: string; text?: string }> };

function NewConversationModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [channel,        setChannel]        = useState<"email"|"whatsapp">("email");
  const [toInput,        setToInput]        = useState("");
  const [nameInput,      setNameInput]      = useState("");
  const [inbox,          setInbox]          = useState<"support"|"marketing"|"academy">("support");
  const [subject,        setSubject]        = useState("");
  const [body,           setBody]           = useState("");
  const [useTemplate,    setUseTemplate]    = useState(false);
  const [templateName,   setTemplateName]   = useState("");
  const [templateParams, setTemplateParams] = useState<Record<string,string>>({});
  const [contacts,       setContacts]       = useState<ContactResult[]>([]);
  const [showDropdown,   setShowDropdown]   = useState(false);
  const [waTemplates,    setWaTemplates]    = useState<WaTemplate[]>([]);
  const [sending,        setSending]        = useState(false);
  const [error,          setError]          = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (channel === "whatsapp") {
      fetch("/api/admin/crm-settings/whatsapp-templates")
        .then(r => r.ok ? r.json() : { templates: [] })
        .then((d: { templates?: WaTemplate[] }) => {
          setWaTemplates((d.templates ?? []).filter(t => t.status === "APPROVED"));
        })
        .catch(() => {});
    }
  }, [channel]);

  function searchContacts(q: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setContacts([]); setShowDropdown(false); return; }
    searchTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/crm/contacts?search=${encodeURIComponent(q)}&limit=8`);
      const d = await r.json() as { contacts?: ContactResult[] };
      setContacts(d.contacts ?? []);
      setShowDropdown(true);
    }, 250);
  }

  function pickContact(c: ContactResult) {
    const val = channel === "whatsapp" ? (c.whatsapp_number ?? c.phone ?? "") : (c.email ?? "");
    setToInput(val);
    setNameInput(c.display_name ?? "");
    setShowDropdown(false);
    setContacts([]);
  }

  async function handleSend() {
    if (!toInput.trim() || !body.trim()) {
      setError("Recipient and message are required");
      return;
    }
    setSending(true);
    setError("");
    const res = await fetch("/api/crm/conversations/new", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel,
        to:            toInput.trim(),
        name:          nameInput.trim() || undefined,
        inbox,
        subject:       subject.trim() || undefined,
        body,
        template_name: useTemplate && templateName ? templateName : undefined,
        template_vars: useTemplate && templateName ? templateParams : undefined,
      }),
    });
    const d = await res.json() as { conversation_id?: string; error?: string };
    setSending(false);
    if (!res.ok) { setError(d.error ?? "Failed to send"); return; }
    onCreated(d.conversation_id!);
  }

  const inp  = "w-full px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/30";
  const lbl  = "block text-xs font-semibold text-slate-500 dark:text-white/40 mb-1";

  const tmpl     = waTemplates.find(t => t.name === templateName);
  const bodyComp = tmpl?.components?.find(c => c.type === "BODY");
  const bodyText = bodyComp?.text ?? "";
  const placeholders = [...new Set([...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">New Conversation</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white text-lg leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Channel selector */}
          <div>
            <label className={lbl}>Channel</label>
            <div className="flex gap-2">
              {(["email","whatsapp"] as const).map(ch => (
                <button key={ch} onClick={() => { setChannel(ch); setToInput(""); setContacts([]); setShowDropdown(false); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold border transition-colors ${channel === ch ? "bg-orange-500 border-orange-500 text-white" : "border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/40 hover:border-orange-300"}`}>
                  <ChannelIcon channel={ch} />
                  {ch === "email" ? "Email" : "WhatsApp"}
                </button>
              ))}
            </div>
          </div>

          {/* To field with search dropdown */}
          <div className="relative">
            <label className={lbl}>To</label>
            <input
              className={inp}
              placeholder={channel === "whatsapp" ? "+234 8012345678 or search a contact…" : "email@example.com or search a contact…"}
              value={toInput}
              onChange={e => { setToInput(e.target.value); searchContacts(e.target.value); }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              onFocus={() => { if (contacts.length) setShowDropdown(true); }}
              autoComplete="off"
            />
            {showDropdown && contacts.length > 0 && (
              <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white dark:bg-[#252525] border border-slate-200 dark:border-white/10 rounded-xl shadow-lg overflow-hidden">
                {contacts.map(c => {
                  const sub = channel === "whatsapp"
                    ? (c.whatsapp_number ?? c.phone ?? "no number")
                    : (c.email ?? "no email");
                  return (
                    <button key={c.id} onMouseDown={() => pickContact(c)}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 border-b border-slate-100 dark:border-white/5 last:border-0">
                      <p className="text-sm text-slate-800 dark:text-white font-medium">{c.display_name ?? sub}</p>
                      <p className="text-xs text-slate-400 dark:text-white/30">{sub}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Name (only when "to" looks like a new contact) */}
          <div>
            <label className={lbl}>Name <span className="font-normal opacity-50">(optional)</span></label>
            <input className={inp} placeholder="Contact name…" value={nameInput} onChange={e => setNameInput(e.target.value)} />
          </div>

          {/* Email-specific fields */}
          {channel === "email" && (
            <>
              <div>
                <label className={lbl}>From inbox</label>
                <select value={inbox} onChange={e => setInbox(e.target.value as typeof inbox)}
                  className={inp}>
                  <option value="support">Support (support@leadash.com)</option>
                  <option value="marketing">Marketing (temi@leadash.com)</option>
                  <option value="academy">Academy (academy@leadash.com)</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Subject</label>
                <input className={inp} placeholder="Subject…" value={subject} onChange={e => setSubject(e.target.value)} />
              </div>
            </>
          )}

          {/* WhatsApp template toggle */}
          {channel === "whatsapp" && (
            <div className="flex items-center gap-3">
              <button onClick={() => setUseTemplate(v => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors ${useTemplate ? "bg-green-500" : "bg-slate-200 dark:bg-white/10"}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${useTemplate ? "translate-x-4" : ""}`} />
              </button>
              <label className="text-xs text-slate-600 dark:text-white/50">Use approved template</label>
            </div>
          )}

          {/* WhatsApp template picker */}
          {channel === "whatsapp" && useTemplate && (
            <div className="space-y-2">
              <select value={templateName} onChange={e => { setTemplateName(e.target.value); setTemplateParams({}); }}
                className={inp}>
                <option value="">Choose a template…</option>
                {waTemplates.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
              {waTemplates.length === 0 && (
                <p className="text-xs text-slate-400 dark:text-white/30">No approved templates. Add them in CRM Settings → WhatsApp Templates.</p>
              )}
              {templateName && bodyText && (
                <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-500 dark:text-white/40 font-mono leading-relaxed">{bodyText}</div>
              )}
              {placeholders.map(n => (
                <input key={n} placeholder={`Value for {{${n}}}`}
                  value={templateParams[n] ?? ""}
                  onChange={e => setTemplateParams(p => ({ ...p, [n]: e.target.value }))}
                  className={inp} />
              ))}
            </div>
          )}

          {/* Message body */}
          {!(channel === "whatsapp" && useTemplate && templateName) && (
            <div>
              <label className={lbl}>Message</label>
              <textarea className={`${inp} resize-none`} rows={4}
                placeholder="Type your message…"
                value={body}
                onChange={e => setBody(e.target.value)}
              />
            </div>
          )}

          {channel === "whatsapp" && useTemplate && templateName && (
            <div>
              <label className={lbl}>Message preview</label>
              <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-slate-500 dark:text-white/40">
                {bodyText
                  ? Object.entries(templateParams).reduce((s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v || `{{${k}}}`), bodyText)
                  : <span className="text-white/20">Select a template to preview</span>}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button onClick={handleSend}
            disabled={sending || !toInput.trim() || (channel === "whatsapp" && useTemplate && !templateName)}
            className="w-full py-2.5 text-sm font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white rounded-xl transition-colors">
            {sending ? "Sending…" : "Send Message"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add contact modal ────────────────────────────────────────────────────────

function AddContactModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name,       setName]       = useState("");
  const [email,      setEmail]      = useState("");
  const [whatsapp,   setWhatsapp]   = useState("");
  const [company,    setCompany]    = useState("");
  const [stage,      setStage]      = useState("lead");
  const [tagsInput,  setTagsInput]  = useState("");
  const [notes,      setNotes]      = useState("");
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");

  async function save() {
    setError("");
    if (!name.trim() && !email.trim() && !whatsapp.trim()) {
      setError("Enter at least a name, email, or WhatsApp number.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name:    name.trim() || null,
          email:           email.trim() || null,
          whatsapp_number: whatsapp.trim() || null,
          company:         company.trim() || null,
          lifecycle_stage: stage,
          tags:            tagsInput.split(",").map(t => t.trim()).filter(Boolean),
          notes:           notes.trim() || null,
        }),
      });
      const d = await res.json() as { contact?: CrmContact; error?: string; merged?: boolean };
      if (!res.ok) { setError(d.error ?? "Could not save the contact."); return; }
      onCreated();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const label = "block text-[10px] text-white/40 uppercase tracking-widest mb-1 font-semibold";
  const inp   = "w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/25 focus:outline-none focus:border-orange-500 transition-colors";

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 sm:pt-16 overflow-y-auto">
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md bg-[#141414] border border-white/10 rounded-2xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white">Add contact</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
        </div>
        <p className="text-[11px] text-white/40 mb-5">
          Manually create a CRM contact. Duplicate email or WhatsApp number will merge into the existing row instead of creating a copy.
        </p>

        <div className="space-y-3">
          <div>
            <p className={label}>Full name</p>
            <input className={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Adaora Okonkwo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={label}>Email</p>
              <input className={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <p className={label}>WhatsApp</p>
              <input className={inp} value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+234 801…" />
            </div>
          </div>
          <div>
            <p className={label}>Company (optional)</p>
            <input className={inp} value={company} onChange={e => setCompany(e.target.value)} placeholder="Company or organisation" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={label}>Lifecycle stage</p>
              <select className={inp} value={stage} onChange={e => setStage(e.target.value)}>
                <option value="lead">Lead</option>
                <option value="prospect">Prospect</option>
                <option value="customer">Customer</option>
                <option value="churned">Churned</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <p className={label}>Tags (comma-separated)</p>
              <input className={inp} value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="7-day-challenge, vip" />
            </div>
          </div>
          <div>
            <p className={label}>Notes (optional)</p>
            <textarea className={`${inp} resize-none`} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes about this contact…" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-xs font-semibold text-white/60 hover:text-white px-4 py-2 rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving}
            className="text-xs font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors">
            {saving ? "Saving…" : "Add contact"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk action bar ───────────────────────────────────────────────────────────

function BulkActionBar({ selected, total, onResolveAll, onClearSelection }: {
  selected: Set<string>; total: number;
  onResolveAll: () => void; onClearSelection: () => void;
}) {
  if (selected.size === 0) return null;
  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 bg-[#1a1a1a] border-t border-white/10 px-4 py-2.5 flex items-center gap-3">
      <span className="text-xs text-white/60 font-semibold">{selected.size} selected</span>
      <button onClick={onResolveAll} className="text-xs bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 px-3 py-1.5 rounded-lg font-semibold transition-colors">
        ✓ Resolve all
      </button>
      <button onClick={onClearSelection} className="text-xs text-white/30 hover:text-white/60 ml-auto">Clear</button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function CrmInboxContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const activeId     = searchParams.get("id");

  const [conversations,  setConversations]  = useState<Conversation[]>([]);
  const [messages,       setMessages]       = useState<CrmMessage[]>([]);
  const [activeConvo,    setActiveConvo]    = useState<Conversation | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [sending,        setSending]        = useState(false);
  const [composeText,    setComposeText]    = useState("");
  const [isNote,         setIsNote]         = useState(false);
  const [attachments,    setAttachments]    = useState<ComposerAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusFilter,   setStatusFilter]   = useState("open");
  const [channelFilter,  setChannelFilter]  = useState("all");
  const [dateFilter,     setDateFilter]     = useState(""); // "" | "today" | "7d" | "30d"
  const [tagFilter,      setTagFilter]      = useState<string | null>(null);
  const [convoCursor,    setConvoCursor]    = useState<string | null>(null);
  const [hasMoreConvos,  setHasMoreConvos]  = useState(false);
  const [loadingMoreConvos, setLoadingMoreConvos] = useState(false);
  const [winOpen,        setWinOpen]        = useState(false);
  const [error,          setError]          = useState("");
  const [selected,       setSelected]       = useState<Set<string>>(new Set());
  const [newConvoOpen,   setNewConvoOpen]   = useState(false);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [templateMode,     setTemplateMode]     = useState(false);
  const [waTemplates,      setWaTemplates]      = useState<Array<{ id: string; name: string; status: string; components: Array<{ type: string; text?: string }> }>>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [templateParams,   setTemplateParams]   = useState<Record<string, string>>({});
  const threadRef        = useRef<HTMLDivElement>(null);
  const prevUnreadRef    = useRef(-1); // -1 = suppress beep on first load
  const forceScrollRef   = useRef(false); // set true right before loading a (possibly different) conversation's messages
  const prevMsgCountRef  = useRef(0);
  const lastLoadedIdRef  = useRef<string | null>(null); // which conversation's messages are currently loaded — guards the full reset to genuine switches only
  const oldestCreatedAtRef = useRef<string | null>(null); // cursor for loading older pages ("before")
  const newestCreatedAtRef = useRef<string | null>(null); // cursor for polling new messages ("after")
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder,    setLoadingOlder]    = useState(false);
  // Rich text (email only) + emoji picker (all channels)
  const [composeHtml,     setComposeHtml]     = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showLinkDialog,  setShowLinkDialog]  = useState(false);
  const [linkUrl,         setLinkUrl]         = useState("");
  const composeRichRef  = useRef<HTMLDivElement>(null);   // contentEditable, email only
  const composeTextRef  = useRef<HTMLTextAreaElement>(null); // plain textarea, other channels

  function dateFilterFrom(preset: string): string | undefined {
    if (!preset) return undefined;
    const now = new Date();
    if (preset === "today") { now.setHours(0, 0, 0, 0); return now.toISOString(); }
    const days = preset === "7d" ? 7 : 30;
    now.setDate(now.getDate() - days);
    return now.toISOString();
  }

  const convoParams = useCallback(() => {
    const params = new URLSearchParams({ status: statusFilter });
    if (channelFilter !== "all") params.set("channel", channelFilter);
    if (tagFilter) params.set("tag", tagFilter);
    const from = dateFilterFrom(dateFilter);
    if (from) params.set("from", from);
    return params;
  }, [statusFilter, channelFilter, tagFilter, dateFilter]);

  // Full reset — fetches page 1 and replaces the list. Used on mount and
  // whenever a filter changes.
  const loadConvos = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/crm/conversations?${convoParams()}`);
    const d   = await res.json() as { conversations?: Conversation[]; next_cursor?: string | null; has_more?: boolean };
    setConversations(d.conversations ?? []);
    setConvoCursor(d.next_cursor ?? null);
    setHasMoreConvos(!!d.has_more);
    setLoading(false);
  }, [convoParams]);

  useEffect(() => { loadConvos(); }, [loadConvos]);

  // Infinite scroll — fetches the next older page and appends it.
  async function loadMoreConvos() {
    if (loadingMoreConvos || !hasMoreConvos || !convoCursor) return;
    setLoadingMoreConvos(true);
    try {
      const params = convoParams();
      params.set("cursor", convoCursor);
      const res = await fetch(`/api/crm/conversations?${params}`);
      const d = await res.json() as { conversations?: Conversation[]; next_cursor?: string | null; has_more?: boolean };
      const older = d.conversations ?? [];
      if (older.length) setConversations(prev => [...prev, ...older]);
      setConvoCursor(d.next_cursor ?? null);
      setHasMoreConvos(!!d.has_more);
    } finally {
      setLoadingMoreConvos(false);
    }
  }

  // Poll-driven refresh — refetches only page 1 and merges it into the
  // existing list (updates changed rows, prepends brand-new ones) instead of
  // replacing the whole array, so it doesn't discard pages loaded via
  // infinite scroll the way a full reset would.
  const refreshConvosFirstPage = useCallback(async () => {
    const res = await fetch(`/api/crm/conversations?${convoParams()}`);
    const d   = await res.json() as { conversations?: Conversation[] };
    const fresh = d.conversations ?? [];
    if (!fresh.length) return;
    setConversations(prev => {
      const freshIds = new Set(fresh.map(c => c.id));
      const rest = prev.filter(c => !freshIds.has(c.id));
      return [...fresh, ...rest];
    });
  }, [convoParams]);

  // Distinct tags across currently-loaded conversations, for the filter-by-tag row.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) for (const t of c.tags ?? []) set.add(t);
    return [...set].sort();
  }, [conversations]);

  function toggleTagFilter(tag: string) {
    setTagFilter(prev => prev === tag ? null : tag);
  }

  async function updateConvoTags(convoId: string, tags: string[]) {
    await fetch(`/api/crm/conversations?id=${convoId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    setConversations(prev => prev.map(c => c.id === convoId ? { ...c, tags } : c));
    setActiveConvo(prev => prev && prev.id === convoId ? { ...prev, tags } : prev);
  }

  // Poll every 30 s — refreshes the conversation list, and for the open thread
  // fetches only messages newer than the last one we have (via the "after"
  // cursor) and appends them, rather than re-fetching + replacing the whole
  // thread, which would discard any older history loaded via infinite scroll.
  useEffect(() => {
    const id = setInterval(() => {
      refreshConvosFirstPage();
      const convoId = activeConvo?.id;
      if (convoId && newestCreatedAtRef.current) {
        fetch(`/api/crm/messages?conversation_id=${convoId}&after=${encodeURIComponent(newestCreatedAtRef.current)}`)
          .then(r => r.json())
          .then((d: { messages?: CrmMessage[] }) => {
            const fresh = d.messages ?? [];
            if (fresh.length) {
              setMessages(prev => [...prev, ...fresh]);
              newestCreatedAtRef.current = fresh[fresh.length - 1].created_at;
            }
          })
          .catch(() => {});
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [refreshConvosFirstPage, activeConvo?.id]);

  // Request browser notification permission on first render
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Beep + browser notification when unread count rises between polls
  useEffect(() => {
    const total = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
    if (prevUnreadRef.current >= 0 && total > prevUnreadRef.current) {
      playNotificationBeep();
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const newest = conversations.find(c => (c.unread_count ?? 0) > 0);
        const name   = newest?.crm_contacts?.display_name ?? newest?.crm_contacts?.email ?? newest?.channel_identifier ?? "Someone";
        const body   = newest?.latest_message?.body?.slice(0, 80) ?? "New message in your inbox";
        try {
          new Notification(`New message from ${name}`, { body, icon: "/favicon.ico", tag: "crm-new-msg" });
        } catch { /* some browsers block without prior interaction */ }
      }
    }
    prevUnreadRef.current = total;
  }, [conversations]);

  useEffect(() => {
    setTemplateMode(false);
    setSelectedTemplate("");
    setTemplateParams({});
  }, [activeId]);

  useEffect(() => {
    if (!activeId) { setActiveConvo(null); setMessages([]); lastLoadedIdRef.current = null; return; }
    const c = conversations.find(c => c.id === activeId);
    if (!c) return; // conversations hasn't loaded this id yet — effect re-fires once it does

    if (lastLoadedIdRef.current !== activeId) {
      // Genuine conversation switch (or first load of this id) — full reset.
      lastLoadedIdRef.current = activeId;
      setActiveConvo(c);
      setWinOpen(windowOpen(c.last_inbound_at));
      forceScrollRef.current = true;
      loadMessages(c.id);
      if (c.unread_count > 0) {
        fetch(`/api/crm/conversations?id=${c.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unread_count: 0 }),
        }).then(() => loadConvos());
      }
      if (c.channel === "whatsapp") {
        fetch("/api/admin/crm-settings/whatsapp-templates")
          .then(r => r.ok ? r.json() : { templates: [] })
          .then((d: { templates?: Array<{ id: string; name: string; status: string; components: Array<{ type: string; text?: string }> }> }) => {
            setWaTemplates((d.templates ?? []).filter(t => t.status === "APPROVED"));
          })
          .catch(() => {});
      } else {
        setWaTemplates([]);
      }
    } else {
      // Same conversation — the conversations list just refreshed (poll).
      // Sync lightweight fields only; do NOT re-fetch/replace the message thread.
      setActiveConvo(c);
      setWinOpen(windowOpen(c.last_inbound_at));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, conversations]);

  async function loadMessages(id: string) {
    const res = await fetch(`/api/crm/messages?conversation_id=${id}&limit=50`);
    const d = await res.json() as { messages?: CrmMessage[]; has_more?: boolean };
    const msgs = d.messages ?? [];
    setMessages(msgs);
    setHasMoreMessages(!!d.has_more);
    oldestCreatedAtRef.current = msgs[0]?.created_at ?? null;
    newestCreatedAtRef.current = msgs[msgs.length - 1]?.created_at ?? null;
  }

  async function loadOlderMessages() {
    const convoId = activeConvo?.id;
    if (!convoId || loadingOlder || !hasMoreMessages || !oldestCreatedAtRef.current) return;
    setLoadingOlder(true);
    const el = threadRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    const prevScrollTop    = el?.scrollTop ?? 0;
    try {
      const res = await fetch(`/api/crm/messages?conversation_id=${convoId}&before=${encodeURIComponent(oldestCreatedAtRef.current)}&limit=50`);
      const d = await res.json() as { messages?: CrmMessage[]; has_more?: boolean };
      const older = d.messages ?? [];
      if (older.length) {
        setMessages(prev => [...older, ...prev]);
        oldestCreatedAtRef.current = older[0]?.created_at ?? oldestCreatedAtRef.current;
        // Prepending content shifts everything down — restore the admin's
        // visual scroll position instead of letting it jump to the new top.
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevScrollHeight + prevScrollTop;
        });
      }
      setHasMoreMessages(!!d.has_more);
    } finally {
      setLoadingOlder(false);
    }
  }

  // Only force-scroll to bottom when switching conversations (forceScrollRef,
  // set just before loadMessages) or when a genuinely new message arrives while
  // the admin is already near the bottom — not on every 30s poll-triggered
  // refetch of the same conversation's messages.
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const grew      = messages.length > prevMsgCountRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (forceScrollRef.current || (grew && nearBottom)) {
      el.scrollTop = el.scrollHeight;
      forceScrollRef.current = false;
    }
    prevMsgCountRef.current = messages.length;
  }, [messages]);

  async function handleSend() {
    if (!activeConvo) return;
    setSending(true);
    setError("");

    if (templateMode && selectedTemplate) {
      const tmpl = waTemplates.find(t => t.name === selectedTemplate);
      const bodyComp = tmpl?.components?.find(c => c.type === "BODY");
      let preview = bodyComp?.text ?? selectedTemplate;
      Object.entries(templateParams).forEach(([k, v]) => {
        preview = preview.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v || `{{${k}}}`);
      });
      const res = await fetch("/api/crm/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: activeConvo.id,
          body:            preview,
          channel:         activeConvo.channel,
          template_name:   selectedTemplate,
          template_vars:   templateParams,
        }),
      });
      const d = await res.json() as { error?: string };
      setSending(false);
      if (!res.ok) { setError(d.error ?? "Send failed"); return; }
      setSelectedTemplate("");
      setTemplateParams({});
      await loadMessages(activeConvo.id);
      await loadConvos();
      return;
    }

    const readyAttachments = attachments.filter(a => a.status === "done").map(a => a.ref!);
    if (!composeText.trim() && !readyAttachments.length) { setSending(false); return; }
    if (attachments.some(a => a.status === "uploading")) {
      setSending(false);
      setError("Attachments are still uploading — wait a moment and try again");
      return;
    }
    const isRichEmail = activeConvo.channel === "email" && !isNote;
    const res = await fetch("/api/crm/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: activeConvo.id,
        body:            composeText,
        html:            isRichEmail ? composeHtml : undefined,
        channel:         activeConvo.channel,
        note:            isNote || undefined,
        attachments:     isNote ? undefined : readyAttachments,
      }),
    });
    const d = await res.json() as { error?: string; requires_template?: boolean };
    setSending(false);
    if (!res.ok) {
      setError(d.requires_template ? "24-hour window closed — switch to the Template tab." : (d.error ?? "Send failed"));
      return;
    }
    setComposeText("");
    setComposeHtml("");
    if (composeRichRef.current) composeRichRef.current.innerHTML = "";
    setIsNote(false);
    setAttachments([]);
    await loadMessages(activeConvo.id);
    await loadConvos();
  }

  // Email only — rich text via a contentEditable div, mirroring the outreach
  // CRM's compose box ((app)/crm/CrmClient.tsx) so both surfaces behave the same.
  function execFormat(cmd: string, value?: string) {
    composeRichRef.current?.focus();
    document.execCommand(cmd, false, value);
    setComposeHtml(composeRichRef.current?.innerHTML ?? "");
    setComposeText(composeRichRef.current?.innerText ?? "");
  }

  function handleInsertLink() {
    if (!linkUrl.trim()) return;
    execFormat("createLink", linkUrl.trim());
    setShowLinkDialog(false);
    setLinkUrl("");
  }

  function insertEmoji(emoji: string, isEmailRich: boolean) {
    if (isEmailRich) {
      execFormat("insertText", emoji);
      return;
    }
    const el = composeTextRef.current;
    if (!el) { setComposeText(t => t + emoji); return; }
    const start = el.selectionStart ?? composeText.length;
    const end   = el.selectionEnd ?? composeText.length;
    const next  = composeText.slice(0, start) + emoji + composeText.slice(end);
    setComposeText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // Uploads directly to Supabase Storage from the browser — the file bytes
  // never pass through our serverless function (which only mints a signed
  // upload token via tiny JSON request/response). This avoids Vercel's
  // ~4.5MB request-body cap, which a proxied upload would hit for anything
  // longer than a short voice note and return as a plain-text 413 that broke
  // JSON parsing client-side.
  async function uploadComposerAttachment(file: File | Blob, name: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setAttachments(prev => [...prev, { id, name, size: file.size, status: "uploading" }]);
    try {
      const mimeType = file.type || "application/octet-stream";
      const mintRes = await fetch("/api/crm/media/upload", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, mimeType, size: file.size }),
      });
      const mintText = await mintRes.text();
      const mint = mintText ? JSON.parse(mintText) : {};
      if (!mintRes.ok) throw new Error(mint.error ?? `Upload failed (${mintRes.status})`);

      const { error } = await createClient().storage
        .from("crm-media")
        .uploadToSignedUrl(mint.path, mint.token, file, { contentType: mimeType });
      if (error) throw new Error(error.message);

      const ref: CrmMediaRef = { path: mint.path, name: mint.name, mimeType: mint.mimeType, size: mint.size };
      setAttachments(prev => prev.map(a => a.id === id ? { ...a, status: "done", ref } : a));
    } catch (err) {
      setAttachments(prev => prev.map(a => a.id === id ? { ...a, status: "error", error: err instanceof Error ? err.message : String(err) } : a));
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach(f => uploadComposerAttachment(f, f.name));
    e.target.value = "";
  }

  function handleVoiceNote(blob: Blob, mimeType: string) {
    const ext = mimeType.includes("ogg") ? "ogg" : "webm";
    uploadComposerAttachment(blob, `voice-note-${Date.now()}.${ext}`);
  }

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

  async function resolveSelected() {
    await Promise.all([...selected].map(id =>
      fetch(`/api/crm/conversations?id=${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      })
    ));
    setSelected(new Set());
    loadConvos();
  }

  function toggleSelect(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const contactName = activeConvo?.crm_contacts?.display_name ?? activeConvo?.crm_contacts?.email ?? activeConvo?.crm_contacts?.whatsapp_number ?? activeConvo?.channel_identifier ?? "";

  return (
    <div className="flex h-full min-h-screen bg-slate-50 dark:bg-[#0f0f0f]">
      {newConvoOpen && (
        <NewConversationModal
          onClose={() => setNewConvoOpen(false)}
          onCreated={(id) => {
            setNewConvoOpen(false);
            loadConvos().then(() => router.push(`/admin/crm?id=${id}`, { scroll: false }));
          }}
        />
      )}
      {newContactOpen && (
        <AddContactModal
          onClose={() => setNewContactOpen(false)}
          onCreated={() => { setNewContactOpen(false); void loadConvos(); }}
        />
      )}

      {/* ── Left: conversation list ─────────────────────────────────────── */}
      <div className="w-[300px] flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-r border-slate-200 dark:border-white/10 flex flex-col relative">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-white/10 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-bold text-slate-800 dark:text-white">Inbox</h1>
            <div className="flex items-center gap-2">
              <button onClick={() => setNewContactOpen(true)}
                className="text-[10px] font-bold bg-white/10 hover:bg-white/20 text-white/80 px-2.5 py-1 rounded-lg transition-colors">
                + Contact
              </button>
              <button onClick={() => setNewConvoOpen(true)}
                className="text-[10px] font-bold bg-orange-500 hover:bg-orange-400 text-white px-2.5 py-1 rounded-lg transition-colors">
                + Chat
              </button>
              <a href="/admin/crm-settings" className="text-[10px] text-white/30 hover:text-white/60 transition-colors">⚙</a>
            </div>
          </div>
          {/* Status filter */}
          <div className="flex gap-1 mb-2">
            {["open","pending","resolved","all"].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`flex-1 text-[10px] font-semibold py-1 rounded-md transition-colors ${statusFilter === s ? "bg-orange-500 text-white" : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/60"}`}>
                {s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          {/* Channel filter */}
          <div className="flex gap-1 flex-wrap mb-2">
            {["all","email","whatsapp","instagram","facebook"].map(c => (
              <button key={c} onClick={() => setChannelFilter(c)}
                className={`flex-1 min-w-[36px] text-[10px] font-semibold py-1 rounded-md transition-colors ${channelFilter === c ? "bg-slate-800 dark:bg-white/20 text-white" : "bg-slate-100 dark:bg-white/10 text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/50"}`}>
                {c === "all" ? "All" : <span className="flex justify-center"><ChannelIcon channel={c} /></span>}
              </button>
            ))}
          </div>
          {/* Date filter */}
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            className="w-full text-[10px] font-semibold px-2 py-1 mb-2 rounded-md bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/40 border-0 focus:outline-none focus:ring-1 focus:ring-orange-500/30">
            <option value="">All time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          {/* Tag filter */}
          {allTags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {allTags.map(t => (
                <button key={t} onClick={() => toggleTagFilter(t)}
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border transition-colors ${tagFilter === t ? "bg-orange-500 border-orange-500 text-white" : tagColor(t)}`}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* List */}
        <div
          className="flex-1 overflow-y-auto pb-14"
          onScroll={e => {
            const el = e.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) loadMoreConvos();
          }}
        >
          {loading && conversations.length === 0 ? (
            <div className="space-y-1 p-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-slate-100 dark:bg-white/5 rounded-lg animate-pulse" />)}
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 dark:text-white/20">No conversations</div>
          ) : (
            <>
              {conversations.map(c => (
                <ConvoItem
                  key={c.id}
                  convo={c}
                  active={c.id === activeId}
                  selected={selected.has(c.id)}
                  onSelect={e => toggleSelect(e, c.id)}
                  onClick={() => router.push(`/admin/crm?id=${c.id}`, { scroll: false })}
                />
              ))}
              {loadingMoreConvos && (
                <div className="flex justify-center py-3">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-white/20 border-t-orange-500 animate-spin" />
                </div>
              )}
            </>
          )}
        </div>

        <BulkActionBar
          selected={selected}
          total={conversations.length}
          onResolveAll={resolveSelected}
          onClearSelection={() => setSelected(new Set())}
        />
      </div>

      {/* ── Middle: thread ─────────────────────────────────────────────── */}
      {activeConvo ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <div className="bg-white dark:bg-[#1a1a1a] border-b border-slate-200 dark:border-white/10 px-6 py-3 flex items-center gap-4 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <ChannelIcon channel={activeConvo.channel} size="md" />
                <h2 className="text-sm font-bold text-slate-800 dark:text-white truncate">{contactName}</h2>
                {!winOpen && (activeConvo.channel === "whatsapp" || activeConvo.channel === "instagram" || activeConvo.channel === "facebook") && (
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded font-semibold">24hr closed</span>
                )}
              </div>
              {activeConvo.subject && <p className="text-xs text-slate-400 dark:text-white/30 truncate">{activeConvo.subject}</p>}
              <TagEditor tags={activeConvo.tags ?? []} onChange={tags => updateConvoTags(activeConvo.id, tags)} />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {["open","pending"].includes(activeConvo.status) ? (
                <button onClick={() => updateStatus("resolved")} className="text-xs font-semibold px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 rounded-lg transition-colors">
                  Resolve
                </button>
              ) : (
                <button onClick={() => updateStatus("open")} className="text-xs font-semibold px-3 py-1.5 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-white/40 hover:bg-slate-200 rounded-lg transition-colors">
                  Reopen
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div ref={threadRef} onScroll={e => { if (e.currentTarget.scrollTop < 100) loadOlderMessages(); }}
            className="flex-1 overflow-y-auto px-6 py-4">
            {loadingOlder && (
              <div className="flex justify-center py-2">
                <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-white/20 border-t-orange-500 animate-spin" />
              </div>
            )}
            {!loadingOlder && hasMoreMessages && (
              <div className="text-center text-[11px] text-slate-300 dark:text-white/20 pb-2">Scroll up for older messages</div>
            )}
            {messages.length === 0 ? (
              <div className="text-center text-xs text-slate-300 dark:text-white/20 mt-20">No messages yet</div>
            ) : (
              messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
            )}
          </div>

          {/* Compose */}
          <div className="bg-white dark:bg-[#1a1a1a] border-t border-slate-200 dark:border-white/10 p-4 flex-shrink-0"
            onClick={() => { setShowEmojiPicker(false); setShowLinkDialog(false); }}>
            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
            <div className="flex gap-2 mb-2">
              <button onClick={() => { setIsNote(false); setTemplateMode(false); }}
                className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${!isNote && !templateMode ? "bg-orange-500 text-white" : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/30"}`}>
                Reply
              </button>
              <button onClick={() => { setIsNote(true); setTemplateMode(false); }}
                className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${isNote && !templateMode ? "bg-yellow-400 text-yellow-900" : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/30"}`}>
                Note
              </button>
              {activeConvo.channel === "whatsapp" && (
                <button onClick={() => { setIsNote(false); setTemplateMode(true); }}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${templateMode ? "bg-green-600 text-white" : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-white/30"}`}>
                  Template
                </button>
              )}
            </div>
            {templateMode ? (
              <div className="space-y-2">
                <select value={selectedTemplate} onChange={e => { setSelectedTemplate(e.target.value); setTemplateParams({}); }}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500/30">
                  <option value="">Choose a template…</option>
                  {waTemplates.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
                {waTemplates.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-white/30">No approved templates. Add them in Admin → CRM Settings.</p>
                )}
                {selectedTemplate && (() => {
                  const tmpl = waTemplates.find(t => t.name === selectedTemplate);
                  const bodyComp = tmpl?.components?.find(c => c.type === "BODY");
                  const bodyText = bodyComp?.text ?? "";
                  const unique = [...new Set([...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]))];
                  return (
                    <>
                      {bodyText && (
                        <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-slate-500 dark:text-white/40 font-mono leading-relaxed">
                          {bodyText}
                        </div>
                      )}
                      {unique.map(n => (
                        <input key={n}
                          placeholder={`Value for {{${n}}}`}
                          value={templateParams[n] ?? ""}
                          onChange={e => setTemplateParams(p => ({ ...p, [n]: e.target.value }))}
                          className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-green-500/30"
                        />
                      ))}
                    </>
                  );
                })()}
                <button onClick={handleSend} disabled={sending || !selectedTemplate}
                  className="w-full px-4 py-2.5 text-sm font-semibold bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-xl transition-colors">
                  {sending ? "…" : "Send Template"}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {!isNote && attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {attachments.map(f => (
                      <div key={f.id} className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-lg text-xs ${
                        f.status === "error" ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25 text-red-600 dark:text-red-300" : "bg-slate-100 dark:bg-white/8 border-slate-200 dark:border-white/12 text-slate-600 dark:text-white/70"
                      }`}>
                        {f.status === "uploading" ? (
                          <svg className="w-3 h-3 animate-spin text-slate-400 dark:text-white/40" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        ) : (
                          <svg viewBox="0 0 20 20" fill="currentColor" className={`w-3 h-3 ${f.status === "error" ? "text-red-500 dark:text-red-400" : "text-slate-400 dark:text-white/40"}`}><path fillRule="evenodd" d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z" clipRule="evenodd"/></svg>
                        )}
                        <span className="max-w-[140px] truncate">{f.name}</span>
                        <span className="text-slate-400 dark:text-white/30 text-[10px]">{f.status === "error" ? (f.error ?? "Failed") : f.size < 1_048_576 ? `${(f.size/1024).toFixed(0)}KB` : `${(f.size/1_048_576).toFixed(1)}MB`}</span>
                        <button onClick={() => setAttachments(a => a.filter(x => x.id !== f.id))} className="text-slate-400 dark:text-white/30 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-0.5">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {(activeConvo.channel === "email" && !isNote && !templateMode) && (
                  <div className="flex items-center gap-1 relative">
                    <ToolbarBtn title="Bold" onClick={() => execFormat("bold")}><b>B</b></ToolbarBtn>
                    <ToolbarBtn title="Italic" onClick={() => execFormat("italic")}><i>I</i></ToolbarBtn>
                    <ToolbarBtn title="Underline" onClick={() => execFormat("underline")}><u>U</u></ToolbarBtn>
                    <ToolbarBtn title="Insert link" onClick={e => { e.stopPropagation(); setShowLinkDialog(v => !v); setShowEmojiPicker(false); }}>
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd"/></svg>
                    </ToolbarBtn>
                    {showLinkDialog && (
                      <div onClick={e => e.stopPropagation()}
                        className="absolute bottom-9 left-0 z-20 flex gap-1.5 bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-xl shadow-lg p-2">
                        <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleInsertLink(); }}
                          placeholder="https://…" autoFocus
                          className="px-2 py-1 text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/20 w-48 focus:outline-none" />
                        <button onClick={handleInsertLink} className="text-xs font-semibold px-2.5 py-1 bg-orange-500 text-white rounded-lg">Add</button>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-3 items-end">
                  {(activeConvo.channel === "email" && !isNote && !templateMode) ? (
                    <div
                      ref={composeRichRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={() => { setComposeHtml(composeRichRef.current?.innerHTML ?? ""); setComposeText(composeRichRef.current?.innerText ?? ""); }}
                      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend(); }}
                      data-placeholder="Type a message… (Cmd+Enter to send)"
                      className="flex-1 min-h-[76px] max-h-40 overflow-y-auto px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 dark:empty:before:text-white/20"
                    />
                  ) : (
                    <textarea
                      ref={composeTextRef}
                      value={composeText}
                      onChange={e => setComposeText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend(); }}
                      placeholder={isNote ? "Add an internal note…" : "Type a message… (Cmd+Enter to send)"}
                      rows={3}
                      className="flex-1 resize-none px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                  )}
                  {!isNote && (
                    <div className="flex items-center gap-1 pb-1 relative">
                      <button onClick={() => fileInputRef.current?.click()} title="Attach file"
                        className="p-1.5 rounded-md text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white/70 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z" clipRule="evenodd"/></svg>
                      </button>
                      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
                      <VoiceRecorderButton onRecorded={handleVoiceNote} />
                      <ToolbarBtn title="Emoji" onClick={e => { e.stopPropagation(); setShowEmojiPicker(v => !v); setShowLinkDialog(false); }}>
                        <span className="text-sm">🙂</span>
                      </ToolbarBtn>
                      {showEmojiPicker && (
                        <div onClick={e => e.stopPropagation()} className="absolute bottom-10 right-0 z-20">
                          <EmojiPicker onSelect={e => insertEmoji(e, (activeConvo.channel === "email" && !isNote && !templateMode))} />
                        </div>
                      )}
                    </div>
                  )}
                  <button onClick={handleSend} disabled={sending || (!composeText.trim() && !attachments.some(a => a.status === "done"))}
                    className="px-4 py-2.5 text-sm font-semibold bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white rounded-xl transition-colors">
                    {sending ? "…" : "Send"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-300 dark:text-white/20 text-sm">
          Select a conversation
        </div>
      )}

      {/* ── Right: contact profile panel ─────────────────────────────── */}
      {activeConvo && (
        <div className="w-72 flex-shrink-0 bg-[#111] border-l border-white/10 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex-shrink-0">
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Contact Profile</p>
          </div>
          {activeConvo.crm_contacts ? (
            <ContactProfilePanel
              contact={activeConvo.crm_contacts}
              conversationId={activeConvo.id}
            />
          ) : (
            <div className="p-4 text-xs text-white/30">No contact linked</div>
          )}
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
