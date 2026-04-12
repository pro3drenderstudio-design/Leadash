"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getWorkspaceId } from "@/lib/workspace/client";
import { useCurrency } from "@/lib/currency";

type Step = "configure" | "payment" | "dns" | "verifying" | "done";

interface DnsRecord {
  type:      string;
  name:      string;
  value:     string;
  priority?: number;
}

const WARMUP_DAYS     = 21;
const INBOX_PRICE_USD = 2;
const NGN_PER_USD     = 1600;

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { copyText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
      title="Copy"
    >
      {copied
        ? <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-400"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
        : <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/></svg>
      }
    </button>
  );
}

function generateCombos(first: string, last: string): string[] {
  const f = first.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const l = last.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!f && !l) return [];
  if (f && !l) return [f, `${f}1`, `${f}2`, `${f}3`, `${f}4`].slice(0, 5);
  if (!f && l) return [l, `${l}1`, `${l}2`, `${l}3`, `${l}4`].slice(0, 5);
  return [f, `${f}.${l}`, `${f[0]}.${l}`, `${f[0]}${l}`, `${f}${l}`];
}

export default function ConnectDomainPage() {
  const router = useRouter();

  // Step 1 — Configure
  const [domain, setDomain]         = useState("");
  const [firstName, setFirstName]   = useState("");
  const [lastName, setLastName]     = useState("");
  const [selectedPrefixes, setSelectedPrefixes] = useState<string[]>([]);
  const [customPrefix, setCustomPrefix]         = useState("");
  const [prefixMode, setPrefixMode]             = useState<"generated" | "custom">("generated");
  const [useCloudflare, setUseCloudflare]       = useState(false);

  // Step 2 — DNS
  const [dnsRecords, setDnsRecords]     = useState<DnsRecord[]>([]);
  const [domainRecordId, setDomainRecordId] = useState("");

  // State
  const [step, setStep]     = useState<Step>("configure");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  const combos = generateCombos(firstName, lastName);
  const activePrefixes = prefixMode === "custom"
    ? customPrefix.split(",").map(p => p.trim().toLowerCase()).filter(Boolean).slice(0, 5)
    : selectedPrefixes;

  function togglePrefix(p: string) {
    setSelectedPrefixes(prev =>
      prev.includes(p)
        ? prev.filter(x => x !== p)
        : prev.length >= 5 ? prev : [...prev, p],
    );
  }

  async function handleConfigure() {
    if (!domain.trim() || activePrefixes.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const wsId = getWorkspaceId() ?? "";
      const res = await fetch("/api/outreach/domains/connect", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": wsId },
        body: JSON.stringify({
          domain:           domain.trim().toLowerCase(),
          mailbox_prefixes: activePrefixes,
          first_name:       firstName || undefined,
          last_name:        lastName  || undefined,
          use_cloudflare:   useCloudflare,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setDnsRecords(data.dns_records ?? []);
      setDomainRecordId(data.domain_record_id);
      setStep("dns");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setStep("verifying");
    setVerifyMsg(null);
    setError(null);
    try {
      const wsId = getWorkspaceId() ?? "";
      const res = await fetch("/api/outreach/domains/connect", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", "x-workspace-id": wsId },
        body: JSON.stringify({ domain_record_id: domainRecordId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (data.status === "active") {
        setStep("done");
      } else {
        setVerifyMsg(data.message ?? "DNS not detected yet — check back in a few minutes.");
        setStep("dns");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setStep("dns");
    }
  }

  const recordGroups = [
    { label: "SPF",  records: dnsRecords.filter(r => r.type === "TXT" && r.name === "@") },
    { label: "DMARC", records: dnsRecords.filter(r => r.type === "TXT" && r.name !== "@") },
    { label: "DKIM", records: dnsRecords.filter(r => r.type === "CNAME") },
    { label: "MX",   records: dnsRecords.filter(r => r.type === "MX") },
  ].filter(g => g.records.length > 0);

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/inboxes" className="text-white/40 hover:text-white/70 text-sm transition-colors">← Inboxes</Link>
        <span className="text-white/20">/</span>
        <Link href="/inboxes/new" className="text-white/40 hover:text-white/70 text-sm transition-colors">Add Inbox</Link>
        <span className="text-white/20">/</span>
        <span className="text-white/60 text-sm">Connect Domain</span>
      </div>

      {/* Step indicators */}
      {step !== "done" && (
        <div className="flex items-center gap-2 mb-8">
          {(["configure", "dns", "verifying"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s ? "bg-blue-600 text-white" :
                (["configure","dns","verifying"].indexOf(step) > i) ? "bg-green-600 text-white" :
                "bg-white/10 text-white/30"
              }`}>{i + 1}</div>
              <span className={`text-xs ${step === s ? "text-white" : "text-white/30"}`}>
                {s === "configure" ? "Configure" : s === "dns" ? "Add DNS records" : "Verify"}
              </span>
              {i < 2 && <span className="text-white/15 mx-1">→</span>}
            </div>
          ))}
        </div>
      )}

      {/* ── Step 1: Configure ─────────────────────────────────────────────────── */}
      {step === "configure" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold text-white mb-1">Connect your domain</h1>
            <p className="text-white/40 text-sm">Already have a domain? Connect it to Leadash and we&apos;ll configure email authentication for you.</p>
          </div>

          {/* Domain input */}
          <div>
            <label className="block text-white/50 text-xs font-medium mb-1.5">Your domain</label>
            <input
              type="text"
              value={domain}
              onChange={e => setDomain(e.target.value.toLowerCase().replace(/^https?:\/\//,""))}
              placeholder="yourdomain.com"
              className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>

          {/* Sender name → inbox prefixes */}
          <div>
            <label className="block text-white/50 text-xs font-medium mb-1.5">Sender name</label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={firstName}
                onChange={e => { setFirstName(e.target.value); setSelectedPrefixes([]); }}
                placeholder="First name"
                className="bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
              <input
                type="text"
                value={lastName}
                onChange={e => { setLastName(e.target.value); setSelectedPrefixes([]); }}
                placeholder="Last name"
                className="bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
            </div>
          </div>

          {/* Inbox prefixes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-white/50 text-xs font-medium">Inbox addresses <span className="text-white/25">(pick up to 5)</span></label>
              <div className="flex gap-3">
                <button onClick={() => setPrefixMode("generated")} className={`text-xs ${prefixMode === "generated" ? "text-white" : "text-white/30 hover:text-white/60"} transition-colors`}>Suggested</button>
                <button onClick={() => setPrefixMode("custom")} className={`text-xs ${prefixMode === "custom" ? "text-white" : "text-white/30 hover:text-white/60"} transition-colors`}>Custom</button>
              </div>
            </div>

            {prefixMode === "generated" && combos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {combos.map(p => (
                  <button
                    key={p}
                    onClick={() => togglePrefix(p)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-mono transition-all border ${
                      selectedPrefixes.includes(p)
                        ? "bg-blue-600/20 border-blue-500/40 text-blue-300"
                        : "bg-white/5 border-white/10 text-white/50 hover:border-white/20 hover:text-white/70"
                    }`}
                  >
                    {p}{domain ? `@${domain}` : ""}
                  </button>
                ))}
              </div>
            )}

            {prefixMode === "generated" && combos.length === 0 && (
              <p className="text-white/25 text-sm">Enter a sender name above to see suggestions.</p>
            )}

            {prefixMode === "custom" && (
              <div>
                <input
                  type="text"
                  value={customPrefix}
                  onChange={e => setCustomPrefix(e.target.value)}
                  placeholder="sales, hello, outreach1 (comma-separated, max 5)"
                  className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors"
                />
                {activePrefixes.length > 0 && domain && (
                  <p className="text-white/30 text-xs mt-2">{activePrefixes.map(p => `${p}@${domain}`).join(", ")}</p>
                )}
              </div>
            )}
          </div>

          {/* Cloudflare toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-white/4 border border-white/8">
            <div>
              <p className="text-white text-sm font-medium">Auto-publish DNS via Cloudflare</p>
              <p className="text-white/40 text-xs mt-0.5">If this domain&apos;s DNS is managed by Cloudflare in this account, we&apos;ll publish the records automatically.</p>
            </div>
            <button
              onClick={() => setUseCloudflare(v => !v)}
              className={`w-11 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors flex-shrink-0 ml-4 ${useCloudflare ? "bg-blue-600" : "bg-white/15"}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${useCloudflare ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Warmup notice */}
          <div className="flex gap-3 p-4 rounded-xl bg-amber-500/8 border border-amber-500/20">
            <span className="text-amber-400 flex-shrink-0 mt-0.5">⚠</span>
            <p className="text-amber-300/70 text-xs">
              Inboxes warm up for {WARMUP_DAYS} days (max 15 sends/day) before campaigns can use them.
            </p>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleConfigure}
              disabled={loading || !domain.trim() || activePrefixes.length === 0}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {loading ? "Setting up…" : `Continue → Add DNS records`}
            </button>
            <Link href="/inboxes/new" className="text-white/40 hover:text-white/70 text-sm transition-colors">Back</Link>
          </div>
        </div>
      )}

      {/* ── Step 2: DNS Records ───────────────────────────────────────────────── */}
      {step === "dns" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold text-white mb-1">Add these DNS records</h1>
            <p className="text-white/40 text-sm">
              Log into your domain registrar or DNS provider and add the records below for <span className="text-white font-mono">{domain}</span>. Once added, click Verify.
            </p>
          </div>

          {verifyMsg && (
            <div className="flex gap-3 p-4 rounded-xl bg-amber-500/8 border border-amber-500/20">
              <span className="text-amber-400 flex-shrink-0">⚠</span>
              <p className="text-amber-300/70 text-xs">{verifyMsg} DNS propagation can take 5–30 minutes.</p>
            </div>
          )}

          {recordGroups.map(group => (
            <div key={group.label} className="border border-white/8 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-white/4 border-b border-white/8 flex items-center justify-between">
                <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">{group.label}</span>
                <span className="text-white/25 text-xs">{group.records.length} record{group.records.length > 1 ? "s" : ""}</span>
              </div>
              <div className="divide-y divide-white/5">
                {group.records.map((r, i) => (
                  <div key={i} className="px-4 py-3 grid grid-cols-[80px_1fr] gap-3 text-xs">
                    <div className="space-y-1.5">
                      <div><span className="text-white/30">Type</span><p className="text-white font-mono mt-0.5">{r.type}</p></div>
                      {r.priority != null && <div><span className="text-white/30">Priority</span><p className="text-white font-mono mt-0.5">{r.priority}</p></div>}
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <div>
                        <span className="text-white/30">Name</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-white font-mono truncate">{r.name || "@"}</p>
                          <CopyButton text={r.name || "@"} />
                        </div>
                      </div>
                      <div>
                        <span className="text-white/30">Value</span>
                        <div className="flex items-start gap-2 mt-0.5">
                          <p className="text-white/80 font-mono text-[11px] break-all leading-relaxed">{r.value}</p>
                          <CopyButton text={r.value} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="p-4 rounded-xl bg-blue-500/8 border border-blue-500/20 text-xs text-blue-300/70">
            <strong className="text-blue-300">Where to add these:</strong> Log into your registrar (GoDaddy, Namecheap, Cloudflare, etc.) → DNS Management → Add each record above. TTL can be set to &quot;Auto&quot; or 1 hour.
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleVerify}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              I&apos;ve added the records → Verify
            </button>
            <button onClick={() => setStep("configure")} className="text-white/40 hover:text-white/70 text-sm transition-colors">Back</button>
          </div>
        </div>
      )}

      {/* ── Step 3: Verifying ─────────────────────────────────────────────────── */}
      {step === "verifying" && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-white font-medium">Checking DNS records…</p>
          <p className="text-white/40 text-sm">Verifying SPF, DKIM, and DMARC for {domain}</p>
        </div>
      )}

      {/* ── Done ─────────────────────────────────────────────────────────────── */}
      {step === "done" && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="#4ade80" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-white font-bold text-lg">Domain connected!</p>
            <p className="text-white/50 text-sm mt-1">
              {activePrefixes.length} inbox{activePrefixes.length > 1 ? "es" : ""} created on <span className="text-white font-mono">{domain}</span>.
              They&apos;ll warm up over the next {WARMUP_DAYS} days.
            </p>
          </div>
          <button
            onClick={() => router.push("/inboxes")}
            className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            View inboxes
          </button>
        </div>
      )}
    </div>
  );
}
