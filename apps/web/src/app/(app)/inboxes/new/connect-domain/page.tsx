"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getWorkspaceId } from "@/lib/workspace/client";
import { useCurrency } from "@/lib/currency";
import type { NsProvider } from "@/app/api/outreach/domains/detect-ns/route";

type Step = "configure" | "payment" | "dns" | "verifying" | "done";

interface DnsRecord {
  type:      string;
  name:      string;
  value:     string;
  priority?: number;
}

interface DomainSetup {
  recordId:       string;
  domain:         string;
  records:        DnsRecord[];
  autoConfigured: boolean;
}

const WARMUP_DAYS            = 21;
const WARMUP_SENDS_PER_INBOX = 15;
const FULL_SENDS_PER_INBOX   = 30;

function domainCapacity(inboxes: number) {
  return {
    warmupDay: inboxes * WARMUP_SENDS_PER_INBOX,
    fullDay:   inboxes * FULL_SENDS_PER_INBOX,
    fullMonth: inboxes * FULL_SENDS_PER_INBOX * 30,
  };
}

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

const NS_LABELS: Partial<Record<NsProvider, string>> = {
  cloudflare:  "Cloudflare",
  route53:     "AWS Route 53",
  godaddy:     "GoDaddy",
  namecheap:   "Namecheap",
  porkbun:     "Porkbun",
  google:      "Google Domains",
  squarespace: "Squarespace",
};

function generateCombos(first: string, last: string): string[] {
  const f = first.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const l = last.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!f && !l) return [];
  if (f && !l) return [f, `${f}1`, `${f}2`, `${f}3`, `${f}4`].slice(0, 5);
  if (!f && l) return [l, `${l}1`, `${l}2`, `${l}3`, `${l}4`].slice(0, 5);
  return [f, `${f}.${l}`, `${f[0]}.${l}`, `${f[0]}${l}`, `${f}${l}`];
}

function parseBulkDomains(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map(s => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter(s => s.includes(".") && s.length > 3 && /^[a-z0-9.-]+$/.test(s));
}

export default function ConnectDomainPage() {
  const router = useRouter();

  // ── Configure step ──────────────────────────────────────────────────────────
  const [configMode, setConfigMode]   = useState<"single" | "bulk">("single");
  const [domain, setDomain]           = useState("");
  const [bulkInput, setBulkInput]     = useState("");
  const [firstName, setFirstName]     = useState("");
  const [lastName, setLastName]       = useState("");
  const [selectedPrefixes, setSelectedPrefixes] = useState<string[]>([]);
  const [customPrefix, setCustomPrefix]         = useState("");
  const [prefixMode, setPrefixMode]             = useState<"generated" | "custom">("generated");

  // NS detection (single mode only)
  const [nsDetecting, setNsDetecting]   = useState(false);
  const [nsProvider, setNsProvider]     = useState<NsProvider | null>(null);
  const [cfInAccount, setCfInAccount]   = useState(false);
  const detectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── DNS / multi-domain setup state ──────────────────────────────────────────
  const [domainSetups, setDomainSetups] = useState<DomainSetup[]>([]);
  const [inboxCount, setInboxCount]     = useState(0);

  // ── General ─────────────────────────────────────────────────────────────────
  const [step, setStep]           = useState<Step>("configure");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  const { currency: globalCurrency } = useCurrency();
  const searchParams = useSearchParams();
  const [inboxPriceNgn, setInboxPriceNgn] = useState(2500);

  useEffect(() => {
    const wsId = getWorkspaceId() ?? "";
    fetch("/api/outreach/pricing", { headers: { "x-workspace-id": wsId } })
      .then(r => r.ok ? r.json() : null)
      .then((data: { inbox_monthly_price_ngn: number; ngn_per_usd: number } | null) => {
        if (data) setInboxPriceNgn(data.inbox_monthly_price_ngn);
      })
      .catch(() => {});
  }, []);

  // ── NS auto-detection ────────────────────────────────────────────────────────
  function triggerNsDetect(val: string) {
    if (detectTimer.current) clearTimeout(detectTimer.current);
    setNsProvider(null);
    setCfInAccount(false);
    if (!val.trim() || !val.includes(".")) return;
    detectTimer.current = setTimeout(async () => {
      setNsDetecting(true);
      try {
        const wsId = getWorkspaceId() ?? "";
        const res  = await fetch(`/api/outreach/domains/detect-ns?domain=${encodeURIComponent(val.trim())}`, {
          headers: { "x-workspace-id": wsId },
        });
        if (res.ok) {
          const data = await res.json() as { provider: NsProvider; isCloudflare: boolean; inOurAccount: boolean };
          setNsProvider(data.provider);
          setCfInAccount(data.inOurAccount);
        }
      } catch { /* non-fatal */ }
      finally { setNsDetecting(false); }
    }, 600);
  }

  // ── Return from payment — register SES for EVERY domain_id ──────────────────
  useEffect(() => {
    const isConnect = searchParams.get("connect") === "1";
    const domainIds = searchParams.get("domain_ids");
    if (!isConnect || !domainIds) return;

    const ids           = domainIds.split(",").filter(Boolean);
    const useCloudflare = searchParams.get("cf") === "1";
    const wsId          = getWorkspaceId() ?? "";

    setLoading(true);
    setError(null);

    Promise.all(
      ids.map(recordId =>
        fetch(`/api/outreach/domains/${recordId}/ses-register`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", "x-workspace-id": wsId },
          body:    JSON.stringify({ use_cloudflare: useCloudflare }),
        })
          .then(r => r.json())
          .then(data => data.dns_records
            ? ({ recordId, domain: data.domain ?? "", records: data.dns_records as DnsRecord[], autoConfigured: !!data.auto_configured } satisfies DomainSetup)
            : null,
          )
          .catch(() => null),
      ),
    ).then(results => {
      const setups = results.filter((s): s is DomainSetup => s !== null);
      if (setups.length > 0) {
        setDomainSetups(setups);
        setStep("dns");
      } else {
        setError("Failed to configure domains — please try again.");
      }
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const combos        = generateCombos(firstName, lastName);
  const activePrefixes = prefixMode === "custom"
    ? customPrefix.split(",").map(p => p.trim().toLowerCase()).filter(Boolean).slice(0, 5)
    : selectedPrefixes;

  const bulkDomains = useMemo(() => parseBulkDomains(bulkInput), [bulkInput]);

  // Domains being submitted (array for both modes)
  const domainsForCheckout = configMode === "bulk"
    ? bulkDomains.map(d => ({ domain: d, price: 0 }))
    : [{ domain: domain.trim().toLowerCase(), price: 0 }];

  const totalInboxes   = activePrefixes.length * domainsForCheckout.length;
  const monthlyNgn     = inboxPriceNgn * totalInboxes;
  const canConfigure   = activePrefixes.length > 0 &&
    (configMode === "single" ? !!domain.trim() : bulkDomains.length > 0);

  function togglePrefix(p: string) {
    setSelectedPrefixes(prev =>
      prev.includes(p)
        ? prev.filter(x => x !== p)
        : prev.length >= 5 ? prev : [...prev, p],
    );
  }

  async function handlePay() {
    setLoading(true);
    setError(null);
    const provider = globalCurrency === "NGN" ? "paystack" : "stripe";
    try {
      const wsId = getWorkspaceId() ?? "";
      const res  = await fetch("/api/outreach/domains/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": wsId },
        body: JSON.stringify({
          domains:          domainsForCheckout,
          mailbox_prefixes: activePrefixes,
          first_name:       firstName || undefined,
          last_name:        lastName  || undefined,
          payment_provider: provider,
          connect_only:     true,
          cf_auto:          configMode === "single" && cfInAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      window.location.href = data.checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setStep("verifying");
    setVerifyMsg(null);
    setError(null);
    try {
      const wsId    = getWorkspaceId() ?? "";
      const results = await Promise.all(
        domainSetups.map(setup =>
          fetch("/api/outreach/domains/connect", {
            method:  "PATCH",
            headers: { "Content-Type": "application/json", "x-workspace-id": wsId },
            body: JSON.stringify({ domain_record_id: setup.recordId }),
          })
            .then(r => r.json())
            .then(data => ({ setup, status: data.status as string, inbox_count: (data.inbox_count ?? 0) as number }))
            .catch(() => ({ setup, status: "error", inbox_count: 0 })),
        ),
      );

      const allActive = results.every(r => r.status === "active");
      if (allActive) {
        setInboxCount(results.reduce((s, r) => s + r.inbox_count, 0));
        setStep("done");
      } else {
        const pending = results.filter(r => r.status !== "active").length;
        setVerifyMsg(
          `${pending} domain${pending !== 1 ? "s" : ""} not verified yet — DNS may still be propagating (5–30 min).`,
        );
        setStep("dns");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setStep("dns");
    }
  }

  // Group DNS records by type for a single domain
  function groupRecords(records: DnsRecord[]) {
    return [
      { label: "SPF",   records: records.filter(r => r.type === "TXT" && r.name === "@") },
      { label: "DMARC", records: records.filter(r => r.type === "TXT" && r.name !== "@") },
      { label: "DKIM",  records: records.filter(r => r.type === "CNAME") },
      { label: "MX",    records: records.filter(r => r.type === "MX") },
    ].filter(g => g.records.length > 0);
  }

  // ─────────────────────────────────────────────────────────────────────────────

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
          {(["configure", "payment", "dns", "verifying"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s ? "bg-orange-500 text-white" :
                (["configure","payment","dns","verifying"].indexOf(step) > i) ? "bg-green-600 text-white" :
                "bg-white/10 text-white/30"
              }`}>{i + 1}</div>
              <span className={`text-xs ${step === s ? "text-white" : "text-white/30"}`}>
                {s === "configure" ? "Configure" : s === "payment" ? "Subscribe" : s === "dns" ? "DNS records" : "Verify"}
              </span>
              {i < 3 && <span className="text-white/15 mx-1">→</span>}
            </div>
          ))}
        </div>
      )}

      {/* ── Step 1: Configure ─────────────────────────────────────────────────── */}
      {step === "configure" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold text-white mb-1">Connect your domain</h1>
            <p className="text-white/40 text-sm">Already have a domain? Connect it and we&apos;ll configure email authentication for you.</p>
          </div>

          {/* Single / Bulk mode toggle */}
          <div className="flex gap-1 p-1 bg-white/5 border border-white/8 rounded-xl w-fit">
            {(["single", "bulk"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setConfigMode(mode)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                  configMode === mode
                    ? "bg-white/12 text-white"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {mode === "single" ? "Single domain" : "Bulk (multiple)"}
              </button>
            ))}
          </div>

          {/* ── Single mode ── */}
          {configMode === "single" && (
            <div>
              <label className="block text-white/50 text-xs font-medium mb-1.5">Your domain</label>
              <div className="relative">
                <input
                  type="text"
                  value={domain}
                  onChange={e => {
                    const val = e.target.value.toLowerCase().replace(/^https?:\/\//, "");
                    setDomain(val);
                    triggerNsDetect(val);
                  }}
                  placeholder="yourdomain.com"
                  className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-orange-500/60 transition-colors pr-32"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {nsDetecting && (
                    <span className="flex items-center gap-1.5 text-xs text-white/30">
                      <span className="w-3 h-3 rounded-full border border-white/20 border-t-white/60 animate-spin" />
                      Detecting…
                    </span>
                  )}
                  {!nsDetecting && nsProvider && nsProvider !== "unknown" && (
                    <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                      nsProvider === "cloudflare"
                        ? cfInAccount
                          ? "bg-orange-500/15 text-orange-300 border border-orange-500/25"
                          : "bg-orange-500/10 text-orange-400/80 border border-orange-500/15"
                        : "bg-white/8 text-white/40 border border-white/10"
                    }`}>
                      {nsProvider === "cloudflare" && (
                        <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current" aria-hidden="true">
                          <path d="M16.656 13.008c-.147 0-.286.034-.422.067l-.236.067-.126-.217c-.62-1.066-1.774-1.73-3.038-1.73a3.467 3.467 0 00-3.09 1.897l-.108.217-.245-.034a2.285 2.285 0 00-.352-.026c-1.232 0-2.233.998-2.233 2.226 0 1.23 1 2.228 2.233 2.228h7.617c1.047 0 1.903-.852 1.903-1.893 0-1.04-.856-1.802-1.903-1.802z"/>
                          <path d="M16.656 12.025c-.033 0-.065.003-.098.004a4.72 4.72 0 00-4.338-2.862 4.72 4.72 0 00-4.37 2.924 3.208 3.208 0 00-.505-.04C5.535 12.05 4 13.58 4 15.478c0 1.897 1.535 3.44 3.345 3.44h9.311c1.62 0 2.844-1.236 2.844-2.853 0-1.617-1.224-3.04-2.844-3.04z"/>
                        </svg>
                      )}
                      {NS_LABELS[nsProvider] ?? nsProvider}
                      {nsProvider === "cloudflare" && cfInAccount && (
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-green-400"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {nsProvider === "cloudflare" && (
                <div className={`mt-2.5 flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border text-xs ${
                  cfInAccount
                    ? "bg-orange-500/8 border-orange-500/20 text-orange-300/80"
                    : "bg-white/4 border-white/10 text-white/40"
                }`}>
                  <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 flex-shrink-0 mt-0.5 ${cfInAccount ? "text-orange-400" : "text-white/30"}`}>
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd"/>
                  </svg>
                  {cfInAccount
                    ? "This domain's DNS is managed in your Cloudflare account — we'll add the email records automatically after setup."
                    : "This domain uses Cloudflare nameservers but isn't in this account's zones. You can still add the DNS records manually below."}
                </div>
              )}
            </div>
          )}

          {/* ── Bulk mode ── */}
          {configMode === "bulk" && (
            <div>
              <label className="block text-white/50 text-xs font-medium mb-1.5">
                Your domains <span className="text-white/25 font-normal">(one per line or comma-separated)</span>
              </label>
              <textarea
                value={bulkInput}
                onChange={e => setBulkInput(e.target.value)}
                rows={6}
                placeholder={"yourdomain.com\nanotherdomain.io\nthirddomain.co"}
                className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-orange-500/60 transition-colors font-mono resize-y"
              />
              {bulkDomains.length > 0 && (
                <p className="text-white/40 text-xs mt-1.5">
                  <span className="text-white/70 font-medium">{bulkDomains.length}</span> valid domain{bulkDomains.length !== 1 ? "s" : ""} detected
                </p>
              )}
            </div>
          )}

          {/* Sender name → inbox prefixes */}
          <div>
            <label className="block text-white/50 text-xs font-medium mb-1.5">Sender name</label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={firstName}
                onChange={e => { setFirstName(e.target.value); setSelectedPrefixes([]); }}
                placeholder="First name"
                className="bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-orange-500/60 transition-colors"
              />
              <input
                type="text"
                value={lastName}
                onChange={e => { setLastName(e.target.value); setSelectedPrefixes([]); }}
                placeholder="Last name"
                className="bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-orange-500/60 transition-colors"
              />
            </div>
          </div>

          {/* Inbox prefixes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-white/50 text-xs font-medium">
                Inbox addresses <span className="text-white/25">(pick up to 5{configMode === "bulk" && bulkDomains.length > 1 ? ` — applied to all ${bulkDomains.length} domains` : ""})</span>
              </label>
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
                        ? "bg-orange-500/20 border-orange-500/40 text-orange-300"
                        : "bg-white/5 border-white/10 text-white/50 hover:border-white/20 hover:text-white/70"
                    }`}
                  >
                    {p}{configMode === "single" && domain ? `@${domain}` : ""}
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
                  className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-orange-500/60 transition-colors"
                />
                {activePrefixes.length > 0 && configMode === "single" && domain && (
                  <p className="text-white/30 text-xs mt-2">{activePrefixes.map(p => `${p}@${domain}`).join(", ")}</p>
                )}
              </div>
            )}
          </div>

          {/* Sending capacity stats */}
          {activePrefixes.length > 0 && domainsForCheckout.length > 0 && (() => {
            const cap = domainCapacity(totalInboxes);
            return (
              <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-white/8">
                  {[
                    { label: "Total inboxes",    value: String(totalInboxes),              sub: `${domainsForCheckout.length} domain${domainsForCheckout.length !== 1 ? "s" : ""} × ${activePrefixes.length}` },
                    { label: "Warmup sends/day", value: cap.warmupDay.toLocaleString(),    sub: "first 21 days" },
                    { label: "Full sends/day",   value: cap.fullDay.toLocaleString(),      sub: "after warmup" },
                  ].map(({ label, value, sub }) => (
                    <div key={label} className="p-3 text-center">
                      <p className="text-white font-bold text-xl">{value}</p>
                      <p className="text-white/40 text-xs mt-0.5">{label}</p>
                      <p className="text-white/25 text-[11px]">{sub}</p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-white/8 px-4 py-2 text-center">
                  <p className="text-white/40 text-xs">
                    <span className="text-white/70 font-medium">{cap.fullMonth.toLocaleString()}</span> sends/month at full capacity
                  </p>
                </div>
              </div>
            );
          })()}

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
              onClick={() => setStep("payment")}
              disabled={loading || !canConfigure}
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {configMode === "single"
                ? (cfInAccount ? "Continue → Auto-configure DNS" : "Continue → Add DNS records")
                : `Continue → Subscribe for ${domainsForCheckout.length} domain${domainsForCheckout.length !== 1 ? "s" : ""}`}
            </button>
            <Link href="/inboxes/new" className="text-white/40 hover:text-white/70 text-sm transition-colors">Back</Link>
          </div>
        </div>
      )}

      {/* ── Step 2: Payment ──────────────────────────────────────────────────── */}
      {step === "payment" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold text-white mb-1">Inbox subscription</h1>
            <p className="text-white/40 text-sm">
              Your inboxes run on our managed sending infrastructure (SES). A monthly subscription covers hosting, warmup, and deliverability monitoring.
            </p>
          </div>

          <div className="border border-white/8 rounded-xl p-5 space-y-3">
            {/* Domain list */}
            <div className="flex justify-between items-start">
              <span className="text-white/60 text-sm">Domain{domainsForCheckout.length !== 1 ? "s" : ""}</span>
              <div className="text-right space-y-0.5">
                {domainsForCheckout.length <= 4
                  ? domainsForCheckout.map(d => (
                      <div key={d.domain} className="flex items-center gap-2 justify-end">
                        {configMode === "single" && nsProvider === "cloudflare" && cfInAccount && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/20">Auto-configure</span>
                        )}
                        <span className="text-white font-mono text-sm">{d.domain}</span>
                      </div>
                    ))
                  : (
                    <>
                      {domainsForCheckout.slice(0, 3).map(d => (
                        <p key={d.domain} className="text-white font-mono text-sm">{d.domain}</p>
                      ))}
                      <p className="text-white/40 text-xs">+{domainsForCheckout.length - 3} more</p>
                    </>
                  )}
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-white/60 text-sm">Inboxes per domain</span>
              <span className="text-white text-sm">{activePrefixes.length} × ({activePrefixes.join(", ")})</span>
            </div>
            {domainsForCheckout.length > 1 && (
              <div className="flex justify-between items-center">
                <span className="text-white/60 text-sm">Total inboxes</span>
                <span className="text-white text-sm">{totalInboxes}</span>
              </div>
            )}
            <div className="border-t border-white/8 pt-3 flex justify-between items-center">
              <span className="text-white/60 text-sm">Monthly total</span>
              <div className="text-right">
                <span className="text-white font-bold">₦{monthlyNgn.toLocaleString()}/mo</span>
                <p className="text-white/30 text-xs">₦{inboxPriceNgn.toLocaleString()}/inbox × {totalInboxes} inbox{totalInboxes !== 1 ? "es" : ""}</p>
              </div>
            </div>
            {(() => {
              const cap = domainCapacity(totalInboxes);
              return (
                <div className="border-t border-white/8 pt-3 grid grid-cols-4 gap-2 text-center">
                  {[
                    ["Inboxes",    totalInboxes.toString()],
                    ["Warmup/day", cap.warmupDay.toLocaleString()],
                    ["Full/day",   cap.fullDay.toLocaleString()],
                    ["Full/month", cap.fullMonth.toLocaleString()],
                  ].map(([l, v]) => (
                    <div key={l}><p className="text-white font-semibold text-sm">{v}</p><p className="text-white/30 text-xs">{l}</p></div>
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="flex gap-3 p-4 rounded-xl bg-orange-500/8 border border-orange-500/20">
            <span className="text-orange-400 flex-shrink-0">ℹ</span>
            <p className="text-orange-300/70 text-xs">No domain registration fee — you already own the domain{domainsForCheckout.length !== 1 ? "s" : ""}. This is only for the managed inbox subscription.</p>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handlePay}
              disabled={loading}
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {loading ? "Redirecting…" : `Pay ₦${monthlyNgn.toLocaleString()}/mo →`}
            </button>
            <button onClick={() => setStep("configure")} className="text-white/40 hover:text-white/70 text-sm transition-colors">Back</button>
          </div>
        </div>
      )}

      {/* ── Step 3: DNS Records ───────────────────────────────────────────────── */}
      {step === "dns" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold text-white mb-1">
              {domainSetups.every(s => s.autoConfigured) ? "DNS records configured" : "Add these DNS records"}
            </h1>
            <p className="text-white/40 text-sm">
              {domainSetups.every(s => s.autoConfigured)
                ? "Records were automatically published to Cloudflare for all domains. Click Verify to confirm they're live."
                : domainSetups.length > 1
                  ? `Add the records below for each of your ${domainSetups.length} domains. Once added, click Verify.`
                  : <>Log into your DNS provider and add the records below for <span className="text-white font-mono">{domainSetups[0]?.domain}</span>. Once added, click Verify.</>
              }
            </p>
          </div>

          {verifyMsg && (
            <div className="flex gap-3 p-4 rounded-xl bg-amber-500/8 border border-amber-500/20">
              <span className="text-amber-400 flex-shrink-0">⚠</span>
              <p className="text-amber-300/70 text-xs">{verifyMsg}</p>
            </div>
          )}

          {/* Per-domain DNS records */}
          <div className="space-y-6">
            {domainSetups.map(setup => {
              const groups = groupRecords(setup.records);
              return (
                <div key={setup.recordId}>
                  {/* Domain header (only shown when multiple) */}
                  {domainSetups.length > 1 && (
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-white font-mono text-sm font-semibold">{setup.domain}</span>
                      {setup.autoConfigured && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                          Auto-configured
                        </span>
                      )}
                    </div>
                  )}

                  {setup.autoConfigured && domainSetups.length === 1 && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-green-500/8 border border-green-500/20 mb-3">
                      <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-green-400"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                      </div>
                      <div>
                        <p className="text-green-300 text-sm font-medium">Records published to Cloudflare</p>
                        <p className="text-green-300/60 text-xs mt-0.5">SPF, DKIM, DMARC, and MX records were added automatically. DNS propagation usually takes 1–5 minutes.</p>
                      </div>
                    </div>
                  )}

                  <div className={`space-y-3 ${setup.autoConfigured ? "opacity-70" : ""}`}>
                    {setup.autoConfigured && (
                      <p className="text-white/25 text-xs">Records shown below for reference — they&apos;ve already been added.</p>
                    )}
                    {groups.map(group => (
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
                  </div>
                </div>
              );
            })}
          </div>

          {!domainSetups.every(s => s.autoConfigured) && (
            <div className="p-4 rounded-xl bg-orange-500/8 border border-orange-500/20 text-xs text-orange-300/70">
              <strong className="text-orange-300">Where to add these:</strong> Log into your registrar (GoDaddy, Namecheap, Cloudflare, etc.) → DNS Management → Add each record above. TTL can be set to &quot;Auto&quot; or 1 hour.
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleVerify}
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {domainSetups.every(s => s.autoConfigured)
                ? "Verify DNS →"
                : domainSetups.length > 1
                  ? `I've added all records → Verify ${domainSetups.length} domains`
                  : "I've added the records → Verify"}
            </button>
            <button onClick={() => setStep("configure")} className="text-white/40 hover:text-white/70 text-sm transition-colors">Back</button>
          </div>
        </div>
      )}

      {/* ── Post-payment loading ─────────────────────────────────────────────── */}
      {loading && step === "configure" && searchParams.get("connect") === "1" && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-white font-medium">Configuring domain{domainSetups.length !== 1 ? "s" : ""}…</p>
          <p className="text-white/40 text-sm">Registering with SES and generating DNS records</p>
        </div>
      )}

      {/* ── Verifying ─────────────────────────────────────────────────────────── */}
      {step === "verifying" && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-white font-medium">Checking DNS records…</p>
          <p className="text-white/40 text-sm">
            {domainSetups.length > 1
              ? `Verifying SPF, DKIM, and DMARC for ${domainSetups.length} domains`
              : `Verifying SPF, DKIM, and DMARC for ${domainSetups[0]?.domain ?? "your domain"}`}
          </p>
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
            <p className="text-white font-bold text-lg">
              {domainSetups.length > 1 ? `${domainSetups.length} domains connected!` : "Domain connected!"}
            </p>
            <p className="text-white/50 text-sm mt-1">
              {inboxCount} inbox{inboxCount !== 1 ? "es" : ""} created across{" "}
              {domainSetups.length > 1
                ? `${domainSetups.length} domains`
                : <span className="text-white font-mono">{domainSetups[0]?.domain}</span>
              }.{" "}
              They&apos;ll warm up over the next {WARMUP_DAYS} days.
            </p>
            {domainSetups.length > 1 && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {domainSetups.map(s => (
                  <span key={s.recordId} className="text-xs font-mono text-white/50 bg-white/6 px-2 py-0.5 rounded">{s.domain}</span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => router.push("/inboxes")}
            className="mt-4 px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            View inboxes
          </button>
        </div>
      )}
    </div>
  );
}
