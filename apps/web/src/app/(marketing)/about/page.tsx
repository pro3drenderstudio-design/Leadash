import Link from "next/link";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/Logo_Icon_Colored.svg" className="w-8 h-8 flex-shrink-0" alt="" />
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

const VALUES = [
  {
    icon: (
      <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    title: "Speed without noise",
    body: "Every second a rep spends copy-pasting into a spreadsheet is a second they're not selling. We automate the grunt work so your team focuses on conversations, not configuration.",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    title: "Deliverability first",
    body: "A brilliant email that lands in spam is worthless. We built warmup, domain health monitoring, and bounce management into the core — not as add-ons.",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
    title: "Transparent pricing",
    body: "No per-seat taxes, no hidden limits, no surprise invoices. You pay for the data and AI you use, not for the number of people on your team.",
  },
  {
    icon: (
      <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
      </svg>
    ),
    title: "Respect in every send",
    body: "Outreach that feels like spam is bad for everyone — the recipient, the sender, and the industry. We enforce unsubscribes, flag high bounce rates, and give you the tools to send email people actually want to open.",
  },
];

const STATS = [
  { value: "12M+",   label: "Emails delivered"     },
  { value: "94%",    label: "Average inbox rate"   },
  { value: "3.2×",   label: "Reply rate vs. avg"   },
  { value: "4,000+", label: "Teams onboarded"      },
];

export default function AboutPage() {
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
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] rounded-full" style={{ background: "radial-gradient(ellipse, rgba(99,102,241,0.1) 0%, transparent 70%)" }} />
            <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)", backgroundSize: "80px 80px" }} />
          </div>
          <div className="relative max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-indigo-400 border border-indigo-500/25 bg-indigo-500/8 mb-6">
              Our story
            </div>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-white mb-6" style={{ letterSpacing: "-0.03em" }}>
              Built by sales reps<br />who were <GradientText>done with tabs</GradientText>
            </h1>
            <p className="text-white/45 text-xl leading-relaxed">
              Leadash started as an internal tool. We were running outreach for a B2B agency and spending more time stitching together Apollo, Instantly, Smartlead, and Google Sheets than actually selling. So we built something better — and opened it to everyone.
            </p>
          </div>
        </section>

        {/* Stats bar */}
        <section className="py-10 px-6" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map(s => (
              <div key={s.label} className="text-center">
                <p className="text-4xl font-bold text-white mb-1" style={{ letterSpacing: "-0.03em" }}>
                  <GradientText>{s.value}</GradientText>
                </p>
                <p className="text-white/35 text-sm">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Mission */}
        <section className="py-24 px-6">
          <div className="max-w-3xl mx-auto">
            <div className="rounded-3xl p-10 md:p-14" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-5">Our mission</p>
              <blockquote className="text-2xl md:text-3xl font-semibold text-white leading-snug" style={{ letterSpacing: "-0.02em" }}>
                "Make it possible for any team — solo founder or 50-person agency — to run world-class outbound with the same infrastructure Fortune 500 companies use, at a fraction of the cost."
              </blockquote>
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="py-20 px-6" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={{ letterSpacing: "-0.025em" }}>What we believe</h2>
              <p className="text-white/40 text-lg">The principles that shape every product decision we make.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              {VALUES.map(v => (
                <div key={v.title} className="rounded-2xl p-7" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {v.icon}
                  </div>
                  <h3 className="text-white font-semibold text-base mb-2">{v.title}</h3>
                  <p className="text-white/40 text-sm leading-relaxed">{v.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 px-6" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={{ letterSpacing: "-0.025em" }}>
              Ready to replace your stack?
            </h2>
            <p className="text-white/40 text-lg mb-8">Start your 14-day free trial — no credit card required.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/signup" className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #1d4ed8, #5b21b6)", boxShadow: "0 0 30px rgba(99,102,241,0.4)" }}>
                Start for free
              </Link>
              <Link href="/contact" className="px-8 py-3.5 rounded-xl text-sm font-semibold text-white/60 hover:text-white border border-white/10 hover:border-white/25 transition-all">
                Talk to us
              </Link>
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
