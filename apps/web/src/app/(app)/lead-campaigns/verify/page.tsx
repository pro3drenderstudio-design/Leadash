"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { wsGet, wsPost, wsFetch } from "@/lib/workspace/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VerifyResult {
  email:  string;
  status: string;
  score:  number;
}

interface VerifyJob {
  id:           string;
  status:       string;
  total:        number;
  safe:         number;
  invalid:      number;
  catch_all:    number;
  risky:        number;
  dangerous:    number;
  disposable:   number;
  unknown:      number;
  credits_used: number;
  completed_at: string;
  expires_at:   string;
  created_at:   string;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; bar: string; icon: string }> = {
  safe:       { label: "Safe",       color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/25", bar: "bg-emerald-500",  icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  valid:      { label: "Valid",      color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/25", bar: "bg-emerald-500",  icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  invalid:    { label: "Invalid",    color: "text-red-400",     bg: "bg-red-500/15 border-red-500/25",         bar: "bg-red-500",     icon: "M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  dangerous:  { label: "Dangerous",  color: "text-red-400",     bg: "bg-red-500/15 border-red-500/25",         bar: "bg-red-600",     icon: "M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  risky:      { label: "Risky",      color: "text-amber-400",   bg: "bg-amber-500/15 border-amber-500/25",     bar: "bg-amber-500",   icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" },
  catch_all:  { label: "Catch-all",  color: "text-amber-400",   bg: "bg-amber-500/15 border-amber-500/25",     bar: "bg-amber-400",   icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" },
  disposable: { label: "Disposable", color: "text-orange-400",  bg: "bg-orange-500/15 border-orange-500/25",   bar: "bg-orange-500",  icon: "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" },
  unknown:    { label: "Unknown",    color: "text-white/40",    bg: "bg-white/6 border-white/10",               bar: "bg-white/20",    icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" },
};
const DEFAULT_CFG  = STATUS_CONFIG.unknown;
const STATUS_ORDER = ["safe", "catch_all", "risky", "disposable", "invalid", "dangerous", "unknown"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCsvEmails(text: string): string[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
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

function downloadCsv(results: VerifyResult[], filename = "verification-results.csv") {
  const rows = ["email,status,score", ...results.map(r => `${r.email},${r.status},${r.score}`)];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename }).click();
}

function countStatuses(results: VerifyResult[]) {
  const c: Record<string, number> = {};
  for (const r of results) c[r.status] = (c[r.status] ?? 0) + 1;
  return c;
}

function fmt(n: number) { return n.toLocaleString(); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── SSE reader ───────────────────────────────────────────────────────────────

async function* readSse(res: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = res.body!.getReader();
  const dec    = new TextDecoder();
  let   buf    = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.replace(/^data:\s*/, "").trim();
      if (!line) continue;
      try { yield JSON.parse(line) as Record<string, unknown>; } catch { /* skip */ }
    }
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBar({ counts, total }: { counts: Record<string, number>; total: number }) {
  if (!total) return null;
  return (
    <div className="space-y-3">
      <div className="h-2 rounded-full overflow-hidden flex bg-white/6">
        {STATUS_ORDER.map(s => {
          const n = counts[s] ?? 0;
          if (!n) return null;
          return (
            <div
              key={s}
              className={`${(STATUS_CONFIG[s] ?? DEFAULT_CFG).bar} h-full transition-all duration-300`}
              style={{ width: `${(n / total) * 100}%` }}
              title={`${(STATUS_CONFIG[s] ?? DEFAULT_CFG).label}: ${n}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {STATUS_ORDER.map(s => {
          const n = counts[s] ?? 0;
          if (!n) return null;
          const cfg = STATUS_CONFIG[s] ?? DEFAULT_CFG;
          return (
            <span key={s} className="flex items-center gap-1.5 text-xs">
              <span className={`w-2 h-2 rounded-full ${cfg.bar}`} />
              <span className={`font-semibold ${cfg.color}`}>{fmt(n)}</span>
              <span className="text-white/30">{cfg.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ResultsTable({ results, page, onPage }: { results: VerifyResult[]; page: number; onPage: (p: number) => void }) {
  const PER = 25;
  const totalPages = Math.ceil(results.length / PER);
  const slice      = results.slice((page - 1) * PER, page * PER);
  return (
    <div>
      <div className="border border-white/8 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] text-xs font-semibold text-white/25 uppercase tracking-widest px-4 py-2 border-b border-white/6">
          <span>Email</span><span className="mr-6">Score</span><span>Status</span>
        </div>
        {slice.map((r, i) => {
          const cfg = STATUS_CONFIG[r.status] ?? DEFAULT_CFG;
          return (
            <div key={r.email} className={`grid grid-cols-[1fr_auto_auto] items-center px-4 py-2.5 ${i < slice.length - 1 ? "border-b border-white/5" : ""}`}>
              <span className="text-white/55 text-xs font-mono truncate pr-3">{r.email}</span>
              <span className="text-white/25 text-xs mr-6">{r.score}</span>
              <span className={`text-xs font-semibold ${cfg.color} min-w-[70px] text-right`}>{cfg.label}</span>
            </div>
          );
        })}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-white/25 text-xs">{(page-1)*PER+1}–{Math.min(page*PER, results.length)} of {fmt(results.length)}</span>
          <div className="flex gap-1">
            <button onClick={() => onPage(page-1)} disabled={page===1} className="px-3 py-1.5 text-xs text-white/50 hover:text-white disabled:opacity-30 bg-white/5 border border-white/8 rounded-lg transition-colors">← Prev</button>
            <button onClick={() => onPage(page+1)} disabled={page===totalPages} className="px-3 py-1.5 text-xs text-white/50 hover:text-white disabled:opacity-30 bg-white/5 border border-white/8 rounded-lg transition-colors">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab      = "verify" | "past";
type Mode     = "single" | "bulk";
type BulkView = "upload" | "running" | "done";

export default function VerifyEmailPage() {
  const [tab, setTab]         = useState<Tab>("verify");
  const [mode, setMode]       = useState<Mode>("single");
  const [balance, setBalance] = useState<number | null>(null);

  // ── Single ──
  const [email, setEmail]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<VerifyResult | null>(null);
  const [singleErr, setSingleErr] = useState<string | null>(null);
  const [history, setHistory]   = useState<VerifyResult[]>([]);

  // ── Bulk ──
  const fileRef                       = useRef<HTMLInputElement>(null);
  const [bulkView, setBulkView]       = useState<BulkView>("upload");
  const [bulkEmails, setBulkEmails]   = useState<string[]>([]);
  const [processed, setProcessed]     = useState(0);
  const [total, setTotal]             = useState(0);
  const [liveResults, setLiveResults] = useState<VerifyResult[]>([]);
  const [liveCounts, setLiveCounts]   = useState<Record<string, number>>({});
  const [bulkErr, setBulkErr]         = useState<string | null>(null);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [resultPage, setResultPage]   = useState(1);

  // ── Past jobs ──
  const [jobs, setJobs]               = useState<VerifyJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    wsGet<{ balance: number }>("/api/lead-campaigns/credits")
      .then(d => setBalance(d.balance)).catch(() => {});
  }, []);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try { const d = await wsGet<{ jobs: VerifyJob[] }>("/api/lead-campaigns/verify-jobs"); setJobs(d.jobs); }
    catch { /* ignore */ } finally { setJobsLoading(false); }
  }, []);

  useEffect(() => { if (tab === "past") loadJobs(); }, [tab, loadJobs]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setSingleErr(null); setResult(null);
    try {
      const res = await wsPost<VerifyResult>("/api/lead-campaigns/verify-single", { email: email.trim() });
      setResult(res);
      setHistory(prev => [res, ...prev].slice(0, 20));
      setBalance(b => b !== null ? b - 0.5 : null);
    } catch (err) { setSingleErr(err instanceof Error ? err.message : "Verification failed"); }
    finally { setLoading(false); }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const emails = parseCsvEmails(ev.target?.result as string);
      setBulkEmails(emails); setBulkView("upload"); setBulkErr(null);
      setLiveResults([]); setLiveCounts({}); setResultPage(1);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleBulkVerify() {
    if (!bulkEmails.length) return;
    setBulkErr(null); setLiveResults([]); setLiveCounts({});
    setProcessed(0); setTotal(bulkEmails.length); setCreditsUsed(0);
    setResultPage(1); setBulkView("running");
    try {
      const res = await wsFetch("/api/lead-campaigns/verify-bulk", {
        method: "POST", body: JSON.stringify({ emails: bulkEmails }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        setBulkErr((err as { error?: string }).error ?? res.statusText);
        setBulkView("upload"); return;
      }
      const all: VerifyResult[] = [];
      for await (const msg of readSse(res)) {
        if (msg.type === "progress") {
          all.push(...((msg.batch as VerifyResult[]) ?? []));
          setProcessed(msg.processed as number);
          setLiveResults([...all]); setLiveCounts(countStatuses(all));
        } else if (msg.type === "done") {
          setCreditsUsed(msg.credits_used as number);
          setBalance(b => b !== null ? b - (msg.credits_used as number) : null);
          setBulkView("done");
        } else if (msg.type === "error") {
          setBulkErr(msg.message as string); setBulkView("upload");
        }
      }
    } catch (err) {
      setBulkErr(err instanceof Error ? err.message : "Verification failed");
      setBulkView("upload");
    }
  }

  async function downloadJob(job: VerifyJob) {
    setDownloading(job.id);
    try {
      const d = await wsGet<{ results: VerifyResult[]; completed_at: string }>(`/api/lead-campaigns/verify-jobs/${job.id}`);
      downloadCsv(d.results, `verify-${new Date(d.completed_at).toISOString().split("T")[0]}-${job.total}.csv`);
    } catch { /* ignore */ } finally { setDownloading(null); }
  }

  const singleCfg = result ? (STATUS_CONFIG[result.status] ?? DEFAULT_CFG) : null;
  const cost       = bulkEmails.length * 0.5;
  const pct        = total ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Verify Email</h1>
          <p className="text-white/40 text-sm mt-0.5">Check if addresses are valid and deliverable · 0.5cr each</p>
        </div>
        <div className="flex items-center gap-3">
          {balance !== null && (
            <span className="text-amber-400 text-sm font-medium">{balance.toLocaleString()} credits</span>
          )}
        </div>
      </div>

      {/* ── Top tabs ── */}
      <div className="flex gap-0.5 bg-white/4 border border-white/8 rounded-xl p-1 mb-6">
        {([["verify", "Verify"] , ["past", "Past Jobs"]] as const).map(([key, label]) => (
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

      {/* ══ Verify tab ══ */}
      {tab === "verify" && (
        <>
          {/* Mode toggle — inline radio pills */}
          <div className="flex items-center gap-2 mb-6">
            <button
              onClick={() => setMode("single")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                mode === "single"
                  ? "bg-white/10 border-white/20 text-white"
                  : "border-white/8 text-white/40 hover:text-white/60 hover:border-white/14"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              Single
            </button>
            <button
              onClick={() => setMode("bulk")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                mode === "bulk"
                  ? "bg-white/10 border-white/20 text-white"
                  : "border-white/8 text-white/40 hover:text-white/60 hover:border-white/14"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Bulk CSV
              <span className="text-xs text-white/30 font-normal">up to 5,000</span>
            </button>
          </div>

          {/* ── Single mode ── */}
          {mode === "single" && (
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
                  {loading && (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {loading ? "Verifying…" : "Verify · 0.5cr"}
                </button>
              </form>

              {singleErr && (
                <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-400 text-sm">{singleErr}</div>
              )}

              {result && singleCfg && (
                <div className={`mb-8 p-5 rounded-2xl border ${singleCfg.bg}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${singleCfg.bg}`}>
                      <svg className={`w-5 h-5 ${singleCfg.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={singleCfg.icon} />
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-base font-bold ${singleCfg.color}`}>{singleCfg.label}</span>
                        <span className="text-white/20">·</span>
                        <span className="text-white/40 text-sm">Score {result.score}</span>
                      </div>
                      <p className="text-white/55 text-sm break-all mt-0.5">{result.email}</p>
                    </div>
                  </div>
                </div>
              )}

              {history.length > 0 && (
                <div>
                  <p className="text-white/25 text-xs font-semibold uppercase tracking-widest mb-3">Recent</p>
                  <div className="border border-white/8 rounded-2xl overflow-hidden">
                    {history.map((h, i) => {
                      const hcfg = STATUS_CONFIG[h.status] ?? DEFAULT_CFG;
                      return (
                        <div key={`${h.email}-${i}`} className={`flex items-center justify-between px-4 py-3 ${i < history.length-1 ? "border-b border-white/5" : ""}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <svg className={`w-4 h-4 flex-shrink-0 ${hcfg.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d={hcfg.icon} />
                            </svg>
                            <span className="text-white/60 text-sm truncate cursor-pointer hover:text-white transition-colors" onClick={() => setEmail(h.email)}>{h.email}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                            <span className="text-white/25 text-xs">{h.score}</span>
                            <span className={`text-xs font-medium ${hcfg.color}`}>{hcfg.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Bulk mode ── */}
          {mode === "bulk" && (
            <>
              {/* Upload state */}
              {bulkView === "upload" && (
                <>
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-white/10 rounded-2xl p-12 text-center cursor-pointer hover:border-white/20 hover:bg-white/3 transition-all mb-4"
                  >
                    <svg className="w-8 h-8 text-white/25 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <p className="text-white/50 text-sm font-medium">
                      {bulkEmails.length > 0 ? `${bulkEmails.length.toLocaleString()} emails loaded — click to replace` : "Upload CSV file"}
                    </p>
                    <p className="text-white/25 text-xs mt-1">Must contain an email column · up to 5,000 emails</p>
                    <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                  </div>

                  {bulkErr && (
                    <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-400 text-sm">{bulkErr}</div>
                  )}

                  {bulkEmails.length > 0 && (
                    <div className="flex items-center justify-between px-5 py-4 bg-white/4 border border-white/8 rounded-xl">
                      <div>
                        <p className="text-white text-sm font-semibold">{bulkEmails.length.toLocaleString()} emails</p>
                        <p className="text-white/40 text-xs mt-0.5">{cost} credits ({bulkEmails.length} × 0.5cr)</p>
                      </div>
                      <button
                        onClick={handleBulkVerify}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
                      >
                        Start Verification
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Running state */}
              {bulkView === "running" && (
                <div className="space-y-4">
                  <div className="px-5 py-5 bg-white/3 border border-white/8 rounded-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span className="text-white font-semibold text-sm">Verifying emails…</span>
                      </div>
                      <span className="text-white/40 text-sm tabular-nums">{fmt(processed)} / {fmt(total)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/8 overflow-hidden mb-1.5">
                      <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/20 text-xs">Processing in batches of 20</span>
                      <span className="text-white/30 text-xs tabular-nums">{pct}%</span>
                    </div>
                  </div>

                  {Object.keys(liveCounts).length > 0 && (
                    <div className="px-5 py-4 bg-white/3 border border-white/8 rounded-2xl">
                      <p className="text-white/30 text-xs font-semibold uppercase tracking-widest mb-3">Live breakdown</p>
                      <StatusBar counts={liveCounts} total={processed} />
                    </div>
                  )}
                </div>
              )}

              {/* Done state */}
              {bulkView === "done" && (
                <div className="space-y-4">
                  <div className="px-5 py-5 bg-white/3 border border-white/8 rounded-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-white font-semibold">{fmt(liveResults.length)} emails verified</p>
                        <p className="text-white/40 text-xs mt-0.5">{creditsUsed} credits used · saved to Past Jobs</p>
                      </div>
                      <button
                        onClick={() => downloadCsv(liveResults)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white/6 border border-white/10 text-white/70 text-sm font-medium rounded-xl hover:bg-white/10 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download CSV
                      </button>
                    </div>
                    <StatusBar counts={liveCounts} total={liveResults.length} />
                  </div>

                  <ResultsTable results={liveResults} page={resultPage} onPage={setResultPage} />

                  <button
                    onClick={() => { setBulkView("upload"); setBulkEmails([]); }}
                    className="w-full py-2.5 text-sm text-white/35 hover:text-white/60 border border-white/8 rounded-xl hover:border-white/14 transition-colors"
                  >
                    Verify another file
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ══ Past Jobs tab ══ */}
      {tab === "past" && (
        <div className="space-y-3">
          {jobsLoading ? (
            <div className="flex items-center justify-center py-16">
              <svg className="w-5 h-5 animate-spin text-white/30" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-white/30 text-sm">No verification jobs yet</p>
              <p className="text-white/20 text-xs mt-1">Completed bulk jobs are saved here for 90 days</p>
            </div>
          ) : (
            jobs.map(job => {
              const counts = { safe: job.safe, invalid: job.invalid, catch_all: job.catch_all, risky: job.risky, dangerous: job.dangerous, disposable: job.disposable, unknown: job.unknown };
              return (
                <div key={job.id} className="px-5 py-4 bg-white/3 border border-white/8 rounded-2xl">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="text-white text-sm font-semibold">{fmt(job.total)} emails</p>
                      <p className="text-white/30 text-xs mt-0.5">{fmtDate(job.completed_at)} · {job.credits_used} credits</p>
                    </div>
                    <button
                      onClick={() => downloadJob(job)}
                      disabled={downloading === job.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/6 border border-white/10 text-white/60 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors disabled:opacity-40"
                    >
                      {downloading === job.id ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      )}
                      {downloading === job.id ? "…" : "Download CSV"}
                    </button>
                  </div>
                  <StatusBar counts={counts} total={job.total} />
                  <p className="text-white/15 text-xs mt-2">Expires {fmtDate(job.expires_at)}</p>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
