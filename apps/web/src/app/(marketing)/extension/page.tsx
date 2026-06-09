import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chrome Extension — Leadash",
  description: "Import LinkedIn leads and generate AI comments without leaving your browser. The Leadash Chrome Extension for B2B sales teams.",
};

const FEATURES = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
    title: "One-click lead import",
    body: "Browse LinkedIn search results and import selected prospects directly into your Leadash lists — no copy-pasting, no CSV exports.",
    accent: "orange",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    title: "AI comment generator",
    body: "Write thoughtful LinkedIn comments in seconds. Choose from 5 tones — professional, casual, insightful, curious, or supportive — and copy with one click.",
    accent: "violet",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    title: "Instant campaign sync",
    body: "Imported leads land in a daily LinkedIn list automatically. Add them to any campaign in one tap — no switching tabs or re-uploading files.",
    accent: "blue",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
    title: "Secure API key auth",
    body: "Connects to your Leadash workspace using an API key — not your password. Revoke access anytime from your account settings.",
    accent: "green",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Download the extension",
    body: "Click the button below to download the Leadash extension zip file to your computer.",
  },
  {
    n: "2",
    title: "Open Chrome Extensions",
    body: (
      <>
        In Chrome, navigate to <code className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ background: "rgba(255,255,255,0.08)", color: "#f97316" }}>chrome://extensions</code> and enable <strong>Developer mode</strong> using the toggle in the top-right corner.
      </>
    ),
  },
  {
    n: "3",
    title: "Unzip and load the folder",
    body: <>Unzip the downloaded file, then click <strong>Load unpacked</strong> and select the extracted folder. The Leadash icon will appear in your toolbar.</>
  },
  {
    n: "4",
    title: "Connect your account",
    body: <>Click the extension icon, go to <strong>Settings</strong>, and paste your Leadash API key. Generate one from <strong>Settings → API Keys</strong> inside the Leadash app.</>
  },
  {
    n: "5",
    title: "Start importing from LinkedIn",
    body: "Visit any LinkedIn people or company search page. You'll see a floating Leadash button — click it to import the current results directly to your account."
  },
];

const FAQS = [
  {
    q: "Does this extension require a Leadash subscription?",
    a: "Yes — you need an active Leadash workspace to connect the extension. It uses your API key to sync data to your account.",
  },
  {
    q: "Will LinkedIn detect that I'm using an extension?",
    a: "The extension only reads data already visible on the page — it doesn't automate clicks or scrolling. It behaves like a normal browser user reading the page.",
  },
  {
    q: "Why isn't it on the Chrome Web Store?",
    a: "We're in early access. The extension will be published to the Chrome Web Store once we complete the review process. For now, install it manually using the steps above.",
  },
  {
    q: "What data gets imported?",
    a: "Name, LinkedIn URL, headline, and company — exactly what's visible in search results. Placeholder emails are generated and can be enriched later from within Leadash.",
  },
  {
    q: "Can I revoke access?",
    a: "Yes. Go to Settings → API Keys inside Leadash and delete the key. The extension will immediately lose access to your account.",
  },
];

const accentMap: Record<string, string> = {
  orange: "rgba(249,115,22,0.12)",
  violet: "rgba(167,139,250,0.12)",
  blue:   "rgba(96,165,250,0.12)",
  green:  "rgba(74,222,128,0.12)",
};
const textAccentMap: Record<string, string> = {
  orange: "#f97316",
  violet: "#a78bfa",
  blue:   "#60a5fa",
  green:  "#4ade80",
};

export default function ExtensionPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-28 px-6 text-center">
        {/* Background glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] rounded-full"
            style={{ background: "radial-gradient(ellipse, rgba(249,115,22,0.07) 0%, transparent 65%)" }} />
          <div className="absolute inset-0"
            style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)", backgroundSize: "72px 72px" }} />
        </div>

        <div className="relative max-w-3xl mx-auto">
          {/* Chrome badge */}
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full text-xs font-medium"
            style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)", color: "#f97316" }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728z"/>
            </svg>
            Chrome Extension · Early Access
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-white mb-5" style={{ lineHeight: 1.1 }}>
            LinkedIn prospecting,<br />
            <span style={{ color: "#f97316" }}>inside Leadash</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-xl mx-auto mb-10 leading-relaxed">
            Import leads from LinkedIn search pages and generate AI-powered outreach comments — without switching tabs. Your Leadash workspace, right in your browser.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/leadash-extension.zip"
              download
              className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl font-semibold text-base transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", color: "#fff", boxShadow: "0 8px 32px rgba(249,115,22,0.35)" }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download Extension
            </a>
            <Link
              href="#install"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-medium text-base text-slate-300 transition-colors hover:text-white"
              style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}
            >
              View install guide
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </Link>
          </div>

          <p className="mt-4 text-xs text-slate-600">Free with any Leadash plan · Requires Chrome 90+</p>
        </div>
      </section>

      {/* ── Extension Popup Preview ──────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl overflow-hidden p-8 flex flex-col lg:flex-row items-center gap-10"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>

            {/* Popup mock */}
            <div className="shrink-0">
              <div className="w-80 rounded-xl overflow-hidden shadow-2xl"
                style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.12)", fontFamily: "system-ui, sans-serif" }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-white">Leadash</span>
                  </div>
                  <div className="flex gap-1">
                    {["Import", "Comment", "Settings"].map((tab, i) => (
                      <div key={tab} className="px-2 py-0.5 rounded text-xs font-medium transition-colors"
                        style={{ background: i === 0 ? "rgba(249,115,22,0.15)" : "transparent", color: i === 0 ? "#f97316" : "#64748b" }}>
                        {tab}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  <div className="rounded-lg p-3" style={{ background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.15)" }}>
                    <div className="text-xs font-medium mb-1" style={{ color: "#f97316" }}>12 leads found on this page</div>
                    <div className="text-xs text-slate-500">LinkedIn · People search</div>
                  </div>

                  {[
                    { name: "Sarah Johnson", role: "Head of Sales · Acme Corp" },
                    { name: "Michael Chen",  role: "Founder · TechStart Inc"   },
                    { name: "Priya Patel",   role: "VP Marketing · GrowthCo"   },
                  ].map((p) => (
                    <div key={p.name} className="flex items-center gap-3 p-2 rounded-lg"
                      style={{ background: "rgba(255,255,255,0.03)" }}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
                        style={{ background: "linear-gradient(135deg, #1e40af, #3b82f6)" }}>
                        {p.name[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-white truncate">{p.name}</div>
                        <div className="text-xs text-slate-500 truncate">{p.role}</div>
                      </div>
                      <div className="shrink-0 w-4 h-4 rounded" style={{ background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.3)" }} />
                    </div>
                  ))}

                  <button className="w-full py-2.5 rounded-lg text-xs font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
                    Import 12 leads to Leadash →
                  </button>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white mb-3">Your whole workflow, one click away</h2>
              <p className="text-slate-400 leading-relaxed mb-6">
                No more bouncing between LinkedIn and your CRM. The Leadash extension lives in your browser toolbar and connects directly to your workspace — import, enrich, and enroll leads without ever leaving LinkedIn.
              </p>
              <ul className="space-y-3">
                {[
                  "Detects LinkedIn search pages automatically",
                  "Imports name, company, headline and profile URL",
                  "Creates a daily import list — no manual file handling",
                  "AI comment generator for warm engagement before outreach",
                ].map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#f97316" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature Grid ─────────────────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Everything you need in the sidebar</h2>
            <p className="text-slate-400 max-w-lg mx-auto">Four tools, one popup. No complex setup, no new tabs.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="p-6 rounded-2xl transition-all hover:scale-[1.01]"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: accentMap[f.accent], color: textAccentMap[f.accent] }}>
                  {f.icon}
                </div>
                <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Install Steps ─────────────────────────────────────────────────── */}
      <section id="install" className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Install in under 2 minutes</h2>
            <p className="text-slate-400">No account required to install. You&apos;ll connect your workspace in the last step.</p>
          </div>

          <div className="space-y-4">
            {STEPS.map((step, idx) => (
              <div key={step.n} className="flex gap-5 p-5 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    background: idx === 0 ? "linear-gradient(135deg, #f97316, #ea580c)" : "rgba(255,255,255,0.07)",
                    color: idx === 0 ? "#fff" : "#94a3b8",
                  }}>
                  {step.n}
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">{step.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <a
              href="/leadash-extension.zip"
              download
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl font-semibold text-base transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", color: "#fff", boxShadow: "0 8px 32px rgba(249,115,22,0.3)" }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download leadash-extension.zip
            </a>
            <p className="mt-3 text-xs text-slate-600">~52 KB · Chrome 90+ · Manifest V3</p>
          </div>
        </div>
      </section>

      {/* ── Compatibility ─────────────────────────────────────────────────── */}
      <section className="py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl p-8 flex flex-col sm:flex-row items-center gap-8"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-2">Browser compatibility</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Built on Manifest V3, the latest Chrome extension standard. Works in Chrome, Brave, Edge, Arc, and any other Chromium-based browser.
                Firefox support is planned for a future release.
              </p>
            </div>
            <div className="flex items-center gap-6 shrink-0">
              {[
                { label: "Chrome",  color: "#4285F4", check: true  },
                { label: "Brave",   color: "#FB542B", check: true  },
                { label: "Edge",    color: "#0078D4", check: true  },
                { label: "Firefox", color: "#FF7139", check: false },
              ].map((b) => (
                <div key={b.label} className="flex flex-col items-center gap-1.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold"
                    style={{ background: b.check ? `${b.color}18` : "rgba(255,255,255,0.04)", border: `1px solid ${b.check ? b.color + "30" : "rgba(255,255,255,0.07)"}` }}>
                    {b.check
                      ? <svg className="w-5 h-5" style={{ color: b.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      : <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    }
                  </div>
                  <span className="text-xs" style={{ color: b.check ? "#94a3b8" : "#475569" }}>{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group rounded-xl overflow-hidden"
                style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
                <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer select-none text-sm font-medium text-white list-none">
                  {faq.q}
                  <svg className="w-4 h-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </summary>
                <div className="px-5 pb-4 text-sm text-slate-400 leading-relaxed">{faq.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 mb-5 px-3 py-1.5 rounded-full text-xs"
            style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.15)", color: "#4ade80" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Ready to install
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Stop copying leads manually</h2>
          <p className="text-slate-400 mb-8 leading-relaxed">
            The extension takes 2 minutes to set up and saves hours every week. Download it, connect your workspace, and start importing from LinkedIn today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/leadash-extension.zip"
              download
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl font-semibold text-base transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", color: "#fff", boxShadow: "0 8px 32px rgba(249,115,22,0.3)" }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download Free Extension
            </a>
            <Link
              href="/login"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Don&apos;t have a Leadash account? <span style={{ color: "#f97316" }}>Sign up free →</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
