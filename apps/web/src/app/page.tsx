import Link from "next/link";
import { PLANS } from "@/lib/billing/plans";

// ─── Shared micro-components ──────────────────────────────────────────────────

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group">
      <div className="w-8 h-8 flex-shrink-0">
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <defs>
            <linearGradient id="lg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1d4ed8" />
              <stop offset="100%" stopColor="#6d28d9" />
            </linearGradient>
          </defs>
          <rect width="40" height="40" rx="10" fill="url(#lg)" />
          <path d="M22 5L10 22H19L18 35L30 18H21L22 5Z" fill="white" />
        </svg>
      </div>
      <span className="text-[17px] font-bold tracking-tight text-white/90 group-hover:text-white transition-colors select-none" style={{ letterSpacing: "-0.02em" }}>
        Leadash
      </span>
    </Link>
  );
}

function GradientText({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ background: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #818cf8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
      {children}
    </span>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50"
      style={{ background: "rgba(2,6,23,0.80)", backdropFilter: "blur(20px) saturate(180%)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Logo />
          <nav className="hidden md:flex items-center gap-7">
            {[
              ["Features", "#features"],
              ["How it works", "#how-it-works"],
              ["Pricing", "#pricing"],
              ["About", "/about"],
            ].map(([label, href]) => (
              <a key={label} href={href} className="text-sm text-white/50 hover:text-white transition-colors">
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-white/50 hover:text-white transition-colors px-3 py-1.5">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-semibold text-white px-5 py-2 rounded-xl transition-all"
            style={{ background: "linear-gradient(135deg, #1d4ed8, #5b21b6)", boxShadow: "0 0 20px rgba(99,102,241,0.4)" }}
          >
            Start for free
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center text-center px-6 pt-28 pb-16 overflow-hidden">
      {/* Background glow orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] rounded-full" style={{ background: "radial-gradient(ellipse, rgba(99,102,241,0.12) 0%, transparent 70%)" }} />
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] rounded-full" style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.08) 0%, transparent 70%)" }} />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full" style={{ background: "radial-gradient(ellipse, rgba(139,92,246,0.08) 0%, transparent 70%)" }} />
        {/* Subtle grid */}
        <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)", backgroundSize: "80px 80px" }} />
      </div>

      <div className="relative max-w-5xl mx-auto">
        {/* Eyebrow badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm mb-8 border" style={{ background: "rgba(99,102,241,0.1)", borderColor: "rgba(99,102,241,0.3)", color: "#a5b4fc" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          AI-powered outreach infrastructure
          <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: "rgba(99,102,241,0.3)", color: "#c7d2fe" }}>NEW</span>
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-8" style={{ letterSpacing: "-0.03em" }}>
          Cold outreach that<br />
          <GradientText>books meetings,</GradientText><br />
          not spam folders.
        </h1>

        {/* Subheadline */}
        <p className="text-lg sm:text-xl text-white/45 max-w-2xl mx-auto mb-10 leading-relaxed">
          Leadash scrapes verified leads, writes personalized emails with AI, warms your inboxes automatically, and classifies every reply — so your team only talks to people who are ready to buy.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link
            href="/signup"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl text-base font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #1d4ed8, #5b21b6)", boxShadow: "0 0 40px rgba(99,102,241,0.5), 0 8px 32px rgba(0,0,0,0.4)" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Start for free — no card needed
          </Link>
          <Link
            href="#how-it-works"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl text-base font-medium text-white/70 hover:text-white border border-white/10 hover:border-white/25 transition-all"
          >
            See how it works
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </Link>
        </div>

        {/* Social proof numbers */}
        <div className="flex flex-wrap items-center justify-center gap-8 text-sm">
          {[
            { value: "50M+", label: "leads scraped" },
            { value: "98.2%", label: "inbox placement" },
            { value: "12×", label: "avg reply rate lift" },
            { value: "< 5 min", label: "to first send" },
          ].map(stat => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl font-bold text-white" style={{ letterSpacing: "-0.02em" }}>{stat.value}</p>
              <p className="text-white/35 text-xs mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Floating dashboard preview */}
      <div className="relative mt-20 w-full max-w-6xl mx-auto">
        <div className="relative rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 50px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.1)" }}>
          {/* Fake browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8" style={{ background: "rgba(255,255,255,0.03)" }}>
            <span className="w-3 h-3 rounded-full bg-red-500/60" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <span className="w-3 h-3 rounded-full bg-green-500/60" />
            <div className="ml-4 flex-1 max-w-xs mx-auto h-5 rounded-lg bg-white/5 flex items-center justify-center">
              <span className="text-white/20 text-xs">app.leadash.com/dashboard</span>
            </div>
          </div>

          {/* Mock dashboard UI */}
          <div className="bg-[#060d1a] p-6 min-h-[420px]">
            {/* Top stats */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[
                { label: "Emails Sent", value: "24,891", change: "+18%", color: "text-blue-400" },
                { label: "Open Rate",   value: "41.3%",  change: "+6%",  color: "text-emerald-400" },
                { label: "Reply Rate",  value: "8.7%",   change: "+31%", color: "text-purple-400" },
                { label: "Meetings",    value: "142",    change: "+22%", color: "text-amber-400" },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-white/35 text-xs mb-1">{s.label}</p>
                  <p className={`text-xl font-bold text-white`} style={{ letterSpacing: "-0.02em" }}>{s.value}</p>
                  <p className={`text-xs mt-1 ${s.color}`}>{s.change} this week</p>
                </div>
              ))}
            </div>

            {/* Two column layout */}
            <div className="grid grid-cols-3 gap-4">
              {/* Campaign list */}
              <div className="col-span-2 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
                <div className="px-4 py-3 border-b border-white/6 flex items-center justify-between">
                  <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">Active Sequences</span>
                  <span className="text-white/25 text-xs">4 running</span>
                </div>
                {[
                  { name: "SaaS CEOs — Q2 2025",    sent: "4,218", rate: "9.1%",  status: "running",   color: "bg-emerald-400" },
                  { name: "E-comm Founders West",    sent: "2,891", rate: "6.8%",  status: "running",   color: "bg-emerald-400" },
                  { name: "Series A CFOs — US",      sent: "1,044", rate: "11.2%", status: "running",   color: "bg-emerald-400" },
                  { name: "DevOps VPs — Enterprise", sent: "876",   rate: "7.4%",  status: "paused",    color: "bg-amber-400" },
                ].map(row => (
                  <div key={row.name} className="flex items-center gap-4 px-4 py-3 border-b border-white/4 last:border-0 hover:bg-white/2 transition-colors">
                    <span className={`w-1.5 h-1.5 rounded-full ${row.color} flex-shrink-0`} />
                    <span className="text-white/80 text-sm flex-1 truncate">{row.name}</span>
                    <span className="text-white/35 text-xs">{row.sent} sent</span>
                    <span className="text-emerald-400 text-xs font-medium tabular-nums">{row.rate}</span>
                  </div>
                ))}
              </div>

              {/* AI reply feed */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
                <div className="px-4 py-3 border-b border-white/6">
                  <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">AI Reply Feed</span>
                </div>
                {[
                  { label: "Interested",   count: 23, cls: "bg-emerald-500/15 text-emerald-400" },
                  { label: "Out of office",count: 8,  cls: "bg-blue-500/15 text-blue-400" },
                  { label: "Not now",      count: 14, cls: "bg-amber-500/15 text-amber-400" },
                  { label: "Unsubscribe",  count: 3,  cls: "bg-white/8 text-white/30" },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between px-4 py-3 border-b border-white/4 last:border-0">
                    <span className={`text-xs px-2 py-1 rounded-lg font-medium ${r.cls}`}>{r.label}</span>
                    <span className="text-white/40 text-sm font-mono">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Glow beneath the dashboard */}
        <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-3/4 h-32 rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(99,102,241,0.25) 0%, transparent 70%)", filter: "blur(20px)" }} />
      </div>
    </section>
  );
}

// ─── Logos ────────────────────────────────────────────────────────────────────

function LogoBar() {
  const logos = ["Apollo.io", "HubSpot", "Salesforce", "Outreach", "Lemlist", "Instantly"];
  return (
    <section className="py-16 px-6 border-t border-white/5">
      <p className="text-center text-white/25 text-xs font-semibold uppercase tracking-[0.2em] mb-10">
        Used alongside the tools you already love
      </p>
      <div className="flex flex-wrap items-center justify-center gap-10 max-w-4xl mx-auto">
        {logos.map(l => (
          <div key={l} className="text-white/20 text-base font-bold tracking-tight select-none hover:text-white/35 transition-colors">{l}</div>
        ))}
      </div>
    </section>
  );
}

// ─── Features grid ────────────────────────────────────────────────────────────

function Features() {
  const features = [
    {
      icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
      title: "AI Lead Scraping",
      desc: "Pull verified contact data from 100M+ records. Filter by title, industry, company size, funding stage, and location. Every lead includes email, LinkedIn, phone, and org intelligence.",
      tag: "Lead Gen",
      color: "from-blue-500/20 to-blue-600/5",
      accent: "text-blue-400",
      border: "border-blue-500/20",
    },
    {
      icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
      title: "Email Verification",
      desc: "Verify every address before sending. Catch-all detection, disposable filtering, MX record validation. Cut your bounce rate to near zero and protect your sending reputation.",
      tag: "Deliverability",
      color: "from-emerald-500/20 to-emerald-600/5",
      accent: "text-emerald-400",
      border: "border-emerald-500/20",
    },
    {
      icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z",
      title: "AI Personalization",
      desc: "Gemini writes a unique icebreaker or full email body for every single lead — referencing their role, company, and industry. At scale. In seconds. Not templates. Real personalization.",
      tag: "AI Writing",
      color: "from-purple-500/20 to-purple-600/5",
      accent: "text-purple-400",
      border: "border-purple-500/20",
    },
    {
      icon: "M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z",
      title: "Inbox Warmup",
      desc: "Real peer-to-peer warmup emails exchanged between inboxes in our pool. Auto spam rescue. Weekly ramp schedules. Build sender reputation that lasts — not cheap tricks that get flagged.",
      tag: "Deliverability",
      color: "from-orange-500/20 to-orange-600/5",
      accent: "text-orange-400",
      border: "border-orange-500/20",
    },
    {
      icon: "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4",
      title: "Multi-inbox Rotation",
      desc: "Connect unlimited Gmail, Outlook, and SMTP inboxes. Campaigns rotate sends across inboxes automatically, respecting send windows and daily limits per inbox.",
      tag: "Sending",
      color: "from-sky-500/20 to-sky-600/5",
      accent: "text-sky-400",
      border: "border-sky-500/20",
    },
    {
      icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
      title: "AI Reply CRM",
      desc: "Every reply is automatically classified — Interested, OOO, Not Now, Unsubscribe. Interested leads surface in your CRM pipeline. Sequences pause automatically on out-of-office replies.",
      tag: "CRM",
      color: "from-pink-500/20 to-pink-600/5",
      accent: "text-pink-400",
      border: "border-pink-500/20",
    },
  ];

  return (
    <section id="features" className="py-28 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-purple-400 border border-purple-500/25 bg-purple-500/8 mb-5">
            Everything in one platform
          </div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4" style={{ letterSpacing: "-0.025em" }}>
            The full stack for<br /><GradientText>cold outreach at scale</GradientText>
          </h2>
          <p className="text-white/40 text-lg max-w-2xl mx-auto">
            Six integrated systems that work together — from finding leads to booking meetings.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(f => (
            <div
              key={f.title}
              className={`relative group rounded-2xl p-6 border ${f.border} overflow-hidden transition-all hover:scale-[1.01]`}
              style={{ background: "rgba(255,255,255,0.02)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${f.color} opacity-60`} />
              <div className="relative">
                <div className="flex items-start justify-between mb-5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <svg className={`w-5 h-5 ${f.accent}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
                    </svg>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${f.accent} border ${f.border}`} style={{ background: "rgba(255,255,255,0.04)" }}>
                    {f.tag}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2.5">{f.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How it works ─────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Define your ideal customer",
      desc: "Set filters for industry, job title, company size, location, and funding stage. Leadash queries 100M+ verified contacts and builds your target list.",
      detail: "Powered by Apollo, ZoomInfo, and Lusha data sources — enriched and deduplicated automatically.",
    },
    {
      num: "02",
      title: "Verify and enrich every lead",
      desc: "Every email is verified before it touches your sequence. Invalid addresses are removed. Catch-all domains are flagged. Your deliverability stays pristine.",
      detail: "Average bounce rate for Leadash campaigns: 0.4%. Industry average: 8–12%.",
    },
    {
      num: "03",
      title: "AI writes the first touch",
      desc: "Choose Standard (icebreaker) or Deep (full email). Gemini AI reads each lead's profile and writes something genuinely personal — not a template with their name swapped in.",
      detail: "Personalized emails see 3–5× higher reply rates vs. generic templates.",
    },
    {
      num: "04",
      title: "Launch across warmed inboxes",
      desc: "Your sequences send through multiple warmed inboxes, respecting daily limits and send windows. Replies trigger automatic CRM classification.",
      detail: "Scale to 10,000+ sends/day without ever landing in spam.",
    },
  ];

  return (
    <section id="how-it-works" className="py-28 px-6" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-blue-400 border border-blue-500/25 bg-blue-500/8 mb-5">
            Simple by design
          </div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4" style={{ letterSpacing: "-0.025em" }}>
            From zero to pipeline<br />in <GradientText>under 10 minutes</GradientText>
          </h2>
          <p className="text-white/40 text-lg max-w-xl mx-auto">
            Four steps from idea to booked meetings. No ops overhead, no agency needed.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {/* Connector line */}
          <div className="hidden lg:block absolute top-10 left-[12.5%] right-[12.5%] h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.4) 20%, rgba(99,102,241,0.4) 80%, transparent)" }} />

          {steps.map((s, i) => (
            <div key={s.num} className="relative">
              <div
                className="rounded-2xl p-6 h-full transition-all hover:scale-[1.01]"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm mb-5 relative z-10"
                  style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.2))", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="text-base font-bold text-white mb-3">{s.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed mb-4">{s.desc}</p>
                <p className="text-white/20 text-xs leading-relaxed border-t border-white/6 pt-4">{s.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Social proof / testimonials ──────────────────────────────────────────────

function Testimonials() {
  const testimonials = [
    {
      quote: "We replaced three separate tools — a scraper, an email verifier, and a sending platform — with Leadash. Our reply rate went from 2% to 11% in the first month. The AI personalization is the real deal.",
      name: "Marcus Chen",
      role: "Head of Growth",
      company: "Vertix Labs",
      avatar: "MC",
      gradient: "from-blue-500 to-indigo-600",
    },
    {
      quote: "I run a cold email agency. Leadash lets me run 20 client campaigns simultaneously without a team. The warmup system alone has been worth every cent — no more inbox placement issues.",
      name: "Priya Nair",
      role: "Founder",
      company: "Outbound Studio",
      avatar: "PN",
      gradient: "from-purple-500 to-pink-600",
    },
    {
      quote: "The CRM reply classification is wild. We went from manually sorting 200 replies a day to just reviewing the 'Interested' bucket every morning. Saves us 3 hours a day.",
      name: "Tyler Walsh",
      role: "VP Sales",
      company: "Meridian Software",
      avatar: "TW",
      gradient: "from-emerald-500 to-teal-600",
    },
  ];

  return (
    <section className="py-28 px-6" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-emerald-400 border border-emerald-500/25 bg-emerald-500/8 mb-5">
            Real results
          </div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white" style={{ letterSpacing: "-0.025em" }}>
            Teams that ship more pipeline
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map(t => (
            <div
              key={t.name}
              className="rounded-2xl p-7 flex flex-col gap-6"
              style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}
            >
              {/* Stars */}
              <div className="flex gap-1">
                {[1,2,3,4,5].map(s => (
                  <svg key={s} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              <p className="text-white/65 text-sm leading-relaxed flex-1">&ldquo;{t.quote}&rdquo;</p>

              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>
                  {t.avatar}
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{t.name}</p>
                  <p className="text-white/35 text-xs">{t.role} · {t.company}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Comparison ───────────────────────────────────────────────────────────────

function Comparison() {
  const rows = [
    { feature: "Lead scraping (100M+ contacts)",    leadash: true,  others: false },
    { feature: "Built-in email verification",       leadash: true,  others: false },
    { feature: "AI-written personalizations",       leadash: true,  others: false },
    { feature: "Inbox warmup (peer-to-peer)",        leadash: true,  others: "paid add-on" },
    { feature: "Multi-inbox rotation",              leadash: true,  others: true },
    { feature: "AI reply classification",           leadash: true,  others: false },
    { feature: "CRM pipeline (Interested / OOO)",  leadash: true,  others: false },
    { feature: "Unlimited sequences",               leadash: true,  others: "plan-gated" },
    { feature: "A/B subject line testing",          leadash: true,  others: true },
    { feature: "Team workspaces + permissions",     leadash: true,  others: true },
  ];

  function Cell({ val }: { val: boolean | string }) {
    if (val === true)  return <span className="text-emerald-400 flex justify-center"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg></span>;
    if (val === false) return <span className="text-white/15 flex justify-center"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></span>;
    return <span className="text-amber-400/70 text-xs flex justify-center">{val}</span>;
  }

  return (
    <section className="py-28 px-6" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-amber-400 border border-amber-500/25 bg-amber-500/8 mb-5">
            Why Leadash
          </div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4" style={{ letterSpacing: "-0.025em" }}>
            One platform.<br /><GradientText>Not five subscriptions.</GradientText>
          </h2>
          <p className="text-white/40 text-lg">The average outbound stack costs $800–$2,400/month across tools. Leadash replaces all of them.</p>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="grid grid-cols-3 px-6 py-4 border-b border-white/8" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div className="text-white/30 text-xs font-semibold uppercase tracking-wider">Feature</div>
            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
                <svg className="w-4 h-4 text-blue-400" viewBox="0 0 40 40" fill="none"><defs><linearGradient id="cmp" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#1d4ed8"/><stop offset="100%" stopColor="#6d28d9"/></linearGradient></defs><rect width="40" height="40" rx="10" fill="url(#cmp)"/><path d="M22 5L10 22H19L18 35L30 18H21L22 5Z" fill="white"/></svg>
                Leadash
              </span>
            </div>
            <div className="text-center text-white/30 text-sm font-semibold">Others</div>
          </div>

          {rows.map((row, i) => (
            <div
              key={row.feature}
              className={`grid grid-cols-3 px-6 py-3.5 ${i !== rows.length - 1 ? "border-b border-white/5" : ""} hover:bg-white/2 transition-colors`}
            >
              <span className="text-white/55 text-sm">{row.feature}</span>
              <Cell val={row.leadash} />
              <Cell val={row.others} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

function Pricing() {
  const plans = [
    {
      id: "starter",
      name: PLANS.starter.name,
      price: `₦${PLANS.starter.priceNgn.toLocaleString()}`,
      period: "/month",
      desc: "For solo founders and small teams getting started with outreach.",
      features: [`${PLANS.starter.includedCredits.toLocaleString()} credits/month`, `${PLANS.starter.maxLeadsPool.toLocaleString()} leads pool`, "Unlimited inboxes", "Email verification", "AI personalization", "Email support"],
      cta: "Start free trial",
      highlight: false,
    },
    {
      id: "growth",
      name: PLANS.growth.name,
      price: `₦${PLANS.growth.priceNgn.toLocaleString()}`,
      period: "/month",
      desc: "For sales teams ready to scale their outbound pipeline.",
      features: [`${PLANS.growth.includedCredits.toLocaleString()} credits/month`, `${PLANS.growth.maxLeadsPool.toLocaleString()} leads pool`, "Unlimited inboxes", "Inbox warmup", "Advanced AI personalization", "A/B testing", "CRM pipeline", "Priority support"],
      cta: "Start free trial",
      highlight: true,
      badge: "Most popular",
    },
    {
      id: "scale",
      name: PLANS.scale.name,
      price: `₦${PLANS.scale.priceNgn.toLocaleString()}`,
      period: "/month",
      desc: "For agencies and enterprise teams running multiple client campaigns.",
      features: [`${PLANS.scale.includedCredits.toLocaleString()} credits/month`, `${PLANS.scale.maxLeadsPool.toLocaleString()} leads pool`, "Unlimited inboxes", "Everything in Growth", "Multiple workspaces", "API access", "Dedicated Slack support", "Custom onboarding"],
      cta: "Talk to sales",
      highlight: false,
    },
  ];

  return (
    <section id="pricing" className="py-28 px-6" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-indigo-400 border border-indigo-500/25 bg-indigo-500/8 mb-5">
            Transparent pricing
          </div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4" style={{ letterSpacing: "-0.025em" }}>
            Start free. Scale when<br />you&apos;re <GradientText>ready to grow.</GradientText>
          </h2>
          <p className="text-white/40 text-lg">14-day free trial, no credit card required.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-start">
          {plans.map(plan => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-7 transition-all ${plan.highlight ? "scale-[1.03]" : ""}`}
              style={{
                background: plan.highlight ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.025)",
                border: plan.highlight ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.07)",
                boxShadow: plan.highlight ? "0 0 60px rgba(99,102,241,0.2), inset 0 1px 0 rgba(255,255,255,0.1)" : "inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
            >
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #1d4ed8, #5b21b6)" }}>
                  {plan.badge}
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-white font-bold text-lg mb-1">{plan.name}</h3>
                <p className="text-white/35 text-sm mb-4">{plan.desc}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-white" style={{ letterSpacing: "-0.03em" }}>{plan.price}</span>
                  <span className="text-white/35 text-sm">{plan.period}</span>
                </div>
              </div>

              <div className="space-y-3 mb-8">
                {plan.features.map(f => (
                  <div key={f} className="flex items-start gap-2.5">
                    <svg className={`w-4 h-4 flex-shrink-0 mt-0.5 ${plan.highlight ? "text-indigo-400" : "text-white/30"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-white/60 text-sm">{f}</span>
                  </div>
                ))}
              </div>

              <Link
                href={`/signup?plan=${plan.id}`}
                className="block w-full text-center py-3 rounded-xl text-sm font-bold transition-all"
                style={plan.highlight
                  ? { background: "linear-gradient(135deg, #1d4ed8, #5b21b6)", color: "white", boxShadow: "0 0 30px rgba(99,102,241,0.4)" }
                  : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }
                }
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "How does inbox warmup work?",
    a: "Leadash automatically exchanges low-volume emails between your inboxes and a global warmup pool. Open rates, replies, and sending frequency are ramped up gradually over 3–5 weeks — building domain and IP reputation with Gmail, Outlook, and Yahoo before your first campaign goes out.",
  },
  {
    q: "Can I use my existing Gmail or Outlook inbox?",
    a: "Yes. Connect Gmail via OAuth in one click, or Outlook via OAuth for Microsoft 365. You can also connect any SMTP/IMAP inbox — Zoho, Fastmail, custom domains, anything. All inboxes get the same warmup, tracking, and CRM features.",
  },
  {
    q: "What are credits used for?",
    a: "Credits are consumed for three actions: scraping a new lead (1 cr), verifying an email address (0.5 cr), and generating an AI personalization line (0.5 cr). Sending emails and running campaigns never costs credits — only the data and AI layer does.",
  },
  {
    q: "Do credits roll over?",
    a: "Monthly plan credits reset each billing cycle and do not roll over. Top-up credits you purchase separately never expire and are used first before your monthly allocation.",
  },
  {
    q: "What happens when I run out of credits?",
    a: "Scraping, verification, and AI personalization pause. Emails already in active sequences continue sending normally — your campaigns are never interrupted. Buy more credits and data jobs resume instantly.",
  },
  {
    q: "Is Leadash compliant with CAN-SPAM and GDPR?",
    a: "Yes. Every sequence includes a one-click unsubscribe link. Unsubscribes are honoured globally across all campaigns instantly. Leads are stored in your private workspace — never sold or shared. You control data retention and can export or delete any time.",
  },
  {
    q: "What payment methods are accepted?",
    a: "NGN payments via Paystack — card, bank transfer, and USSD all supported. USD payments via Stripe for international users. You can switch between currencies at checkout.",
  },
  {
    q: "Can I change or cancel my plan?",
    a: "Upgrade or downgrade at any time. Changes take effect at the next billing cycle. Cancel any time — your data stays accessible until the end of the period, then is deleted after 30 days.",
  },
];

function FAQ() {
  return (
    <section className="py-24 px-6" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-indigo-400 border border-indigo-500/25 bg-indigo-500/8 mb-5">
            Got questions?
          </div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4" style={{ letterSpacing: "-0.025em" }}>
            Everything you need<br />to <GradientText>know</GradientText>
          </h2>
          <p className="text-white/40 text-lg">Can't find the answer? <a href="/contact" className="text-indigo-400 hover:text-indigo-300 transition-colors">Reach out to us.</a></p>
        </div>

        {/* Accordion */}
        <div className="space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <details
              key={i}
              className="group rounded-2xl overflow-hidden"
              style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <summary className="flex items-center justify-between px-6 py-5 cursor-pointer hover:bg-white/3 transition-colors list-none select-none">
                <span className="text-white/85 text-sm font-medium pr-6 leading-snug">{item.q}</span>
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}>
                  <svg className="w-3 h-3 text-indigo-400 transition-transform duration-200 group-open:rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </span>
              </summary>
              <div className="px-6 pb-5 pt-1 text-white/45 text-sm leading-relaxed" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CTA banner ───────────────────────────────────────────────────────────────

function CTA() {
  return (
    <section className="py-28 px-6">
      <div className="max-w-4xl mx-auto relative">
        <div
          className="rounded-3xl p-16 text-center overflow-hidden relative"
          style={{ background: "linear-gradient(135deg, rgba(29,78,216,0.3) 0%, rgba(91,33,182,0.3) 100%)", border: "1px solid rgba(99,102,241,0.3)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 40px 80px rgba(0,0,0,0.5)" }}
        >
          {/* Radial glow */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.3) 0%, transparent 60%)" }} />

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-indigo-300 border border-indigo-500/30 bg-indigo-500/10 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              14-day free trial
            </div>

            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-5" style={{ letterSpacing: "-0.03em" }}>
              Your next 100 meetings<br />are already out there.
            </h2>
            <p className="text-white/50 text-lg mb-10 max-w-xl mx-auto">
              Start a free trial today. Connect your inbox, build your first campaign, and see replies in your CRM by tomorrow.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-10 py-4 rounded-2xl text-base font-bold text-white transition-all hover:scale-[1.02]"
                style={{ background: "linear-gradient(135deg, #1d4ed8, #5b21b6)", boxShadow: "0 0 50px rgba(99,102,241,0.6), 0 10px 40px rgba(0,0,0,0.4)" }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Start for free
              </Link>
              <a href="#pricing" className="w-full sm:w-auto px-10 py-4 rounded-2xl text-base font-semibold text-white/60 hover:text-white border border-white/10 hover:border-white/25 transition-all text-center">
                See pricing
              </a>
            </div>

            <p className="text-white/25 text-sm mt-6">No credit card required. Upgrade or cancel anytime.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-white/6 py-16 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-14">
          {/* Brand */}
          <div className="col-span-2">
            <Logo />
            <p className="text-white/30 text-sm mt-4 leading-relaxed max-w-xs">
              AI-powered cold outreach infrastructure for modern sales teams and agencies.
            </p>
            <div className="flex gap-3 mt-5">
              {/* Twitter/X */}
              <a href="#" className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 text-white/30 hover:text-white/70 hover:border-white/25 transition-all">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              {/* LinkedIn */}
              <a href="#" className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/10 text-white/30 hover:text-white/70 hover:border-white/25 transition-all">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Links */}
          {[
            { heading: "Product", links: [
              { label: "Features",     href: "#features"    },
              { label: "How it works", href: "#how-it-works"},
              { label: "Pricing",      href: "#pricing"     },
            ]},
            { heading: "Company", links: [
              { label: "About",   href: "/about"   },
              { label: "Contact", href: "/contact" },
            ]},
            { heading: "Legal", links: [
              { label: "Privacy Policy",   href: "/privacy" },
              { label: "Terms of Service", href: "/terms"   },
              { label: "GDPR",             href: "/privacy#gdpr" },
            ]},
          ].map(col => (
            <div key={col.heading}>
              <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-4">{col.heading}</p>
              <div className="space-y-2.5">
                {col.links.map(l => (
                  <a key={l.label} href={l.href} className="block text-white/30 text-sm hover:text-white/70 transition-colors">{l.label}</a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-white/6 gap-4">
          <p className="text-white/20 text-sm">© {new Date().getFullYear()} Leadash. All rights reserved.</p>
          <div className="flex items-center gap-6">
            {["Privacy Policy", "Terms of Service", "GDPR"].map(l => (
              <a key={l} href="#" className="text-white/20 text-sm hover:text-white/50 transition-colors">{l}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: "#020617" }}>
      <Nav />
      <Hero />
      <LogoBar />
      <Features />
      <HowItWorks />
      <Testimonials />
      <Comparison />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
}
