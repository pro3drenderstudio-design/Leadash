"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function SignupPage() {
  const [name, setName]                   = useState("");
  const [email, setEmail]                 = useState("");
  const [password, setPassword]           = useState("");
  const [showPassword, setShow]           = useState(false);
  const [error, setError]                 = useState("");
  const [loading, setLoading]             = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [done, setDone]                   = useState(false);

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
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name }, emailRedirectTo: `${location.origin}/api/auth/callback` },
    });
    if (error) { setError(error.message); setLoading(false); }
    else setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-8 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 border border-green-500/20">
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Check your inbox</h2>
        <p className="text-white/40 text-sm">We sent a confirmation link to</p>
        <p className="text-white font-medium text-sm mt-0.5">{email}</p>
        <p className="text-white/25 text-xs mt-4">Click the link in the email to activate your account.</p>
        <Link href="/login" className="mt-6 inline-block text-sm text-blue-400 hover:text-blue-300 transition-colors">← Back to sign in</Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]">
      <div className="mb-7 text-center">
        <h1 className="text-[22px] font-semibold tracking-tight text-white">Start for free</h1>
        <p className="mt-1 text-sm text-white/40">Create your Leadash account</p>
      </div>

      {/* Google */}
      <button
        onClick={handleGoogle}
        disabled={googleLoading || loading}
        className="group flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/12 bg-white/6 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/10 hover:border-white/20 disabled:opacity-50"
      >
        {googleLoading
          ? <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          : <GoogleIcon />
        }
        Continue with Google
      </button>

      {/* Divider */}
      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/8" />
        <span className="text-xs text-white/25 font-medium">or</span>
        <div className="h-px flex-1 bg-white/8" />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">Full name</label>
          <input
            type="text" required value={name} onChange={e => setName(e.target.value)}
            placeholder="Jane Smith"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-white/20 outline-none transition-colors focus:border-blue-500/60 focus:bg-white/7"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">Work email</label>
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-white/20 outline-none transition-colors focus:border-blue-500/60 focus:bg-white/7"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"} required minLength={8}
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="8+ characters"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-white/20 outline-none pr-10 transition-colors focus:border-blue-500/60 focus:bg-white/7"
            />
            <button
              type="button" onClick={() => setShow(v => !v)} tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
            >
              {showPassword
                ? <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
                : <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z" clipRule="evenodd"/><path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z"/></svg>
              }
            </button>
          </div>
          {/* Password strength hint */}
          {password.length > 0 && (
            <div className="mt-2 flex gap-1">
              {[...Array(4)].map((_, i) => (
                <div key={i} className={`h-0.5 flex-1 rounded-full transition-colors ${
                  password.length >= (i === 0 ? 1 : i === 1 ? 6 : i === 2 ? 10 : 14)
                    ? i < 2 ? "bg-red-500" : i < 3 ? "bg-amber-400" : "bg-green-400"
                    : "bg-white/10"
                }`} />
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/></svg>
            <p className="text-red-400 text-xs leading-relaxed">{error}</p>
          </div>
        )}

        <button
          type="submit" disabled={loading || googleLoading}
          className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-50 shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Creating account…
            </span>
          ) : "Create account"}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-white/25">
        By signing up you agree to our{" "}
        <span className="text-white/40">Terms of Service</span>{" "}
        and{" "}
        <span className="text-white/40">Privacy Policy</span>.
      </p>

      <p className="mt-4 text-center text-xs text-white/30">
        Already have an account?{" "}
        <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">Sign in</Link>
      </p>
    </div>
  );
}
