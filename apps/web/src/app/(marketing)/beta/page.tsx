"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

interface Enrollment {
  id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  review_note: string | null;
}

const PERKS = [
  { icon: "M13 10V3L4 14h7v7l9-11h-7z",       label: "1 Month Free Starter",  desc: "Full Starter plan access at no cost" },
  { icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z", label: "500 Free Credits",      desc: "Kickstart your lead generation" },
  { icon: "M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z", label: "Early Access",          desc: "Shape the product with your feedback" },
  { icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z", label: "Priority Support",      desc: "Direct line to the founding team" },
];

export default function BetaPage() {
  const [enrollment, setEnrollment] = useState<Enrollment | null | undefined>(undefined);
  const [name, setName]             = useState("");
  const [reason, setReason]         = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [done, setDone]             = useState(false);

  useEffect(() => {
    fetch("/api/beta/enroll")
      .then(r => r.json())
      .then(d => setEnrollment(d.enrollment ?? null))
      .catch(() => setEnrollment(null));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/beta/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, reason }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    setLoading(false);
    if (data.ok) { setDone(true); }
    else if (res.status === 401) { window.location.href = "/login?redirectTo=/beta"; }
    else { setError(data.error ?? "Failed to submit"); }
  }

  const statusBadge = {
    pending:  { cls: "bg-amber-500/15 text-amber-400 border-amber-500/25",   label: "Under review" },
    approved: { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", label: "Approved!" },
    rejected: { cls: "bg-red-500/15 text-red-400 border-red-500/25",         label: "Not selected" },
  };

  return (
    <div className="min-h-screen" style={{ background: "#020617" }}>
      <div className="max-w-4xl mx-auto px-6 py-20">

        {/* Hero */}
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/25 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            Limited spots available
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
            Join the Leadash Beta
          </h1>
          <p className="text-lg text-white/50 max-w-xl mx-auto leading-relaxed">
            Get free access to Leadash&apos;s Starter plan for one month. Help us shape the future of AI-powered outreach.
          </p>
        </div>

        {/* Perks grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {PERKS.map(p => (
            <div key={p.label} className="rounded-2xl p-5 border border-white/8 bg-white/3 text-center">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={p.icon} />
                </svg>
              </div>
              <p className="text-white font-semibold text-sm">{p.label}</p>
              <p className="text-white/40 text-xs mt-1">{p.desc}</p>
            </div>
          ))}
        </div>

        {/* Form / Status */}
        <div className="max-w-lg mx-auto">

          {/* Already enrolled */}
          {enrollment !== undefined && enrollment !== null && (
            <div className="rounded-2xl border border-white/10 bg-white/3 p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-white font-semibold text-lg mb-2">Application submitted</h2>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${statusBadge[enrollment.status].cls}`}>
                {statusBadge[enrollment.status].label}
              </span>
              {enrollment.status === "pending" && (
                <p className="text-white/40 text-sm mt-4">We&apos;ll review your application and notify you by email.</p>
              )}
              {enrollment.status === "approved" && (
                <div className="mt-4">
                  <p className="text-white/50 text-sm mb-4">Your account has been upgraded to Starter. Welcome to the beta!</p>
                  <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-sm font-semibold transition-colors">
                    Go to Dashboard →
                  </Link>
                </div>
              )}
              {enrollment.status === "rejected" && enrollment.review_note && (
                <p className="text-white/40 text-sm mt-4">{enrollment.review_note}</p>
              )}
            </div>
          )}

          {/* Not enrolled — loading */}
          {enrollment === undefined && (
            <div className="h-64 rounded-2xl bg-white/3 border border-white/8 animate-pulse" />
          )}

          {/* Not enrolled — show form */}
          {enrollment === null && !done && (
            <div className="rounded-2xl border border-white/10 bg-white/3 p-8">
              <h2 className="text-white font-semibold text-lg mb-1">Apply for beta access</h2>
              <p className="text-white/40 text-sm mb-6">Applications are reviewed manually. We&apos;ll get back to you within 24 hours.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Your name</label>
                  <input
                    value={name} onChange={e => setName(e.target.value)} required
                    placeholder="Jane Smith"
                    className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-orange-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">
                    How will you use Leadash? <span className="text-white/25 normal-case font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={reason} onChange={e => setReason(e.target.value)}
                    rows={4}
                    placeholder="e.g. I run a B2B SaaS company and want to automate outreach to potential enterprise clients…"
                    className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-orange-500/50 resize-none"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                    <p className="text-red-400 text-xs">{error}</p>
                  </div>
                )}

                <button
                  type="submit" disabled={loading || !name}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Submitting…
                    </span>
                  ) : "Apply for Beta Access"}
                </button>

                <p className="text-center text-xs text-white/30">
                  Already have an account?{" "}
                  <Link href="/login?redirectTo=/beta" className="text-orange-400 hover:text-orange-300 transition-colors">Sign in</Link>
                </p>
              </form>
            </div>
          )}

          {/* Done */}
          {done && (
            <div className="rounded-2xl border border-white/10 bg-white/3 p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-white font-semibold text-lg mb-2">Application received!</h2>
              <p className="text-white/40 text-sm">We&apos;ll review your application and send you an email within 24 hours.</p>
              <Link href="/dashboard" className="inline-flex items-center gap-2 mt-6 text-sm text-orange-400 hover:text-orange-300 transition-colors">
                Go to dashboard →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
