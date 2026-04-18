"use client";
import { useState, useEffect, useRef } from "react";
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

const WARMUP_DAYS = 21;

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
  cloudflare: "Cloudflare",
  route53:    "AWS Route 53",
  godaddy:    "GoDaddy",
  namecheap:  "Namecheap",
  porkbun:    "Porkbun",
  google:     "Google Domains",
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

export default function ConnectDomainPage() {
  const router = useRouter();

  // Step 1 — Configure
  const [domain, setDomain]         = useState("");
  const [firstName, setFirstName]   = useState("");
  const [lastName, setLastName]     = useState("");
  const [selectedPrefixes, setSelectedPrefixes] = useState<string[]>([]);
  const [customPrefix, setCustomPrefix]         = useState("");
  const [prefixMode, setPrefixMode]             = useState<"generated" | "custom">("generated");

  // NS detection
  const [nsDetecting, setNsDetecting]     = useState(false);
  const [nsProvider, setNsProvider]       = useState<NsProvider | null>(null);
  const [cfInAccount, setCfInAccount]     = useState(false);
  const detectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 3 — DNS
  const [dnsRecords, setDnsRecords]         = useState<DnsRecord[]>([]);
  const [domainRecordId, setDomainRecordId] = useState("");
  const [autoConfigured, setAutoConfigured] = useState(false);
  const [inboxCount, setInboxCount]         = useState(0);

  // State
  const [step, setStep]         = useState<Step>("configure");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
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

  // ── Return from Stripe/Paystack after payment ────────────────────────────────
  useEffect(() => {
    const isConnect = searchParams.get("connect") === "1";
    const domainIds = searchParams.get("domain_ids");
    if (!isConnect || !domainIds) return;

    const recordId       = domainIds.split(",")[0];
    const useCloudflare  = searchParams.get("cf") === "1";
    setDomainRecordId(recordId);

    const wsId = getWorkspaceId() ?? "";
    setLoading(true);
    fetch(`/api/outreach/domains/${recordId}/ses-register`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-workspace-id": wsId },
      body:    JSON.stringify({ use_cloudflare: useCloudflare }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.dns_records) {
          setDnsRecords(data.dns_records);
          if (data.domain) setDomain(data.domain);
          setAutoConfigured(!!data.auto_configured);
          setStep("dns");
        } else {
          setError(data.error ?? "Failed to configure domain");
        }
      })
      .catch(() => setError("Failed to reach server"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setStep("payment");
  }

  async function handlePay() {
    setLoading(true);
    setError(null);
    const provider   = globalCurrency === "NGN" ? "paystack" : "stripe";
    const inboxCount = activePrefixes.length;
    try {
      const wsId = getWorkspaceId() ?? "";
      const res  = await fetch("/api/outreach/domains/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": wsId },
        body: JSON.stringify({
          domains:          [{ domain: domain.trim().toLowerCase(), price: 0 }],
          mailbox_prefixes: activePrefixes,
          first_name:       firstName || undefined,
          last_name:        lastName  || undefined,
          payment_provider: provider,
          connect_only:     true,
          // Pass CF flag so the post-payment page knows to auto-publish
          cf_auto:          cfInAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");

      // Append cf=1 flag to success URL if auto-configure is available.
      // The checkout route builds the success_url — we need to intercept here
      // by appending &cf=1 manually if cfInAccount is true.
      // The checkout route already appends &connect=1; we add cf=1 via the
      // response URL manipulation below if needed.
      window.location.href = data.checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  }

  const monthlyNgn = inboxPriceNgn * activePrefixes.length;

  async function handleVerify() {
    setStep("verifying");
    setVerifyMsg(null);
    setError(null);
    try {
      const wsId = getWorkspaceId() ?? "";
      const res  = await fetch("/api/outreach/domains/connect", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", "x-workspace-id": wsId },
        body: JSON.stringify({ domain_record_id: domainRecordId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (data.status === "active") {
        setInboxCount(data.inbox_count ?? 0);
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
    { label: "SPF",   records: dnsRecords.filter(r => r.type === "TXT" && r.name === "@") },
    { label: "DMARC", records: dnsRecords.filter(r => r.type === "TXT" && r.name !== "@") },
    { label: "DKIM",  records: dnsRecords.filter(r => r.type === "CNAME") },
    { label: "MX",    records: dnsRecords.filter(r => r.type === "MX") },
  ].filter(g => g.records.length > 0);

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

          {/* Domain input + NS detection */}
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
              {/* NS detection badge */}
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

            {/* Cloudflare auto-configure callout */}
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
                        ? "bg-orange-500/20 border-orange-500/40 text-orange-300"
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
                  className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-orange-500/60 transition-colors"
                />
                {activePrefixes.length > 0 && domain && (
                  <p className="text-white/30 text-xs mt-2">{activePrefixes.map(p => `${p}@${domain}`).join(", ")}</p>
                )}
              </div>
            )}
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
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {loading ? "Setting up…" : cfInAccount ? "Continue → Auto-configure DNS" : "Continue → Add DNS records"}
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
            <div className="flex justify-between items-center">
              <span className="text-white/60 text-sm">Domain</span>
              <div className="flex items-center gap-2">
                {nsProvider === "cloudflare" && cfInAccount && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/20">Auto-configure</span>
                )}
                <span className="text-white font-mono text-sm">{domain}</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/60 text-sm">Inboxes</span>
              <span className="text-white text-sm">{activePrefixes.length} × ({activePrefixes.join(", ")})</span>
            </div>
            <div className="border-t border-white/8 pt-3 flex justify-between items-center">
              <span className="text-white/60 text-sm">Monthly total</span>
              <div className="text-right">
                <span className="text-white font-bold">
                  {globalCurrency === "NGN"
                    ? `₦${monthlyNgn.toLocaleString()}/mo`
                    : `$${monthlyUsd}/mo`}
                </span>
                <p className="text-white/30 text-xs">${INBOX_PRICE_USD}/inbox × {activePrefixes.length} inbox{activePrefixes.length > 1 ? "es" : ""}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 p-4 rounded-xl bg-orange-500/8 border border-orange-500/20">
            <span className="text-orange-400 flex-shrink-0">ℹ</span>
            <p className="text-orange-300/70 text-xs">No domain registration fee — you already own the domain. This is only for the managed inbox subscription.</p>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handlePay}
              disabled={loading}
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {loading ? "Redirecting…" : `Pay ${globalCurrency === "NGN" ? `₦${monthlyNgn.toLocaleString()}` : `$${monthlyUsd}`}/mo →`}
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
              {autoConfigured ? "DNS records configured" : "Add these DNS records"}
            </h1>
            <p className="text-white/40 text-sm">
              {autoConfigured
                ? <>Records were automatically published to Cloudflare for <span className="text-white font-mono">{domain}</span>. Click Verify to confirm they&apos;re live.</>
                : <>Log into your DNS provider and add the records below for <span className="text-white font-mono">{domain}</span>. Once added, click Verify.</>
              }
            </p>
          </div>

          {/* Auto-configured success banner */}
          {autoConfigured && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-green-500/8 border border-green-500/20">
              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-green-400"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
              </div>
              <div>
                <p className="text-green-300 text-sm font-medium">Records published to Cloudflare</p>
                <p className="text-green-300/60 text-xs mt-0.5">SPF, DKIM, DMARC, and MX records were added automatically. DNS propagation usually takes 1–5 minutes.</p>
              </div>
            </div>
          )}

          {verifyMsg && (
            <div className="flex gap-3 p-4 rounded-xl bg-amber-500/8 border border-amber-500/20">
              <span className="text-amber-400 flex-shrink-0">⚠</span>
              <p className="text-amber-300/70 text-xs">{verifyMsg} DNS propagation can take 5–30 minutes.</p>
            </div>
          )}

          {/* DNS records (reference) */}
          <div className={`space-y-3 ${autoConfigured ? "opacity-70" : ""}`}>
            {autoConfigured && (
              <p className="text-white/25 text-xs">Records shown below for reference — they&apos;ve already been added.</p>
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
          </div>

          {!autoConfigured && (
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
              {autoConfigured ? "Verify DNS →" : "I've added the records → Verify"}
            </button>
            <button onClick={() => setStep("configure")} className="text-white/40 hover:text-white/70 text-sm transition-colors">Back</button>
          </div>
        </div>
      )}

      {/* ── Post-payment loading ─────────────────────────────────────────────── */}
      {loading && step === "configure" && searchParams.get("connect") === "1" && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-white font-medium">Configuring domain…</p>
          <p className="text-white/40 text-sm">Registering with SES and generating DNS records</p>
        </div>
      )}

      {/* ── Verifying ─────────────────────────────────────────────────────────── */}
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
              {inboxCount} inbox{inboxCount !== 1 ? "es" : ""} created on <span className="text-white font-mono">{domain}</span>.
              They&apos;ll warm up over the next {WARMUP_DAYS} days.
            </p>
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
