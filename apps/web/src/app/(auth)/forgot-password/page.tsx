"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/api/auth/callback?next=/reset-password`,
    });
    if (error) { setError(error.message); setLoading(false); }
    else setDone(true);
  }

  if (done) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-[400px]">
      <div className="flex justify-center mb-9"><img src="/logo.svg" alt="Leadash" className="h-10 w-auto" /></div>
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-8 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/15 border border-orange-500/20">
          <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Check your inbox</h2>
        <p className="text-white/40 text-sm">We sent a reset link to <span className="text-white">{email}</span></p>
        <Link href="/login" className="mt-6 inline-block text-sm text-orange-400 hover:text-orange-300 transition-colors">← Back to sign in</Link>
      </div>
      </div></div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
    <div className="w-full max-w-[400px]">
    <div className="flex justify-center mb-9"><img src="/logo.svg" alt="Leadash" className="h-10 w-auto" /></div>
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]">
      <div className="mb-7 text-center">
        <h1 className="text-[22px] font-semibold tracking-tight text-white">Reset password</h1>
        <p className="mt-1 text-sm text-white/40">We&apos;ll send a reset link to your email</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">Email</label>
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-white/20 outline-none transition-colors focus:border-orange-500/60 focus:bg-white/7"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/></svg>
            <p className="text-red-400 text-xs leading-relaxed">{error}</p>
          </div>
        )}

        <button
          type="submit" disabled={loading}
          className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-orange-400 disabled:opacity-50 shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Sending…
            </span>
          ) : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-white/30">
        <Link href="/login" className="text-white/40 hover:text-white/60 transition-colors">← Back to sign in</Link>
      </p>
    </div>
    </div></div>
  );
}
