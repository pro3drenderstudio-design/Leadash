"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSmtpInbox } from "@/lib/outreach/api";

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
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => window.location.href = "/api/outreach/inboxes/oauth/gmail"}
            className="flex flex-col items-center gap-3 p-6 bg-white/4 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-xl transition-all text-left"
          >
            <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center text-xl">G</div>
            <div>
              <p className="text-white font-medium text-sm">Gmail</p>
              <p className="text-white/40 text-xs mt-0.5">Connect with OAuth</p>
            </div>
          </button>

          <button
            onClick={() => window.location.href = "/api/outreach/inboxes/oauth/microsoft"}
            className="flex flex-col items-center gap-3 p-6 bg-white/4 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-xl transition-all text-left"
          >
            <div className="w-10 h-10 rounded-full bg-blue-500/15 flex items-center justify-center text-xl">M</div>
            <div>
              <p className="text-white font-medium text-sm">Outlook</p>
              <p className="text-white/40 text-xs mt-0.5">Connect with OAuth</p>
            </div>
          </button>

          <button
            onClick={() => setProvider("smtp")}
            className="flex flex-col items-center gap-3 p-6 bg-white/4 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-xl transition-all text-left"
          >
            <div className="w-10 h-10 rounded-full bg-gray-500/15 flex items-center justify-center text-xl">@</div>
            <div>
              <p className="text-white font-medium text-sm">Custom SMTP</p>
              <p className="text-white/40 text-xs mt-0.5">Any mail provider</p>
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
