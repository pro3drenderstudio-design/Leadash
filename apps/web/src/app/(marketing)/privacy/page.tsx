import Link from "next/link";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/Logo_Icon_Colored.svg" className="w-6 h-6 flex-shrink-0" alt="" />
      <span className="text-[17px] font-bold tracking-tight text-white/90 group-hover:text-white transition-colors select-none" style={{ letterSpacing: "-0.02em" }}>
        Leadash
      </span>
    </Link>
  );
}

const SECTIONS = [
  {
    id: "information-we-collect",
    title: "1. Information we collect",
    body: [
      "**Account data** — When you register, we collect your name, email address, and payment information. Payment data is processed by Stripe or Paystack and we do not store full card numbers.",
      "**Usage data** — We collect information about how you use Leadash, including pages visited, features used, and actions taken. This helps us improve the product.",
      "**Lead data** — Contacts you upload, scrape, or import into your workspace are stored in your private workspace. We do not access, sell, or share your lead data with third parties.",
      "**Communication data** — Email subjects, bodies, and metadata for sequences you create are stored and processed on your behalf to deliver the service.",
      "**Device and log data** — We automatically collect IP addresses, browser type, operating system, and referral URLs when you use the platform.",
    ],
  },
  {
    id: "how-we-use-it",
    title: "2. How we use your information",
    body: [
      "To deliver, maintain, and improve the Leadash platform.",
      "To process payments and manage your subscription.",
      "To send transactional emails such as account confirmations, receipts, and security alerts.",
      "To monitor for abuse, fraud, and violations of our Terms of Service.",
      "To analyse aggregate usage patterns for product development (no personally identifiable data is used in these analyses).",
    ],
  },
  {
    id: "data-sharing",
    title: "3. Data sharing and third parties",
    body: [
      "We do not sell your personal data. We share data only in these circumstances:",
      "**Service providers** — We use third-party services including Supabase (database hosting), Stripe and Paystack (payments), and Vercel (infrastructure). Each operates under their own privacy policy.",
      "**Legal obligations** — We may disclose data when required by law, court order, or to protect the rights and safety of Leadash and its users.",
      "**Business transfers** — In the event of a merger, acquisition, or sale of assets, data may be transferred as part of that transaction. We will notify users before their data is transferred.",
    ],
  },
  {
    id: "data-retention",
    title: "4. Data retention",
    body: [
      "We retain your data for as long as your account is active or as needed to provide services. If you cancel your account, your workspace data is retained for 30 days before permanent deletion, giving you time to export.",
      "You can request deletion of your account and all associated data at any time by contacting support@leadash.io. Deletion is processed within 30 days.",
    ],
  },
  {
    id: "gdpr",
    title: "5. GDPR — Rights for EU/EEA users",
    body: [
      "If you are located in the European Economic Area, you have the following rights under GDPR:",
      "**Right of access** — Request a copy of the personal data we hold about you.",
      "**Right to rectification** — Correct inaccurate or incomplete data.",
      "**Right to erasure** — Request deletion of your personal data ('right to be forgotten').",
      "**Right to data portability** — Receive your data in a structured, machine-readable format.",
      "**Right to restrict processing** — Limit how we use your data in certain circumstances.",
      "**Right to object** — Object to data processing based on legitimate interests.",
      "To exercise any of these rights, email privacy@leadash.io. We will respond within 30 days.",
    ],
  },
  {
    id: "cookies",
    title: "6. Cookies",
    body: [
      "We use essential cookies required for authentication and security (session tokens). We do not use third-party advertising cookies.",
      "Analytics cookies (if enabled) collect anonymous usage data to help us improve the product. You can opt out at any time via your browser settings.",
    ],
  },
  {
    id: "security",
    title: "7. Security",
    body: [
      "We apply industry-standard security practices: TLS encryption in transit, AES-256 encryption at rest for sensitive credentials, regular security audits, and role-based access controls.",
      "Despite these measures, no system is perfectly secure. If you discover a security vulnerability, please report it responsibly to security@leadash.io.",
    ],
  },
  {
    id: "changes",
    title: "8. Changes to this policy",
    body: [
      "We may update this Privacy Policy from time to time. We will notify registered users by email at least 14 days before material changes take effect. Continued use of the platform after that date constitutes acceptance of the updated policy.",
      "This policy was last updated on 1 April 2026.",
    ],
  },
  {
    id: "contact",
    title: "9. Contact",
    body: [
      "Questions about this policy? Contact our privacy team at privacy@leadash.io or write to: Leadash, Inc., Privacy Team, [Address].",
    ],
  },
];

function renderBody(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="text-white/70 font-semibold">{part}</strong>
      : <span key={i}>{part}</span>
  );
}

export default function PrivacyPage() {
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
        <div className="max-w-3xl mx-auto px-6 py-24">
          {/* Header */}
          <div className="mb-14">
            <Link href="/" className="inline-flex items-center gap-1.5 text-white/30 hover:text-white/60 text-sm mb-8 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
              Back to home
            </Link>
            <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-3">Legal</p>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4" style={{ letterSpacing: "-0.025em" }}>Privacy Policy</h1>
            <p className="text-white/35 text-base">Effective date: 1 April 2026 · Last updated: 1 April 2026</p>
            <div className="mt-6 p-4 rounded-xl" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}>
              <p className="text-indigo-300/70 text-sm leading-relaxed">
                This Privacy Policy explains how Leadash ("we", "us", "our") collects, uses, and protects your personal information when you use our platform. We are committed to protecting your privacy and handling your data transparently.
              </p>
            </div>
          </div>

          {/* Table of contents */}
          <nav className="mb-14 rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-4">Contents</p>
            <div className="space-y-2">
              {SECTIONS.map(s => (
                <a key={s.id} href={`#${s.id}`} className="block text-white/40 hover:text-indigo-400 text-sm transition-colors">{s.title}</a>
              ))}
            </div>
          </nav>

          {/* Sections */}
          <div className="space-y-14">
            {SECTIONS.map(s => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="text-xl font-bold text-white mb-5" style={{ letterSpacing: "-0.015em" }}>{s.title}</h2>
                <div className="space-y-3">
                  {s.body.map((para, i) => (
                    <p key={i} className="text-white/45 text-sm leading-relaxed">{renderBody(para)}</p>
                  ))}
                </div>
                <div className="mt-8 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />
              </section>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-white/6 py-10 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <Logo />
            <p className="text-white/20 text-sm">© {new Date().getFullYear()} Leadash. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <Link href="/privacy" className="text-white/40 text-sm">Privacy Policy</Link>
              <Link href="/terms" className="text-white/20 text-sm hover:text-white/50 transition-colors">Terms of Service</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
