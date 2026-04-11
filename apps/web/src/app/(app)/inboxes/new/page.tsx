"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSmtpInbox } from "@/lib/outreach/api";
import { getWorkspaceId } from "@/lib/workspace/client";

type Provider = "gmail" | "outlook" | "smtp";

export default function NewInboxPage() {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    label: "",
    email_address: "",
    first_name: "",
    last_name: "",
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_password: "",
    imap_host: "",
    imap_port: "993",
    daily_send_limit: "30",
    send_window_start: "09:00",
    send_window_end: "17:00",
  });

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSmtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createSmtpInbox({
        ...form,
        provider: "smtp",
        smtp_port: Number(form.smtp_port),
        imap_port: Number(form.imap_port),
        daily_send_limit: Number(form.daily_send_limit),
      });
      router.push("/inboxes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create inbox");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/inboxes" className="text-white/40 hover:text-white/70 text-sm transition-colors">← Inboxes</Link>
        <span className="text-white/20">/</span>
        <span className="text-white/60 text-sm">Add Inbox</span>
      </div>

      <h1 className="text-xl font-bold text-white mb-2">Add a sending inbox</h1>
      <p className="text-white/40 text-sm mb-8">Connect a Gmail, Outlook, or custom SMTP account to send campaigns.</p>

      {!provider && (
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => { const wsId = getWorkspaceId() ?? ""; window.location.href = `/api/outreach/inboxes/oauth/gmail?workspace_id=${wsId}`; }}
            className="flex flex-col items-center gap-3 py-8 px-6 bg-white/4 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-xl transition-all"
          >
            <div className="w-11 h-11 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 48 48" className="w-5 h-5"><path fill="#4285F4" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z"/><path fill="#34A853" d="M6.3 14.7l6.6 4.8C14.5 15.8 18.9 12 24 12c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.7 0-14.4 4.3-17.7 10.7z"/><path fill="#FBBC05" d="M24 44c5.2 0 9.9-1.9 13.4-5.1l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#EA4335" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.2 5.2C36.9 37.2 44 32 44 24c0-1.3-.1-2.7-.4-3.9z"/></svg>
            </div>
            <div className="text-center">
              <p className="text-white font-medium text-sm">Gmail</p>
              <p className="text-white/40 text-xs mt-0.5">Connect with OAuth</p>
            </div>
          </button>

          <button
            onClick={() => { const wsId = getWorkspaceId() ?? ""; window.location.href = `/api/outreach/inboxes/oauth/microsoft?workspace_id=${wsId}`; }}
            className="flex flex-col items-center gap-3 py-8 px-6 bg-white/4 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-xl transition-all"
          >
            <div className="w-11 h-11 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 23 23" className="w-5 h-5"><path fill="#F35325" d="M0 0h11v11H0z"/><path fill="#81BC06" d="M12 0h11v11H12z"/><path fill="#05A6F0" d="M0 12h11v11H0z"/><path fill="#FFBA08" d="M12 12h11v11H12z"/></svg>
            </div>
            <div className="text-center">
              <p className="text-white font-medium text-sm">Outlook</p>
              <p className="text-white/40 text-xs mt-0.5">Connect with OAuth</p>
            </div>
          </button>

          <button
            onClick={() => setProvider("smtp")}
            className="flex flex-col items-center gap-3 py-8 px-6 bg-white/4 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-xl transition-all"
          >
            <div className="w-11 h-11 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" stroke="currentColor"/></svg>
            </div>
            <div className="text-center">
              <p className="text-white font-medium text-sm">Custom SMTP</p>
              <p className="text-white/40 text-xs mt-0.5">Any mail provider</p>
            </div>
          </button>

          <button
            onClick={() => router.push("/inboxes/new/domain")}
            className="flex flex-col items-center gap-3 py-8 px-6 bg-white/4 hover:bg-white/8 border border-emerald-500/20 hover:border-emerald-500/40 rounded-xl transition-all relative overflow-hidden"
          >
            <div className="absolute top-3 right-3 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 tracking-wide">NEW</div>
            <div className="w-11 h-11 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253" stroke="#34d399"/></svg>
            </div>
            <div className="text-center">
              <p className="text-white font-medium text-sm">Buy a domain</p>
              <p className="text-white/40 text-xs mt-0.5">Auto-provision + DNS setup</p>
            </div>
          </button>
        </div>
      )}

      {provider === "smtp" && (
        <form onSubmit={handleSmtpSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Display label" value={form.label} onChange={v => set("label", v)} placeholder="My Gmail" required />
            <Field label="Email address" value={form.email_address} onChange={v => set("email_address", v)} placeholder="you@domain.com" type="email" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First name (sender)" value={form.first_name} onChange={v => set("first_name", v)} placeholder="Alex" />
            <Field label="Last name (sender)" value={form.last_name} onChange={v => set("last_name", v)} placeholder="Smith" />
          </div>

          <div className="border-t border-white/8 pt-5">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-4">SMTP (outgoing)</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Field label="SMTP host" value={form.smtp_host} onChange={v => set("smtp_host", v)} placeholder="smtp.gmail.com" required />
              </div>
              <Field label="Port" value={form.smtp_port} onChange={v => set("smtp_port", v)} placeholder="587" />
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <Field label="SMTP username" value={form.smtp_user} onChange={v => set("smtp_user", v)} placeholder="you@domain.com" required />
              <Field label="SMTP password / app password" value={form.smtp_password} onChange={v => set("smtp_password", v)} placeholder="••••••••" type="password" required />
            </div>
          </div>

          <div className="border-t border-white/8 pt-5">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-4">IMAP (incoming — for reply detection)</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Field label="IMAP host" value={form.imap_host} onChange={v => set("imap_host", v)} placeholder="imap.gmail.com" />
              </div>
              <Field label="Port" value={form.imap_port} onChange={v => set("imap_port", v)} placeholder="993" />
            </div>
          </div>

          <div className="border-t border-white/8 pt-5">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-4">Sending limits</p>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Daily send limit" value={form.daily_send_limit} onChange={v => set("daily_send_limit", v)} placeholder="30" />
              <Field label="Send window start" value={form.send_window_start} onChange={v => set("send_window_start", v)} placeholder="09:00" />
              <Field label="Send window end" value={form.send_window_end} onChange={v => set("send_window_end", v)} placeholder="17:00" />
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {saving ? "Adding…" : "Add inbox"}
            </button>
            <button type="button" onClick={() => setProvider(null)} className="text-white/40 hover:text-white/70 text-sm transition-colors">
              Back
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text", required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-white/50 text-xs font-medium mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors"
      />
    </div>
  );
}
