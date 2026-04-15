import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";

async function getSupportEmail(): Promise<string> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("admin_settings")
      .select("value")
      .eq("key", "support_email")
      .single();
    return (data?.value as string) ?? "support@leadash.io";
  } catch {
    return "support@leadash.io";
  }
}

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

function buildChannels(supportEmail: string) {
  return [
  {
    icon: (
      <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
    label: "Email us",
    value: "hello@leadash.io",
    desc: "For general enquiries and partnerships",
    href: "mailto:hello@leadash.io",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
    ),
    label: "Support",
    value: supportEmail,
    desc: "For help with your account or campaigns",
    href: `mailto:${supportEmail}`,
  },
  {
    icon: (
      <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
    label: "Live chat",
    value: "Available in the app",
    desc: "Fastest response — typically under 2 hours",
    href: "/login",
  },
];}

export default async function ContactPage() {
  const supportEmail = await getSupportEmail();
  const CHANNELS = buildChannels(supportEmail);
  return (
    <div className="min-h-screen" style={{ background: "#020617" }}>
      {/* Nav */}
      <header
        className="fixed top-0 left-0 right-0 z-50"
        style={{ background: "rgba(2,6,23,0.80)", backdropFilter: "blur(20px) saturate(180%)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-white/50 hover:text-white transition-colors px-3 py-1.5">Sign in</Link>
            <Link href="/signup" className="text-sm font-semibold text-white px-5 py-2 rounded-xl transition-all" style={{ background: "linear-gradient(135deg, #1d4ed8, #5b21b6)", boxShadow: "0 0 20px rgba(99,102,241,0.4)" }}>
              Start for free
            </Link>
          </div>
        </div>
      </header>

      <div className="pt-16">
        {/* Hero */}
        <section className="relative py-28 px-6 text-center overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full" style={{ background: "radial-gradient(ellipse, rgba(99,102,241,0.1) 0%, transparent 70%)" }} />
            <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)", backgroundSize: "80px 80px" }} />
          </div>
          <div className="relative max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-indigo-400 border border-indigo-500/25 bg-indigo-500/8 mb-6">
              We're here
            </div>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-white mb-5" style={{ letterSpacing: "-0.03em" }}>
              Let's <GradientText>talk</GradientText>
            </h1>
            <p className="text-white/45 text-xl leading-relaxed">
              Whether you have a question about features, pricing, or just want to say hi — we read every message and reply within one business day.
            </p>
          </div>
        </section>

        {/* Contact channels */}
        <section className="py-10 px-6 pb-24">
          <div className="max-w-3xl mx-auto space-y-4">
            {CHANNELS.map(ch => (
              <a
                key={ch.label}
                href={ch.href}
                className="flex items-center gap-5 rounded-2xl p-6 group transition-all hover:scale-[1.01]"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {ch.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-0.5">{ch.label}</p>
                  <p className="text-white font-semibold text-base">{ch.value}</p>
                  <p className="text-white/35 text-sm mt-0.5">{ch.desc}</p>
                </div>
                <svg className="w-5 h-5 text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </a>
            ))}

            {/* Response time note */}
            <div className="rounded-2xl px-6 py-5 flex items-center gap-3" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}>
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
              <p className="text-indigo-300/70 text-sm">Our team is based across multiple time zones — most replies arrive within a few hours.</p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/6 py-10 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <Logo />
            <p className="text-white/20 text-sm">© {new Date().getFullYear()} Leadash. All rights reserved.</p>
            <div className="flex items-center gap-6">
              {[["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"]].map(([l, href]) => (
                <Link key={l} href={href} className="text-white/20 text-sm hover:text-white/50 transition-colors">{l}</Link>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
