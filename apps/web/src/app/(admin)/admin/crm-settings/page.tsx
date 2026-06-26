"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChannelConfig {
  id:               string;
  channel:          "instagram" | "facebook" | "sms";
  status:           "connected" | "disconnected" | "error";
  config:           Record<string, string>;
  token_expires_at: string | null;
  updated_at:       string;
}

interface AdminSetting {
  key:   string;
  value: string;
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="3.5"/>
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

function SmsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 15.75h3" />
    </svg>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected:    "bg-emerald-500/20 text-emerald-300",
    disconnected: "bg-white/10 text-white/40",
    error:        "bg-red-500/20 text-red-400",
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${colors[status] ?? colors.disconnected}`}>
      {status}
    </span>
  );
}

// ─── Section Wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-white/10">
        <h2 className="text-sm font-semibold text-white/80">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, type = "text", placeholder = "", hint = "",
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-white/50">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50"
      />
      {hint && <p className="text-[11px] text-white/30">{hint}</p>}
    </div>
  );
}

// ─── Channel Card ─────────────────────────────────────────────────────────────

interface ChannelCardProps {
  channel:    "instagram" | "facebook" | "sms";
  label:      string;
  icon:       React.ReactNode;
  config:     ChannelConfig | null;
  onSave:     (creds: Record<string, string>, cfg: Record<string, string>) => Promise<void>;
  onDisconnect: () => Promise<void>;
}

function InstagramCard({ config, onSave, onDisconnect }: Pick<ChannelCardProps, "config" | "onSave" | "onDisconnect">) {
  const [token,   setToken]   = useState(config?.config?.access_token ?? "");
  const [pageId,  setPageId]  = useState(config?.config?.page_id ?? "");
  const [igId,    setIgId]    = useState(config?.config?.ig_user_id ?? "");
  const [saving,  setSaving]  = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave(
      { access_token: token },
      { page_id: pageId, ig_user_id: igId },
    );
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <Field label="Long-lived Page Access Token" value={token} onChange={setToken} type="password"
        hint="Generate via Meta for Developers → App Dashboard → Instagram → Generate Token" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Facebook Page ID" value={pageId} onChange={setPageId} placeholder="e.g. 123456789" />
        <Field label="Instagram Business Account ID" value={igId} onChange={setIgId} placeholder="e.g. 987654321" />
      </div>
      <div className="bg-white/5 rounded-lg p-3 text-[11px] text-white/40 space-y-1">
        <p className="font-medium text-white/50">Webhook endpoint to register in Meta Dashboard:</p>
        <code className="text-orange-400/80 font-mono">https://leadash.com/api/crm/inbound-instagram</code>
        <p className="mt-1">Verify token: <code className="text-orange-400/80">leadash_webhook_token</code> (or set META_WEBHOOK_VERIFY_TOKEN env var)</p>
        <p>Subscribe to fields: <code className="text-white/60">messages, messaging_postbacks, messaging_optins</code></p>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !token}
          className="flex-1 bg-pink-600/30 hover:bg-pink-600/50 border border-pink-500/30 text-pink-200 text-sm py-2 rounded-lg transition disabled:opacity-40">
          {saving ? "Saving…" : config?.status === "connected" ? "Update" : "Connect"}
        </button>
        {config?.status === "connected" && (
          <button onClick={onDisconnect}
            className="px-3 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/20 text-red-400 text-sm rounded-lg transition">
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

function FacebookCard({ config, onSave, onDisconnect }: Pick<ChannelCardProps, "config" | "onSave" | "onDisconnect">) {
  const [token,  setToken]  = useState(config?.config?.access_token ?? "");
  const [pageId, setPageId] = useState(config?.config?.page_id ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave({ access_token: token }, { page_id: pageId });
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <Field label="Long-lived Page Access Token" value={token} onChange={setToken} type="password"
        hint="Meta for Developers → App Dashboard → Messenger → Generate Token" />
      <Field label="Facebook Page ID" value={pageId} onChange={setPageId} placeholder="e.g. 123456789" />
      <div className="bg-white/5 rounded-lg p-3 text-[11px] text-white/40 space-y-1">
        <p className="font-medium text-white/50">Webhook endpoint to register in Meta Dashboard:</p>
        <code className="text-orange-400/80 font-mono">https://leadash.com/api/crm/inbound-facebook</code>
        <p className="mt-1">Verify token: <code className="text-orange-400/80">leadash_webhook_token</code></p>
        <p>Subscribe to: <code className="text-white/60">messages, messaging_postbacks, messaging_deliveries, messaging_reads</code></p>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !token}
          className="flex-1 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/30 text-blue-200 text-sm py-2 rounded-lg transition disabled:opacity-40">
          {saving ? "Saving…" : config?.status === "connected" ? "Update" : "Connect"}
        </button>
        {config?.status === "connected" && (
          <button onClick={onDisconnect}
            className="px-3 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/20 text-red-400 text-sm rounded-lg transition">
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

function SmsCard({ config, onSave, onDisconnect }: Pick<ChannelCardProps, "config" | "onSave" | "onDisconnect">) {
  const [provider, setProvider] = useState<"twilio" | "africastalking">(
    (config?.config?.provider as "twilio" | "africastalking") ?? "twilio"
  );
  const [apiKey,    setApiKey]   = useState(config?.config?.api_key ?? "");
  const [apiSecret, setApiSecret]= useState(config?.config?.api_secret ?? "");
  const [sender,    setSender]   = useState(config?.config?.sender_id ?? "");
  const [saving,    setSaving]   = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave(
      { api_key: apiKey, api_secret: apiSecret },
      { provider, sender_id: sender },
    );
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["twilio", "africastalking"] as const).map(p => (
          <button key={p} onClick={() => setProvider(p)}
            className={`flex-1 py-2 text-sm rounded-lg border transition ${
              provider === p
                ? "bg-teal-600/30 border-teal-500/40 text-teal-200"
                : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
            }`}>
            {p === "twilio" ? "Twilio" : "Africa's Talking"}
          </button>
        ))}
      </div>
      {provider === "twilio" ? (
        <>
          <Field label="Account SID" value={apiKey} onChange={setApiKey} placeholder="ACxxxxxxxxxxxxxxxx" />
          <Field label="Auth Token" value={apiSecret} onChange={setApiSecret} type="password" />
          <Field label="Sender Number" value={sender} onChange={setSender} placeholder="+12345678901" hint="Must be a Twilio phone number" />
        </>
      ) : (
        <>
          <Field label="API Key" value={apiKey} onChange={setApiKey} />
          <Field label="Username" value={apiSecret} onChange={setApiSecret} hint="Your Africa's Talking username" />
          <Field label="Sender ID" value={sender} onChange={setSender} placeholder="LEADASH" hint="Alphanumeric sender ID registered with Africa's Talking" />
        </>
      )}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !apiKey}
          className="flex-1 bg-teal-600/30 hover:bg-teal-600/50 border border-teal-500/30 text-teal-200 text-sm py-2 rounded-lg transition disabled:opacity-40">
          {saving ? "Saving…" : config?.status === "connected" ? "Update" : "Connect"}
        </button>
        {config?.status === "connected" && (
          <button onClick={onDisconnect}
            className="px-3 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/20 text-red-400 text-sm rounded-lg transition">
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

function ChannelCard({ channel, label, icon, config, onSave, onDisconnect }: ChannelCardProps) {
  const [expanded, setExpanded] = useState(config?.status === "connected" ? false : true);

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-3">
          <span className="text-white/60">{icon}</span>
          <span className="text-sm font-medium text-white/80">{label}</span>
          <StatusBadge status={config?.status ?? "disconnected"} />
          {config?.token_expires_at && (
            <span className="text-[10px] text-yellow-400/70">
              expires {new Date(config.token_expires_at).toLocaleDateString()}
            </span>
          )}
        </div>
        <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-white/30 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {expanded && (
        <div className="px-5 pb-5 border-t border-white/10 pt-4">
          {channel === "instagram" && <InstagramCard config={config} onSave={onSave} onDisconnect={onDisconnect} />}
          {channel === "facebook"  && <FacebookCard  config={config} onSave={onSave} onDisconnect={onDisconnect} />}
          {channel === "sms"       && <SmsCard       config={config} onSave={onSave} onDisconnect={onDisconnect} />}
        </div>
      )}
    </div>
  );
}

// ─── Business Hours ───────────────────────────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface BusinessHours {
  enabled:  boolean[];
  start:    string[];
  end:      string[];
  timezone: string;
}

function BusinessHoursEditor({ value, onChange }: { value: BusinessHours; onChange: (v: BusinessHours) => void }) {
  const toggle = (i: number) => {
    const enabled = [...value.enabled];
    enabled[i] = !enabled[i];
    onChange({ ...value, enabled });
  };
  const setField = (field: "start" | "end", i: number, v: string) => {
    const arr = [...value[field]];
    arr[i] = v;
    onChange({ ...value, [field]: arr });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 mb-3">
        <label className="text-xs text-white/50">Timezone</label>
        <input
          value={value.timezone}
          onChange={e => onChange({ ...value, timezone: e.target.value })}
          placeholder="Africa/Lagos"
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50 w-48"
        />
      </div>
      {DAY_LABELS.map((day, i) => (
        <div key={day} className="flex items-center gap-3">
          <button
            onClick={() => toggle(i)}
            className={`w-12 text-xs py-1 rounded transition ${
              value.enabled[i]
                ? "bg-orange-500/30 text-orange-300 border border-orange-500/30"
                : "bg-white/5 text-white/30 border border-white/10"
            }`}
          >
            {day}
          </button>
          {value.enabled[i] ? (
            <div className="flex items-center gap-2">
              <input type="time" value={value.start[i]} onChange={e => setField("start", i, e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-orange-500/50" />
              <span className="text-white/30 text-xs">–</span>
              <input type="time" value={value.end[i]} onChange={e => setField("end", i, e.target.value)}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-orange-500/50" />
            </div>
          ) : (
            <span className="text-xs text-white/20">Closed</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Canned Responses ─────────────────────────────────────────────────────────

interface CannedResponse {
  id:       string;
  shortcut: string;
  text:     string;
  channel?: string;
}

function CannedResponsesEditor({
  responses, onChange,
}: {
  responses: CannedResponse[];
  onChange:  (r: CannedResponse[]) => void;
}) {
  const [shortcut, setShortcut] = useState("");
  const [text,     setText]     = useState("");

  const add = () => {
    if (!shortcut || !text) return;
    onChange([...responses, { id: Date.now().toString(), shortcut, text }]);
    setShortcut("");
    setText("");
  };

  const remove = (id: string) => onChange(responses.filter(r => r.id !== id));

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {responses.length === 0 && (
          <p className="text-xs text-white/30 text-center py-4">No canned responses yet</p>
        )}
        {responses.map(r => (
          <div key={r.id} className="flex items-start gap-2 bg-white/5 rounded-lg p-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-orange-400/80 font-mono">/{r.shortcut}</p>
              <p className="text-xs text-white/60 mt-0.5 whitespace-pre-wrap break-words">{r.text}</p>
            </div>
            <button onClick={() => remove(r.id)} className="text-white/20 hover:text-red-400 transition flex-shrink-0">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 pt-3 space-y-2">
        <div className="flex gap-2 items-center">
          <span className="text-white/30 text-sm">/</span>
          <input value={shortcut} onChange={e => setShortcut(e.target.value.replace(/\s/g, ""))}
            placeholder="shortcut" className="w-28 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50" />
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder="Message text…" rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50 resize-none" />
        <button onClick={add} disabled={!shortcut || !text}
          className="bg-orange-600/30 hover:bg-orange-600/50 border border-orange-500/30 text-orange-200 text-sm px-4 py-2 rounded-lg transition disabled:opacity-40">
          Add Response
        </button>
      </div>
    </div>
  );
}

// ─── Custom Fields Editor ─────────────────────────────────────────────────────

interface CustomFieldDef {
  key:      string;
  label:    string;
  type:     "text" | "number" | "date" | "boolean" | "select";
  options?: string[];
}

function CustomFieldsEditor({
  fields, onChange,
}: {
  fields:   CustomFieldDef[];
  onChange: (f: CustomFieldDef[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [type,  setType]  = useState<CustomFieldDef["type"]>("text");

  const add = () => {
    if (!label) return;
    const key = label.toLowerCase().replace(/[^a-z0-9]/g, "_");
    onChange([...fields, { key, label, type }]);
    setLabel("");
    setType("text");
  };
  const remove = (key: string) => onChange(fields.filter(f => f.key !== key));

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
        {fields.length === 0 && (
          <p className="text-xs text-white/30 text-center py-3">No custom fields defined</p>
        )}
        {fields.map(f => (
          <div key={f.key} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
            <div>
              <span className="text-xs text-white/70">{f.label}</span>
              <span className="text-[10px] text-white/30 ml-2 font-mono">key: {f.key}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/30 bg-white/10 px-1.5 py-0.5 rounded">{f.type}</span>
              <button onClick={() => remove(f.key)} className="text-white/20 hover:text-red-400 transition">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 pt-3 flex gap-2">
        <input value={label} onChange={e => setLabel(e.target.value)}
          placeholder="Field label" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50" />
        <select value={type} onChange={e => setType(e.target.value as CustomFieldDef["type"])}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-white/70 focus:outline-none">
          {(["text","number","date","boolean","select"] as const).map(t => (
            <option key={t} value={t} className="bg-zinc-900">{t}</option>
          ))}
        </select>
        <button onClick={add} disabled={!label}
          className="bg-orange-600/30 hover:bg-orange-600/50 border border-orange-500/30 text-orange-200 text-sm px-3 py-2 rounded-lg transition disabled:opacity-40">
          Add
        </button>
      </div>
    </div>
  );
}

// ─── SLA Editor ───────────────────────────────────────────────────────────────

interface SlaConfig {
  first_response_minutes:  number;
  resolution_hours:        number;
  notify_on_breach:        boolean;
  notify_email:            string;
}

function SlaEditor({ value, onChange }: { value: SlaConfig; onChange: (v: SlaConfig) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-white/50">First response (minutes)</label>
          <input type="number" min={1} value={value.first_response_minutes}
            onChange={e => onChange({ ...value, first_response_minutes: parseInt(e.target.value) || 60 })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/50">Resolution target (hours)</label>
          <input type="number" min={1} value={value.resolution_hours}
            onChange={e => onChange({ ...value, resolution_hours: parseInt(e.target.value) || 24 })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange({ ...value, notify_on_breach: !value.notify_on_breach })}
          className={`w-9 h-5 rounded-full transition flex-shrink-0 relative ${value.notify_on_breach ? "bg-orange-500" : "bg-white/20"}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value.notify_on_breach ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
        <span className="text-xs text-white/50">Notify on SLA breach</span>
      </div>
      {value.notify_on_breach && (
        <Field label="Notification email" value={value.notify_email} onChange={e => onChange({ ...value, notify_email: e })} placeholder="admin@example.com" />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  enabled:  [false, true, true, true, true, true, false],
  start:    ["09:00","09:00","09:00","09:00","09:00","09:00","09:00"],
  end:      ["17:00","17:00","17:00","17:00","17:00","17:00","17:00"],
  timezone: "Africa/Lagos",
};

const DEFAULT_SLA: SlaConfig = {
  first_response_minutes: 60,
  resolution_hours:       24,
  notify_on_breach:       false,
  notify_email:           "",
};

export default function CrmSettingsPage() {
  const [configs,        setConfigs]        = useState<ChannelConfig[]>([]);
  const [businessHours,  setBusinessHours]  = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS);
  const [cannedResponses,setCannedResponses]= useState<CannedResponse[]>([]);
  const [customFields,   setCustomFields]   = useState<CustomFieldDef[]>([]);
  const [sla,            setSla]            = useState<SlaConfig>(DEFAULT_SLA);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [toast,          setToast]          = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    (async () => {
      try {
        const [cfgRes, settingsRes] = await Promise.all([
          fetch("/api/admin/crm-settings"),
          fetch("/api/admin/settings"),
        ]);
        if (cfgRes.ok) {
          const { configs: cfgs } = await cfgRes.json() as { configs: ChannelConfig[] };
          setConfigs(cfgs ?? []);
        }
        if (settingsRes.ok) {
          // /api/admin/settings returns { settings: Record<string, unknown> }
          const { settings } = await settingsRes.json() as { settings: Record<string, string | undefined> };
          const get = (k: string) => settings[k];

          const bh = get("crm_business_hours");
          if (bh) setBusinessHours(JSON.parse(bh));

          const cr = get("crm_canned_responses");
          if (cr) setCannedResponses(JSON.parse(cr));

          const cf = get("crm_custom_fields");
          if (cf) setCustomFields(JSON.parse(cf));

          const slaRaw = get("crm_sla_config");
          if (slaRaw) setSla(JSON.parse(slaRaw));
        }
      } catch (e) {
        console.error("[crm-settings] load error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const getConfig = (ch: "instagram" | "facebook" | "sms") =>
    configs.find(c => c.channel === ch) ?? null;

  const handleSaveChannel = async (
    channel: "instagram" | "facebook" | "sms",
    credentials: Record<string, string>,
    config: Record<string, string>,
  ) => {
    const res = await fetch("/api/admin/crm-settings", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ channel, credentials, config, status: "connected" }),
    });
    if (res.ok) {
      const { config: updated } = await res.json() as { config: ChannelConfig };
      setConfigs(prev => {
        const existing = prev.findIndex(c => c.channel === channel);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = updated;
          return next;
        }
        return [...prev, updated];
      });
      showToast(`${channel} connected`);
    } else {
      showToast("Failed to save");
    }
  };

  const handleDisconnect = async (channel: "instagram" | "facebook" | "sms") => {
    await fetch(`/api/admin/crm-settings?channel=${channel}`, { method: "DELETE" });
    setConfigs(prev => prev.map(c => c.channel === channel ? { ...c, status: "disconnected" } : c));
    showToast(`${channel} disconnected`);
  };

  const saveGeneralSettings = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/admin/settings", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crm_business_hours:   JSON.stringify(businessHours),
          crm_canned_responses: JSON.stringify(cannedResponses),
          crm_custom_fields:    JSON.stringify(customFields),
          crm_sla_config:       JSON.stringify(sla),
        }),
      });
      showToast("Settings saved");
    } catch {
      showToast("Failed to save");
    } finally {
      setSaving(false);
    }
  }, [businessHours, cannedResponses, customFields, sla]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-zinc-900/50 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/crm" className="text-white/30 hover:text-white/60 transition">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
              </svg>
            </Link>
            <h1 className="text-base font-semibold">CRM Settings</h1>
          </div>
          <button
            onClick={saveGeneralSettings}
            disabled={saving}
            className="bg-orange-600 hover:bg-orange-700 text-white text-sm px-4 py-2 rounded-lg transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Channel connections */}
        <div>
          <h2 className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">Channel Connections</h2>
          <div className="space-y-3">
            <ChannelCard
              channel="instagram" label="Instagram DMs" icon={<InstagramIcon />}
              config={getConfig("instagram")}
              onSave={(cr, cfg) => handleSaveChannel("instagram", cr, cfg)}
              onDisconnect={() => handleDisconnect("instagram")}
            />
            <ChannelCard
              channel="facebook" label="Facebook Messenger" icon={<FacebookIcon />}
              config={getConfig("facebook")}
              onSave={(cr, cfg) => handleSaveChannel("facebook", cr, cfg)}
              onDisconnect={() => handleDisconnect("facebook")}
            />
            <ChannelCard
              channel="sms" label="SMS" icon={<SmsIcon />}
              config={getConfig("sms")}
              onSave={(cr, cfg) => handleSaveChannel("sms", cr, cfg)}
              onDisconnect={() => handleDisconnect("sms")}
            />
          </div>
        </div>

        {/* SLA */}
        <Section title="SLA Targets">
          <SlaEditor value={sla} onChange={setSla} />
        </Section>

        {/* Business hours */}
        <Section title="Business Hours">
          <BusinessHoursEditor value={businessHours} onChange={setBusinessHours} />
        </Section>

        {/* Canned responses */}
        <Section title="Canned Responses">
          <p className="text-xs text-white/40 -mt-2">Type <code className="text-orange-400/70">/shortcut</code> in the reply box to insert quickly.</p>
          <CannedResponsesEditor responses={cannedResponses} onChange={setCannedResponses} />
        </Section>

        {/* Custom fields */}
        <Section title="Contact Custom Fields">
          <p className="text-xs text-white/40 -mt-2">These fields appear in the contact profile sidebar.</p>
          <CustomFieldsEditor fields={customFields} onChange={setCustomFields} />
        </Section>

        {/* Webhook info */}
        <div className="bg-white/3 border border-white/8 rounded-xl p-5 space-y-2">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Environment Variables Required</p>
          <div className="font-mono text-[11px] space-y-1 text-white/50">
            <p><span className="text-orange-400/60">META_WEBHOOK_VERIFY_TOKEN</span>=leadash_webhook_token</p>
            <p><span className="text-orange-400/60">INSTAGRAM_ACCESS_TOKEN</span>=... (long-lived page token)</p>
            <p><span className="text-orange-400/60">FACEBOOK_PAGE_ACCESS_TOKEN</span>=... (long-lived page token)</p>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-white/10 text-white text-sm px-4 py-2 rounded-lg shadow-xl z-50 pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
