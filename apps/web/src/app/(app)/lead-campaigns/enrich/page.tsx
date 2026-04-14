"use client";
import { useState, useRef, useEffect } from "react";
import { wsGet, wsPost } from "@/lib/workspace/client";

interface LeadRow {
  email?:      string;
  first_name?: string;
  last_name?:  string;
  title?:      string;
  company?:    string;
  industry?:   string;
  website?:    string;
}

interface EnrichedRow extends LeadRow {
  personalized_line: string;
}

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

function mapHeader(h: string): keyof LeadRow | null {
  const map: Record<string, keyof LeadRow> = {
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

function downloadCsv(rows: EnrichedRow[]) {
  const headers = ["email", "first_name", "last_name", "title", "company", "industry", "website", "personalized_line"];
  const lines = [
    headers.join(","),
    ...rows.map(r => headers.map(h => {
      const v = String((r as Record<string, string | undefined>)[h] ?? "");
      return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = "enriched-leads.csv";
  a.click();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EnrichPage() {
  const fileRef                       = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt]           = useState("");
  const [leads, setLeads]             = useState<LeadRow[]>([]);
  const [results, setResults]         = useState<EnrichedRow[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [balance, setBalance]         = useState<number | null>(null);

  useEffect(() => {
    wsGet<{ balance: number }>("/api/lead-campaigns/credits")
      .then(d => setBalance(d.balance))
      .catch(() => {});
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const { headers, rows } = parseCsv(ev.target?.result as string);
      const mapped = rows.map(row => {
        const lead: LeadRow = {};
        headers.forEach(h => {
          const key = mapHeader(h);
          if (key) (lead as Record<string, string>)[key] = row[h];
        });
        return lead;
      }).filter(l => l.email);
      setLeads(mapped);
      setResults([]);
      setError(null);
    };
    reader.readAsText(file);
    // Reset input so same file can be re-uploaded
    e.target.value = "";
  }

  async function handleEnrich() {
    if (!leads.length || !prompt.trim()) return;
    setLoading(true); setError(null); setResults([]);
    try {
      const res = await wsPost<{ results: EnrichedRow[]; credits_used: number }>(
        "/api/lead-campaigns/enrich",
        { leads, prompt: prompt.trim() },
      );
      setResults(res.results);
      setBalance(b => b !== null ? b - res.credits_used : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrichment failed");
    } finally { setLoading(false); }
  }

  const cost = leads.length * 0.5;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold text-white">AI Enrichment</h1>
          <p className="text-white/40 text-sm mt-0.5">Upload leads and generate personalized AI openers · 0.5cr per lead</p>
        </div>
        {balance !== null && (
          <span className="text-amber-400 text-sm font-medium">{balance.toLocaleString()} credits</span>
        )}
      </div>

      {/* Prompt */}
      <div className="mb-5">
        <label className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2 block">
          Your Product / Offer
        </label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="e.g. We help SaaS companies reduce churn by 40% with AI-powered customer success workflows..."
          rows={3}
          className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 text-sm focus:outline-none focus:border-blue-500/60 focus:bg-white/8 transition-all resize-none"
        />
      </div>

      {/* Upload */}
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-white/10 rounded-2xl p-10 text-center cursor-pointer hover:border-white/20 hover:bg-white/3 transition-all mb-4"
      >
        <svg className="w-8 h-8 text-white/25 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-white/50 text-sm font-medium">
          {leads.length > 0 ? `${leads.length} leads loaded — click to replace` : "Upload CSV file"}
        </p>
        <p className="text-white/25 text-xs mt-1">Columns: email, first_name, last_name, title, company, industry, website · up to 5,000 leads</p>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
      </div>

      {leads.length > 0 && (
        <div className="mb-4 flex items-center justify-between px-4 py-3 bg-white/4 border border-white/8 rounded-xl">
          <div>
            <p className="text-white text-sm font-medium">{leads.length} leads ready</p>
            <p className="text-white/40 text-xs mt-0.5">Cost: {cost} credits ({leads.length} × 0.5)</p>
          </div>
          <button
            onClick={handleEnrich}
            disabled={loading || !prompt.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Enriching…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                Enrich Leads
              </>
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-400 text-sm">{error}</div>
      )}

      {results.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-white/50 text-sm">{results.length} leads enriched</p>
            <button
              onClick={() => downloadCsv(results)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/6 border border-white/10 text-white/70 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download CSV
            </button>
          </div>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="px-4 py-3 bg-white/3 border border-white/8 rounded-xl">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-white/60 text-xs font-mono">{r.email}</span>
                  {(r.first_name || r.last_name) && (
                    <span className="text-white/30 text-xs">· {[r.first_name, r.last_name].filter(Boolean).join(" ")}</span>
                  )}
                  {r.company && <span className="text-white/30 text-xs">· {r.company}</span>}
                </div>
                <p className="text-white/60 text-sm italic leading-relaxed">
                  {r.personalized_line || <span className="text-white/20 not-italic">No opener generated</span>}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
