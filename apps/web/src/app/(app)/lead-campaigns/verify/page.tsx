"use client";
import { useState, useRef } from "react";
import { wsGet, wsPost } from "@/lib/workspace/client";
import type { ReoonResult as VerifyResult } from "@/lib/lead-campaigns/reoon";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  safe:       { label: "Safe",       color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/25", icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  valid:      { label: "Valid",      color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/25", icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  invalid:    { label: "Invalid",    color: "text-red-400",     bg: "bg-red-500/15 border-red-500/25",         icon: "M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  dangerous:  { label: "Dangerous",  color: "text-red-400",     bg: "bg-red-500/15 border-red-500/25",         icon: "M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  risky:      { label: "Risky",      color: "text-amber-400",   bg: "bg-amber-500/15 border-amber-500/25",    icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" },
  catch_all:  { label: "Catch-all",  color: "text-amber-400",   bg: "bg-amber-500/15 border-amber-500/25",    icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" },
  disposable: { label: "Disposable", color: "text-orange-400",  bg: "bg-orange-500/15 border-orange-500/25",  icon: "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" },
  unknown:    { label: "Unknown",    color: "text-white/40",    bg: "bg-white/6 border-white/10",              icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" },
};
const DEFAULT_CFG = STATUS_CONFIG.unknown;

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCsvEmails(text: string): string[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  // Detect header row — if first cell looks like "email" skip it
  const header = lines[0].split(",")[0].trim().toLowerCase().replace(/"/g, "");
  const start  = ["email", "e-mail", "emailaddress"].includes(header) ? 1 : 0;
  const emails: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = lines[i].split(",");
    for (const cell of cells) {
      const v = cell.trim().replace(/^["']|["']$/g, "");
      if (v.includes("@") && v.includes(".")) { emails.push(v.toLowerCase()); break; }
    }
  }
  return [...new Set(emails)];
}

function downloadResultsCsv(results: VerifyResult[]) {
  const rows = [
    "email,status,score",
    ...results.map(r => `${r.email},${r.status},${r.score}`),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = "verification-results.csv";
  a.click();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VerifyEmailPage() {
  const [tab, setTab] = useState<"single" | "bulk">("single");

  // ── Single ──
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<VerifyResult | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [history, setHistory] = useState<VerifyResult[]>([]);

  // ── Bulk ──
  const fileRef                           = useRef<HTMLInputElement>(null);
  const [bulkEmails, setBulkEmails]       = useState<string[]>([]);
  const [bulkLoading, setBulkLoading]     = useState(false);
  const [bulkResults, setBulkResults]     = useState<VerifyResult[]>([]);
  const [bulkError, setBulkError]         = useState<string | null>(null);
  const [balance, setBalance]             = useState<number | null>(null);

  // Load balance once
  useState(() => {
    wsGet<{ balance: number }>("/api/lead-campaigns/credits")
      .then(d => setBalance(d.balance))
      .catch(() => {});
  });

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await wsPost<VerifyResult>("/api/lead-campaigns/verify-single", { email: email.trim() });
      setResult(res);
      setHistory(prev => [res, ...prev].slice(0, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally { setLoading(false); }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const emails = parseCsvEmails(ev.target?.result as string);
      setBulkEmails(emails);
      setBulkResults([]);
      setBulkError(null);
    };
    reader.readAsText(file);
  }

  async function handleBulkVerify() {
    if (!bulkEmails.length) return;
    setBulkLoading(true); setBulkError(null); setBulkResults([]);
    try {
      const res = await wsPost<{ results: VerifyResult[]; credits_used: number }>(
        "/api/lead-campaigns/verify-bulk",
        { emails: bulkEmails },
      );
      setBulkResults(res.results);
      setBalance(b => b !== null ? b - res.credits_used : null);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Verification failed");
    } finally { setBulkLoading(false); }
  }

  const cfg = result ? (STATUS_CONFIG[result.status] ?? DEFAULT_CFG) : null;
  const cost = bulkEmails.length * 0.5;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Verify Email</h1>
          <p className="text-white/40 text-sm mt-0.5">Check if email addresses are valid and deliverable</p>
        </div>
        {balance !== null && (
          <span className="text-amber-400 text-sm font-medium">{balance.toLocaleString()} credits</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-white/4 border border-white/8 rounded-xl p-1 mb-6">
        {([["single", "Single Email"], ["bulk", "Bulk CSV"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Single tab ── */}
      {tab === "single" && (
        <>
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
              {loading ? "Verifying…" : "Verify · 0.5cr"}
            </button>
          </form>

          {error && (
            <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-400 text-sm">{error}</div>
          )}

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

          {history.length > 0 && (
            <div>
              <p className="text-white/30 text-xs font-semibold uppercase tracking-widest mb-3">Recent</p>
              <div className="border border-white/8 rounded-2xl overflow-hidden">
                {history.map((h, i) => {
                  const hcfg = STATUS_CONFIG[h.status] ?? DEFAULT_CFG;
                  return (
                    <div key={`${h.email}-${i}`} className={`flex items-center justify-between px-4 py-3 ${i !== history.length - 1 ? "border-b border-white/5" : ""}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <svg className={`w-4 h-4 flex-shrink-0 ${hcfg.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={hcfg.icon} />
                        </svg>
                        <span className="text-white/70 text-sm truncate cursor-pointer hover:text-white transition-colors" onClick={() => setEmail(h.email)}>
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
              <p className="text-white/20 text-xs mt-2 text-center">Click an email to re-verify it</p>
            </div>
          )}
        </>
      )}

      {/* ── Bulk tab ── */}
      {tab === "bulk" && (
        <>
          {/* Upload area */}
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-white/10 rounded-2xl p-10 text-center cursor-pointer hover:border-white/20 hover:bg-white/3 transition-all mb-4"
          >
            <svg className="w-8 h-8 text-white/25 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-white/50 text-sm font-medium">Upload CSV file</p>
            <p className="text-white/25 text-xs mt-1">Must contain an email column · max 500 emails</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          </div>

          {bulkEmails.length > 0 && (
            <div className="mb-4 flex items-center justify-between px-4 py-3 bg-white/4 border border-white/8 rounded-xl">
              <div>
                <p className="text-white text-sm font-medium">{bulkEmails.length} emails detected</p>
                <p className="text-white/40 text-xs mt-0.5">Cost: {cost} credits ({bulkEmails.length} × 0.5)</p>
              </div>
              <button
                onClick={handleBulkVerify}
                disabled={bulkLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2"
              >
                {bulkLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verifying…
                  </>
                ) : "Verify All"}
              </button>
            </div>
          )}

          {bulkError && (
            <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-400 text-sm">{bulkError}</div>
          )}

          {bulkResults.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-white/50 text-sm">{bulkResults.length} results</p>
                <button
                  onClick={() => downloadResultsCsv(bulkResults)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/6 border border-white/10 text-white/70 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download CSV
                </button>
              </div>
              <div className="border border-white/8 rounded-2xl overflow-hidden">
                {bulkResults.slice(0, 100).map((r, i) => {
                  const rcfg = STATUS_CONFIG[r.status] ?? DEFAULT_CFG;
                  return (
                    <div key={r.email} className={`flex items-center justify-between px-4 py-2.5 ${i !== bulkResults.length - 1 ? "border-b border-white/5" : ""}`}>
                      <span className="text-white/60 text-sm truncate flex-1 mr-4 font-mono text-xs">{r.email}</span>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-white/30 text-xs">{r.score}</span>
                        <span className={`text-xs font-medium ${rcfg.color}`}>{rcfg.label}</span>
                      </div>
                    </div>
                  );
                })}
                {bulkResults.length > 100 && (
                  <div className="px-4 py-3 text-center text-white/30 text-xs border-t border-white/5">
                    +{bulkResults.length - 100} more — download CSV for full results
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
