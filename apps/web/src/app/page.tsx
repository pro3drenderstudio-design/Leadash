import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/8 max-w-6xl mx-auto">
        <span className="text-lg font-bold tracking-tight">Leadash</span>
        <div className="flex items-center gap-4">
          <Link href="/pricing" className="text-sm text-gray-400 hover:text-white transition-colors">Pricing</Link>
          <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">Sign in</Link>
          <Link href="/signup" className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition-colors">
            Start free
          </Link>
        </div>
      </nav>

      <div className="text-center px-4 py-32 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-sm text-blue-400 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          Commercial-scale cold outreach
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
          Cold email that<br className="hidden md:block" /> actually delivers
        </h1>
        <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
          Multi-inbox sending, automatic warmup, AI reply classification, and deep analytics — built for agencies and sales teams.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/signup" className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-8 py-3 rounded-xl transition-colors">
            Get started free
          </Link>
          <Link href="/pricing" className="border border-white/15 hover:border-white/30 text-white font-medium px-8 py-3 rounded-xl transition-colors">
            View pricing
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 pb-24 grid md:grid-cols-3 gap-6">
        {[
          { title: "Multi-inbox rotation", desc: "Connect Gmail, Outlook, or SMTP. Rotate sends across inboxes to maximize deliverability." },
          { title: "Inbox warmup", desc: "Auto warmup with peer-to-peer sends, spam rescue, and gradual daily ramp." },
          { title: "AI reply detection", desc: "Gemini classifies every reply — interested, OOO, unsubscribe — automatically." },
          { title: "A/B subject testing", desc: "Test subject line variants with automatic winner detection." },
          { title: "Open & click tracking", desc: "Know exactly when prospects open your emails and click your links." },
          { title: "Team workspaces", desc: "Invite teammates, manage permissions, and collaborate on campaigns." },
        ].map(f => (
          <div key={f.title} className="bg-gray-900 border border-white/8 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-2">{f.title}</h3>
            <p className="text-sm text-gray-400">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
