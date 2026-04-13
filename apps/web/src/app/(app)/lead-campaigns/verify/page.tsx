"use client";
import { useState } from "react";
import { wsPost } from "@/lib/workspace/client";
import type { ReoonResult as VerifyResult } from "@/lib/lead-campaigns/reoon";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  safe:        { label: "Safe",        color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/25", icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  valid:       { label: "Valid",       color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/25", icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  invalid:     { label: "Invalid",     color: "text-red-400",     bg: "bg-red-500/15 border-red-500/25",         icon: "M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  dangerous:   { label: "Dangerous",   color: "text-red-400",     bg: "bg-red-500/15 border-red-500/25",         icon: "M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  risky:       { label: "Risky",       color: "text-amber-400",   bg: "bg-amber-500/15 border-amber-500/25",    icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" },
  catch_all:   { label: "Catch-all",   color: "text-amber-400",   bg: "bg-amber-500/15 border-amber-500/25",    icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" },
  disposable:  { label: "Disposable",  color: "text-orange-400",  bg: "bg-orange-500/15 border-orange-500/25",  icon: "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" },
  unknown:     { label: "Unknown",     color: "text-white/40",    bg: "bg-white/6 border-white/10",              icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" },
};

export default function VerifyEmailPage() {
  const [email, setEmail]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<VerifyResult | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [history, setHistory]   = useState<VerifyResult[]>([]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await wsPost<VerifyResult>("/api/lead-campaigns/verify-single", { email: email.trim() });
      setResult(res);
      setHistory(prev => [res, ...prev].slice(0, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  const cfg = result ? (STATUS_CONFIG[result.status] ?? STATUS_CONFIG.unknown) : null;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-bold text-white">Verify Email</h1>
        <p className="text-white/40 text-sm mt-0.5">Check if a single email address is valid and deliverable</p>
      </div>

      {/* Input */}
      <form onSubmit={handleVerify} className="flex gap-3 mb-6">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="name@company.com"
          className="flex-1 bg-white/6 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 text-sm focus:outline-none focus:border-blue-500/60 focus:bg-white/8 transition-all"
          disabled={loading}
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2"
        >
          {loading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {loading ? "Verifying…" : "Verify"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Result */}
      {result && cfg && (
        <div className={`mb-8 p-5 rounded-2xl border ${cfg.bg}`}>
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
              <svg className={`w-5 h-5 ${cfg.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={cfg.icon} />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-base font-bold ${cfg.color}`}>{cfg.label}</span>
                <span className="text-white/20 text-sm">·</span>
                <span className="text-white/40 text-sm">Score: {result.score}</span>
              </div>
              <p className="text-white/60 text-sm break-all">{result.email}</p>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <p className="text-white/30 text-xs font-semibold uppercase tracking-widest mb-3">Recent</p>
          <div className="border border-white/8 rounded-2xl overflow-hidden">
            {history.map((h, i) => {
              const hcfg = STATUS_CONFIG[h.status] ?? STATUS_CONFIG.unknown;
              return (
                <div
                  key={`${h.email}-${i}`}
                  className={`flex items-center justify-between px-4 py-3 ${i !== history.length - 1 ? "border-b border-white/5" : ""}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <svg className={`w-4 h-4 flex-shrink-0 ${hcfg.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={hcfg.icon} />
                    </svg>
                    <span
                      className="text-white/70 text-sm truncate cursor-pointer hover:text-white transition-colors"
                      onClick={() => setEmail(h.email)}
                    >
                      {h.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <span className="text-white/30 text-xs">{h.score}</span>
                    <span className={`text-xs font-medium ${hcfg.color}`}>{hcfg.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-white/20 text-xs mt-2 text-center">Click an email in the list to re-verify it</p>
        </div>
      )}
    </div>
  );
}
