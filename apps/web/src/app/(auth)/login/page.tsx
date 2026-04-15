"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

const STATS = [
  { value: "9,000+", label: "Active users" },
  { value: "2.4M", label: "Leads generated" },
  { value: "94%", label: "Inbox delivery rate" },
];

export default function LoginPage() {
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPassword, setShow]   = useState(false);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogle() {
    setGoogleLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
    if (error) { setError(error.message); setGoogleLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); }
    else window.location.href = "/dashboard";
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left Panel — Brand + Stats ──────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[48%] xl:w-[50%] flex-col justify-between p-12 xl:p-16 relative overflow-hidden"
        style={{ background: "linear-gradient(145deg, #0a0f1e 0%, #0c1228 60%, #0a0f1e 100%)" }}>

        {/* Decorative orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-15%] right-[-5%] w-[480px] h-[480px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)" }} />
          <div className="absolute bottom-[-10%] left-[10%] w-[350px] h-[350px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)" }} />
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Leadash" className="h-9 w-auto" />
          </Link>
        </div>

        {/* Hero */}
        <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
          <h2 className="text-4xl xl:text-[44px] font-bold text-white leading-tight mb-5" style={{ letterSpacing: "-0.03em" }}>
            Welcome back<br />
            <span style={{ background: "linear-gradient(135deg, #fdba74, #f97316)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              to Leadash
            </span>
          </h2>
          <p className="text-white/40 text-lg leading-relaxed max-w-sm mb-12">
            Your pipeline is waiting. Sign in to pick up where you left off.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {STATS.map(s => (
              <div key={s.value} className="rounded-2xl p-4"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-white font-bold text-xl tabular-nums" style={{ letterSpacing: "-0.02em" }}>{s.value}</p>
                <p className="text-white/35 text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="relative z-10 flex items-center justify-between">
          <p className="text-white/25 text-xs">New to Leadash?</p>
          <Link
            href="/signup"
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5"
          >
            Create a free account
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
            </svg>
          </Link>
        </div>
      </div>

      {/* ── Right Panel — Form ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-10 lg:px-14 xl:px-20 py-12">

        {/* Mobile logo */}
        <div className="flex justify-center mb-10 lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Leadash" className="h-9 w-auto" />
        </div>

        <div className="w-full max-w-sm mx-auto">
          <div className="mb-8">
            <h1 className="text-[26px] font-bold text-white mb-1.5" style={{ letterSpacing: "-0.02em" }}>
              Sign in
            </h1>
            <p className="text-white/40 text-sm">Sign in to your Leadash account.</p>
          </div>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white transition-all hover:bg-white/8 disabled:opacity-50 mb-6"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            {googleLoading
              ? <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              : <GoogleIcon />
            }
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
            <span className="text-xs text-white/25 font-medium">or with email</span>
            <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/20 outline-none transition-colors"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "rgba(99,102,241,0.6)"; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.1)"; }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-white/50">Password</label>
                <Link href="/forgot-password" className="text-xs text-white/35 hover:text-white/60 transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"} required value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm text-white placeholder-white/20 outline-none transition-colors"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "rgba(99,102,241,0.6)"; }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "rgba(255,255,255,0.1)"; }}
                />
                <button type="button" onClick={() => setShow(v => !v)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors">
                  {showPassword
                    ? <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
                    : <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z" clipRule="evenodd"/><path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z"/></svg>
                  }
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                </svg>
                <p className="text-red-400 text-xs leading-relaxed">{error}</p>
              </div>
            )}

            <button
              type="submit" disabled={loading || googleLoading}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all disabled:opacity-50 mt-1"
              style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", boxShadow: "0 4px 20px rgba(249,115,22,0.3)" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in…
                </span>
              ) : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-white/30">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-orange-400 hover:text-orange-300 font-medium transition-colors">
              Start for free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
