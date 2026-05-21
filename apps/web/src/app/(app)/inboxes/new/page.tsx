"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSmtpInbox } from "@/lib/outreach/api";
import { Suspense } from "react";

type Provider = "smtp" | "microsoft-smtp";

// ── Microsoft SMTP guide ───────────────────────────────────────────────────────

const MS_DIRECT_STEPS = [
  <>Log in to the <a href="https://admin.microsoft.com" target="_blank" rel="noopener noreferrer" className="text-[#0078d4] hover:underline">Microsoft Admin Center</a>.</>,
  <>Go to <strong className="text-white/80">Users → Active Users</strong> and click the user you want to enable.</>,
  <>In the side panel open the <strong className="text-white/80">Mail</strong> tab, then click <strong className="text-white/80">Manage email apps</strong>.</>,
  <>Check <strong className="text-white/80">Authenticated SMTP</strong> and make sure <strong className="text-white/80">IMAP</strong> is also checked.</>,
  <>Click <strong className="text-white/80">Save Changes</strong>.</>,
  <>Wait up to <strong className="text-white/80">one hour</strong> before connecting.</>,
];

const MS_GODADDY_STEPS = [
  <>Log in to your <a href="https://godaddy.com" target="_blank" rel="noopener noreferrer" className="text-[#0078d4] hover:underline">GoDaddy account</a>.</>,
  <>Go to the <strong className="text-white/80">My Products</strong> page.</>,
  <>Scroll down to <strong className="text-white/80">Email and Office</strong> → click <strong className="text-white/80">Manage All</strong>.</>,
  <>Find your user → click <strong className="text-white/80">Manage</strong>.</>,
  <>Scroll down and click <strong className="text-white/80">Advanced Settings</strong>.</>,
  <>Click <strong className="text-white/80">SMTP Authentication</strong> — the toggle turns green.</>,
  <>Wait up to <strong className="text-white/80">one hour</strong> before connecting.</>,
];

function MicrosoftSmtpGuide({ onReady }: { onReady: () => void }) {
  const [adminOpen, setAdminOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0078d4]/15 flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 21 21" className="w-5 h-5" fill="none">
            <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
            <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
        </div>
        <div>
          <h2 className="text-white font-semibold text-base">Connect Your Microsoft Account</h2>
          <p className="text-white/40 text-xs">Office 365 / Outlook</p>
        </div>
      </div>

      <p className="text-white/50 text-sm">
        First, let&apos;s <span className="text-[#0078d4] font-medium">enable SMTP access</span> for your Microsoft account.
      </p>

      {/* Two panels */}
      <div className="grid grid-cols-2 gap-4">
        {/* Direct Microsoft */}
        <div className="bg-white/4 border border-white/10 rounded-xl p-5 space-y-4">
          <p className="text-white font-semibold text-sm leading-snug">
            Microsoft accounts purchased directly from Microsoft
          </p>
          <ol className="space-y-2.5">
            {MS_DIRECT_STEPS.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-xs text-white/55 leading-relaxed">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[#0078d4]/20 text-[#0078d4] text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* GoDaddy */}
        <div className="bg-white/4 border border-white/10 rounded-xl p-5 space-y-4">
          <p className="text-white font-semibold text-sm leading-snug">
            Microsoft accounts purchased from GoDaddy
          </p>
          <ol className="space-y-2.5">
            {MS_GODADDY_STEPS.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-xs text-white/55 leading-relaxed">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[#0078d4]/20 text-[#0078d4] text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Admin approval accordion */}
      <div className="border border-amber-500/20 rounded-xl overflow-hidden">
        <button
          onClick={() => setAdminOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-amber-500/8 hover:bg-amber-500/12 transition-colors text-left"
        >
          <div className="flex items-center gap-2.5">
            <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-amber-300 text-sm font-medium">Using a work or school account? You may need admin approval.</p>
          </div>
          <svg className={`w-4 h-4 text-amber-400/60 flex-shrink-0 transition-transform ${adminOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {adminOpen && (
          <div className="px-4 py-4 space-y-3 bg-amber-500/4 border-t border-amber-500/15">
            <p className="text-white/55 text-xs leading-relaxed">
              If you see a <strong className="text-white/80">&ldquo;Need admin approval&rdquo;</strong> screen after signing in, it means your organisation requires an IT admin to grant consent before third-party apps can access Microsoft accounts.
            </p>
            <p className="text-white/50 text-xs font-semibold uppercase tracking-wide mt-2">Option 1 — Admin grants consent in Azure Portal</p>
            <ol className="space-y-1.5">
              {[
                <>Sign in to <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer" className="text-[#0078d4] hover:underline">portal.azure.com</a> with your admin account.</>,
                <>Go to <strong className="text-white/70">Azure Active Directory → Enterprise applications</strong>.</>,
                <>Search for <strong className="text-white/70">&ldquo;Leadash&rdquo;</strong> → click it.</>,
                <>Open <strong className="text-white/70">Permissions</strong> → click <strong className="text-white/70">Grant admin consent for [your org]</strong>.</>,
                <>Confirm. All users in your org can now connect without approval.</>
              ].map((step, i) => (
                <li key={i} className="flex gap-2 text-xs text-white/50 leading-relaxed">
                  <span className="flex-shrink-0 text-amber-500/60 font-bold">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="text-white/50 text-xs font-semibold uppercase tracking-wide mt-3">Option 2 — Direct admin consent link</p>
            <p className="text-white/45 text-xs leading-relaxed">
              Send this link to your IT admin. They open it, sign in, and approve — no Azure portal navigation needed.
            </p>
            <div className="bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-[11px] font-mono text-white/50 break-all select-all">
              https://login.microsoftonline.com/common/adminconsent?client_id=bedbe25b-516b-4e89-98d2-4976f3ba5017&redirect_uri=https://leadash.com/api/outreach/inboxes/oauth/microsoft/callback
            </div>
            <p className="text-white/35 text-[11px]">After approval, return here and click the button below.</p>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="flex items-center gap-4">
        <button
          onClick={onReady}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#0078d4] hover:bg-[#106ebe] text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Yes, SMTP has been enabled
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </button>
        <a
          href="/api/outreach/inboxes/oauth/microsoft"
          className="text-[#0078d4] hover:text-[#106ebe] text-sm font-medium transition-colors"
        >
          Use OAuth instead →
        </a>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

function NewInboxPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("message") ?? null;

  const [provider, setProvider] = useState<Provider | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(urlError);

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

  function prefillMicrosoft() {
    setForm(f => ({
      ...f,
      smtp_host: "smtp-mail.outlook.com",
      smtp_port: "587",
      imap_host: "outlook.office365.com",
      imap_port: "993",
    }));
    setProvider("smtp");
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
      <p className="text-white/40 text-sm mb-8">Connect a domain or custom SMTP account to send campaigns.</p>

      {/* ── Provider selection ── */}
      {!provider && (
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => router.push("/inboxes/new/connect-domain")}
            className="flex flex-col items-center gap-3 py-8 px-6 bg-white/4 hover:bg-white/8 border border-orange-500/20 hover:border-orange-500/40 rounded-xl transition-all relative overflow-hidden col-span-2"
          >
            <div className="absolute top-3 right-3 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 tracking-wide">BRING YOUR OWN</div>
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-full bg-orange-500/15 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="#60a5fa" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-white font-medium text-sm">Connect existing domain</p>
                <p className="text-white/40 text-xs mt-0.5">Already own a domain? We&apos;ll generate the DNS records — add them at your registrar and you&apos;re live.</p>
              </div>
            </div>
          </button>

          {/* Microsoft SMTP */}
          <button
            onClick={() => setProvider("microsoft-smtp")}
            className="flex flex-col items-center gap-3 py-8 px-6 bg-white/4 hover:bg-white/8 border border-[#0078d4]/30 hover:border-[#0078d4]/60 rounded-xl transition-all"
          >
            <div className="w-11 h-11 rounded-full bg-[#0078d4]/15 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 21 21" className="w-5 h-5" fill="none">
                <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
                <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
                <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-white font-medium text-sm">Microsoft / Outlook</p>
              <p className="text-white/40 text-xs mt-0.5">Office 365, Outlook.com</p>
            </div>
          </button>

          {/* Generic SMTP */}
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
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253" stroke="#34d399"/></svg>
              </div>
              <div className="text-left">
                <p className="text-white font-medium text-sm">Buy a domain (Leadash Mail)</p>
                <p className="text-white/40 text-xs mt-0.5">Self-hosted infrastructure — DKIM, DMARC, SPF — ready in minutes</p>
              </div>
            </div>
          </button>

          {/* Microsoft 365 domain purchase */}
          <button
            onClick={() => router.push("/inboxes/new/domain?provider=microsoft365")}
            className="flex flex-col items-center gap-3 py-8 px-6 bg-white/4 hover:bg-white/8 border border-[#0078d4]/20 hover:border-[#0078d4]/50 rounded-xl transition-all relative overflow-hidden"
          >
            <div className="absolute top-3 right-3 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#0078d4]/15 text-[#0078d4] tracking-wide">M365</div>
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-full bg-[#0078d4]/15 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 21 21" className="w-5 h-5" fill="none">
                  <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
                  <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
                  <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                </svg>
              </div>
              <div className="text-left">
                <p className="text-white font-medium text-sm">Buy a domain (Microsoft 365)</p>
                <p className="text-white/40 text-xs mt-0.5">Microsoft-hosted inboxes — 14-day warmup — 3–5 day setup</p>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* ── Microsoft SMTP guide ── */}
      {provider === "microsoft-smtp" && (
        <>
          <button onClick={() => setProvider(null)} className="text-white/40 hover:text-white/70 text-sm transition-colors mb-6">← Back</button>
          <MicrosoftSmtpGuide onReady={prefillMicrosoft} />
        </>
      )}

      {/* ── SMTP form ── */}
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
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
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

export default function NewInboxPage() {
  return <Suspense><NewInboxPageInner /></Suspense>;
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
        className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-orange-500/60 transition-colors"
      />
    </div>
  );
}
