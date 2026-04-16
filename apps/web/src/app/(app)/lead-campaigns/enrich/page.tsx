"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { wsGet, wsFetch } from "@/lib/workspace/client";
import type { EnrichBulkJob, EnrichedLead, LeadInput } from "@/types/lead-campaigns";
import InsufficientCreditsModal from "@/components/InsufficientCreditsModal";

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, "").toLowerCase());
  const rows = lines.slice(1).map(line => {
    const cells = line.split(",");
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] ?? "").trim().replace(/^["']|["']$/g, ""); });
    return obj;
  }).filter(r => Object.values(r).some(Boolean));
  return { headers, rows };
}

function mapHeader(h: string): keyof LeadInput | null {
  const map: Record<string, keyof LeadInput> = {
    email: "email", "e-mail": "email", emailaddress: "email",
    firstname: "first_name", first_name: "first_name",
    lastname: "last_name", last_name: "last_name",
    title: "title", position: "title", jobtitle: "title",
    company: "company", organization: "company", org: "company",
    industry: "industry",
    website: "website", url: "website", domain: "website",
  };
  return map[h.toLowerCase().replace(/[\s-]/g, "_")] ?? null;
}

function downloadCsv(rows: EnrichedLead[], filename = "enriched-leads.csv") {
  const headers = ["email", "first_name", "last_name", "title", "company", "industry", "website", "personalized_line"];
  const lines = [
    headers.join(","),
    ...rows.map(r => headers.map(h => {
      const v = String((r as unknown as Record<string, unknown>)[h] ?? "");
      return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename }).click();
}

function fmt(n: number)     { return n.toLocaleString(); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const PER_PAGE = 25;

function ResultsTable({ results, page, onPage }: { results: EnrichedLead[]; page: number; onPage: (p: number) => void }) {
  const pages = Math.ceil(results.length / PER_PAGE);
  const slice = results.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  return (
    <div className="space-y-2">
      {slice.map((r, i) => (
        <div key={i} className="px-4 py-3 bg-white/3 border border-white/8 rounded-xl">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-white/60 text-xs font-mono">{r.email}</span>
            {(r.first_name || r.last_name) && <span className="text-white/30 text-xs">· {[r.first_name, r.last_name].filter(Boolean).join(" ")}</span>}
            {r.company && <span className="text-white/30 text-xs">· {r.company}</span>}
            {r.title   && <span className="text-white/20 text-xs">· {r.title}</span>}
          </div>
          <p className="text-white/60 text-sm italic leading-relaxed">
            {r.personalized_line || <span className="text-white/20 not-italic">No opener generated</span>}
          </p>
        </div>
      ))}
      {pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-white/25 text-xs">{(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, results.length)} of {fmt(results.length)}</span>
          <div className="flex gap-1">
            <button onClick={() => onPage(page - 1)} disabled={page === 1} className="px-3 py-1.5 text-xs text-white/50 hover:text-white disabled:opacity-30 bg-white/5 border border-white/8 rounded-lg transition-colors">← Prev</button>
            <button onClick={() => onPage(page + 1)} disabled={page === pages} className="px-3 py-1.5 text-xs text-white/50 hover:text-white disabled:opacity-30 bg-white/5 border border-white/8 rounded-lg transition-colors">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab  = "enrich" | "past";
type View = "setup" | "running" | "done";

export default function EnrichPage() {
  const fileRef                        = useRef<HTMLInputElement>(null);
  const pollRef                        = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tab, setTab]                  = useState<Tab>("enrich");
  const [view, setView]                = useState<View>("setup");
  const [prompt, setPrompt]            = useState("");
  const [leads, setLeads]              = useState<LeadInput[]>([]);
  const [balance, setBalance]          = useState<number | null>(null);
  const [creditsModal, setCreditsModal] = useState<{ needed: number; have: number } | null>(null);
  const [error, setError]              = useState<string | null>(null);
  const [activeJob, setActiveJob]      = useState<EnrichBulkJob | null>(null);
  const [resultPage, setResultPage]    = useState(1);

  // Past jobs
  const [jobs, setJobs]                = useState<EnrichBulkJob[]>([]);
  const [jobsLoading, setJobsLoading]  = useState(false);
  const [downloading, setDownloading]  = useState<string | null>(null);

  useEffect(() => {
    wsGet<{ balance: number }>("/api/lead-campaigns/credits")
      .then(d => setBalance(d.balance)).catch(() => {});
  }, []);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try { const d = await wsGet<{ jobs: EnrichBulkJob[] }>("/api/lead-campaigns/enrich-jobs"); setJobs(d.jobs); }
    catch { /* ignore */ } finally { setJobsLoading(false); }
  }, []);

  useEffect(() => { if (tab === "past") loadJobs(); }, [tab, loadJobs]);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function startPolling(jobId: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const job = await wsGet<EnrichBulkJob>(`/api/lead-campaigns/enrich-jobs/${jobId}`);
        setActiveJob(job);
        if (job.status === "done") {
          stopPolling();
          setView("done");
          setBalance(b => b !== null ? b - job.credits_used : null);
        } else if (job.status === "failed") {
          stopPolling();
          setError(job.error ?? "Job failed");
          setView("setup");
        }
      } catch { /* ignore transient errors */ }
    }, 3_000);
  }

  useEffect(() => () => stopPolling(), []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const { headers, rows } = parseCsv(ev.target?.result as string);
      const mapped = rows.map(row => {
        const lead: LeadInput = {};
        headers.forEach(h => { const key = mapHeader(h); if (key) (lead as Record<string, string>)[key] = row[h]; });
        return lead;
      }).filter(l => l.email);
      setLeads(mapped); setError(null); setActiveJob(null); setResultPage(1);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleEnrich() {
    if (!leads.length || !prompt.trim()) return;
    if (balance !== null && balance < cost) {
      setCreditsModal({ needed: cost, have: balance });
      return;
    }
    setError(null); setActiveJob(null); setResultPage(1); setView("running");
    try {
      const res = await wsFetch("/api/lead-campaigns/enrich", {
        method: "POST", body: JSON.stringify({ leads, prompt: prompt.trim() }),
      });
      const body = await res.json() as { job_id?: string; error?: string };
      if (!res.ok) { setError(body.error ?? res.statusText); setView("setup"); return; }
      setActiveJob({ id: body.job_id!, status: "pending", total: leads.length, processed: 0, prompt: prompt.trim(), credits_used: leads.length * 0.5, error: null, results: null, completed_at: null, expires_at: null, created_at: new Date().toISOString(), workspace_id: "" });
      startPolling(body.job_id!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start job");
      setView("setup");
    }
  }

  async function downloadJob(job: EnrichBulkJob) {
    setDownloading(job.id);
    try {
      const d = await wsGet<{ results: EnrichedLead[]; completed_at: string }>(`/api/lead-campaigns/enrich-jobs/${job.id}`);
      downloadCsv(d.results ?? [], `enriched-${new Date(d.completed_at).toISOString().split("T")[0]}-${job.total}.csv`);
    } catch { /* ignore */ } finally { setDownloading(null); }
  }

  const cost = leads.length * 0.5;
  const pct  = activeJob?.total ? Math.round((activeJob.processed / activeJob.total) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">AI Enrichment</h1>
          <p className="text-white/40 text-sm mt-0.5">Generate personalized AI openers for your leads · 0.5cr per lead</p>
        </div>
        {balance !== null && <span className="text-amber-400 text-sm font-medium">{balance.toLocaleString()} credits</span>}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-white/4 border border-white/8 rounded-xl p-1 mb-6">
        {([["enrich", "Enrich"], ["past", "Past Jobs"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === key ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ══ Enrich tab ══ */}
      {tab === "enrich" && (
        <>
          {/* Setup */}
          {view === "setup" && (
            <>
              <div className="mb-5">
                <label className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2 block">Your Product / Offer</label>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="e.g. We help SaaS companies reduce churn by 40% with AI-powered customer success workflows…" rows={3} className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 text-sm focus:outline-none focus:border-orange-500/60 focus:bg-white/8 transition-all resize-none" />
              </div>

              <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-white/10 rounded-2xl p-10 text-center cursor-pointer hover:border-white/20 hover:bg-white/3 transition-all mb-4">
                <svg className="w-8 h-8 text-white/25 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                <p className="text-white/50 text-sm font-medium">{leads.length > 0 ? `${fmt(leads.length)} leads loaded — click to replace` : "Upload CSV file"}</p>
                <p className="text-white/25 text-xs mt-1">Columns: email, first_name, last_name, title, company, industry, website · up to 50,000 leads</p>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
              </div>

              {error && <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-400 text-sm">{error}</div>}

              {leads.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-white/4 border border-white/8 rounded-xl">
                  <div>
                    <p className="text-white text-sm font-semibold">{fmt(leads.length)} leads ready</p>
                    <p className="text-white/40 text-xs mt-0.5">{cost} credits · {leads.length} × 0.5cr</p>
                  </div>
                  <button onClick={handleEnrich} disabled={!prompt.trim()} className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                    Start Enrichment
                  </button>
                </div>
              )}
            </>
          )}

          {/* Running */}
          {view === "running" && activeJob && (
            <div className="space-y-4">
              <div className="px-5 py-5 bg-white/3 border border-white/8 rounded-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin text-orange-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    <span className="text-white font-semibold text-sm">
                      {activeJob.status === "pending" ? "Queued — worker starting…" : "Generating openers…"}
                    </span>
                  </div>
                  <span className="text-white/40 text-sm tabular-nums">{fmt(activeJob.processed)} / {fmt(activeJob.total)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/8 overflow-hidden mb-1.5">
                  <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between">
                  <span className="text-white/20 text-xs">Polling every 3s · results save automatically</span>
                  <span className="text-white/30 text-xs tabular-nums">{pct}%</span>
                </div>
              </div>
              <p className="text-white/20 text-xs text-center">You can leave this page — the job runs in the background</p>
            </div>
          )}

          {/* Done */}
          {view === "done" && activeJob && (
            <div className="space-y-5">
              <div className="px-5 py-4 bg-white/3 border border-white/8 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold">{fmt(activeJob.total)} leads enriched</p>
                  <p className="text-white/40 text-xs mt-0.5">{activeJob.credits_used} credits used · saved to Past Jobs</p>
                </div>
                <button onClick={() => downloadCsv(activeJob.results ?? [])} className="flex items-center gap-1.5 px-3 py-2 bg-white/6 border border-white/10 text-white/70 text-sm font-medium rounded-xl hover:bg-white/10 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download CSV
                </button>
              </div>

              {activeJob.results && <ResultsTable results={activeJob.results} page={resultPage} onPage={setResultPage} />}

              <button onClick={() => { setView("setup"); setLeads([]); setActiveJob(null); setResultPage(1); }} className="w-full py-2.5 text-sm text-white/35 hover:text-white/60 border border-white/8 rounded-xl hover:border-white/14 transition-colors">
                Enrich another file
              </button>
            </div>
          )}
        </>
      )}

      {/* ══ Past Jobs tab ══ */}
      {tab === "past" && (
        <div className="space-y-3">
          {jobsLoading ? (
            <div className="flex items-center justify-center py-16"><svg className="w-5 h-5 animate-spin text-white/30" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-white/30 text-sm">No enrichment jobs yet</p>
              <p className="text-white/20 text-xs mt-1">Completed jobs are saved here for 90 days</p>
            </div>
          ) : (
            jobs.map(job => (
              <div key={job.id} className="px-5 py-4 bg-white/3 border border-white/8 rounded-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm font-semibold">{fmt(job.total)} leads</p>
                      {(job.status === "pending" || job.status === "running") && (
                        <span className="flex items-center gap-1 text-xs text-orange-400">
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          {job.status === "pending" ? "Queued" : `${fmt(job.processed)} / ${fmt(job.total)}`}
                        </span>
                      )}
                      {job.status === "failed" && <span className="text-xs text-red-400">Failed</span>}
                    </div>
                    <p className="text-white/30 text-xs mt-0.5">{job.completed_at ? fmtDate(job.completed_at) : "Processing…"} · {job.credits_used} credits</p>
                    {job.prompt && <p className="text-white/25 text-xs mt-1.5 italic truncate">{job.prompt}</p>}
                    {job.status === "running" && (
                      <div className="mt-2 h-1.5 rounded-full bg-white/8 overflow-hidden">
                        <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${job.total ? Math.round((job.processed / job.total) * 100) : 0}%` }} />
                      </div>
                    )}
                    {job.error && <p className="text-red-400 text-xs mt-2">{job.error}</p>}
                    {job.expires_at && <p className="text-white/15 text-xs mt-1">Expires {fmtDate(job.expires_at)}</p>}
                  </div>
                  {job.status === "done" && (
                    <button onClick={() => downloadJob(job)} disabled={downloading === job.id} className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white/6 border border-white/10 text-white/60 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors disabled:opacity-40">
                      {downloading === job.id ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
                      {downloading === job.id ? "…" : "Download CSV"}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
