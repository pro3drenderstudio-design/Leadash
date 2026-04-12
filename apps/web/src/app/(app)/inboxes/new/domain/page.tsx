"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getWorkspaceId } from "@/lib/workspace/client";
import { useCurrency } from "@/lib/currency";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegistrantStatus {
  complete: boolean;
}

interface DomainResult {
  domain: string;
  available: boolean;
  price: number;
}

type Step = "search" | "configure" | "review" | "provisioning";

type PaymentProvider = "stripe" | "paystack";

// ─── Constants ────────────────────────────────────────────────────────────────

const TLDS = [".com", ".io", ".co", ".net", ".org", ".ai", ".app", ".dev", ".info", ".biz", ".us", ".pro"];
const INBOX_PRICE_USD = 2;
const DOMAIN_SERVICE_FEE_USD = 1;
const NGN_PER_USD = 1600;

// Sending limits
const MAX_INBOXES_PER_DOMAIN = 5;
const WARMUP_SENDS_PER_INBOX = 15;  // during 21-day warmup
const FULL_SENDS_PER_INBOX   = 30;  // post-warmup (conservative for deliverability)

function domainCapacity(domains: number, inboxes: number) {
  return {
    warmupDay:  domains * inboxes * WARMUP_SENDS_PER_INBOX,
    fullDay:    domains * inboxes * FULL_SENDS_PER_INBOX,
    fullMonth:  domains * inboxes * FULL_SENDS_PER_INBOX * 30,
  };
}

const PROVISION_STEPS = [
  "Payment confirmed",
  "Registering domain",
  "Configuring mail server",
  "Publishing DNS records",
  "Verifying domain",
  "Creating inboxes",
];

const STATUS_TO_STEP: Record<string, number> = {
  pending:     0,
  purchasing:  1,
  dns_pending: 2,
  verifying:   4,
  active:      6,
  failed:      -1,
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BuyDomainPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // Detect post-Stripe/Paystack redirect (multi-domain: domain_ids is comma-separated)
  const returnedDomainIds  = searchParams.get("domain_ids");
  const returnedSessionId  = searchParams.get("session_id");
  // Paystack appends ?reference=xxx&trxref=xxx to callback URL
  const returnedRef        = searchParams.get("reference") || searchParams.get("trxref");
  const returnedIdList     = returnedDomainIds ? returnedDomainIds.split(",").filter(Boolean) : [];

  const [step, setStep]   = useState<Step>(returnedIdList.length > 0 ? "provisioning" : "search");

  // ── Registrant check ────────────────────────────────────────────────────────
  const [registrantComplete, setRegistrantComplete] = useState<boolean | null>(null);

  useEffect(() => {
    if (step === "provisioning") return; // don't block post-payment
    const wsId = getWorkspaceId() ?? "";
    fetch("/api/outreach/settings", { headers: { "x-workspace-id": wsId } })
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        const complete = !!(data.registrant_first_name && data.registrant_email && data.registrant_address);
        setRegistrantComplete(complete);
      })
      .catch(() => setRegistrantComplete(true)); // don't block on error
  }, [step]);

  // ── Step 1: Search ──────────────────────────────────────────────────────────
  const [sld, setSld]                     = useState("");
  const [selectedTlds, setSelectedTlds]   = useState<string[]>([".com"]);
  const [checking, setChecking]           = useState(false);
  const [results, setResults]             = useState<DomainResult[]>([]);
  const [searchError, setSearchError]     = useState<string | null>(null);
  const [selectedDomains, setSelectedDomains] = useState<DomainResult[]>([]);

  function toggleDomain(r: DomainResult) {
    setSelectedDomains(prev =>
      prev.some(d => d.domain === r.domain)
        ? prev.filter(d => d.domain !== r.domain)
        : [...prev, r],
    );
  }

  // ── Step 2: Configure ───────────────────────────────────────────────────────
  const [firstName, setFirstName]         = useState("");
  const [lastName, setLastName]           = useState("");
  const [selectedPrefixes, setSelectedPrefixes] = useState<string[]>([]);
  const [customPrefix, setCustomPrefix]   = useState("");
  const [prefixMode, setPrefixMode]       = useState<"generated" | "custom">("generated");

  // Generate inbox local-parts from first/last name
  function generateCombos(first: string, last: string): string[] {
    const f = first.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const l = last.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!f && !l) return [];
    if (f && !l) return [f, `${f}1`, `${f}2`, `${f}3`, `${f}4`].slice(0, 5);
    if (!f && l) return [l, `${l}1`, `${l}2`, `${l}3`, `${l}4`].slice(0, 5);
    return [
      f,
      `${f}.${l}`,
      `${f[0]}.${l}`,
      `${f[0]}${l}`,
      `${f}${l}`,
    ];
  }

  const combos = generateCombos(firstName, lastName);

  // ── Step 3: Review ──────────────────────────────────────────────────────────
  const { currency: globalCurrency }      = useCurrency();
  const currency: PaymentProvider         = globalCurrency === "NGN" ? "paystack" : "stripe";
  const [paying, setPaying]               = useState(false);
  const [payError, setPayError]           = useState<string | null>(null);

  // ── Step 4: Provisioning ────────────────────────────────────────────────────
  // Track per-domain provision status: { [id]: status }
  const [domainIds, setDomainIds]             = useState<string[]>(returnedIdList);
  const [provisionStatuses, setProvisionStatuses] = useState<Record<string, string>>({});
  const [provisionErrors, setProvisionErrors]     = useState<Record<string, string>>({});
  const [provisioning, setProvisioning]           = useState(false);

  // Derived: overall status = active when ALL domains active, failed if any failed
  const allActive  = domainIds.length > 0 && domainIds.every(id => provisionStatuses[id] === "active");
  const anyFailed  = domainIds.some(id => provisionStatuses[id] === "failed");
  const overallStatus = allActive ? "active" : anyFailed ? "failed" : "pending";
  // For progress steps: use the "least advanced" domain
  const minStep = domainIds.length === 0 ? 0
    : Math.min(...domainIds.map(id => STATUS_TO_STEP[provisionStatuses[id] ?? "pending"] ?? 0));

  // ── Domain search ───────────────────────────────────────────────────────────
  async function handleSearch() {
    if (!sld.trim() || !selectedTlds.length) return;
    const names = selectedTlds.map(t => `${sld.trim().toLowerCase()}${t}`);
    setChecking(true);
    setSearchError(null);
    try {
      const wsId = getWorkspaceId() ?? "";
      const res = await fetch(
        `/api/outreach/domains/check?domains=${names.join(",")}`,
        { headers: { "x-workspace-id": wsId } },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to check domains");
      setResults(data);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Domain check failed");
    } finally {
      setChecking(false);
    }
  }

  // ── Checkout ─────────────────────────────────────────────────────────────────
  async function handleCheckout() {
    const prefixes = prefixMode === "custom"
      ? customPrefix.split(",").map(p => p.trim().toLowerCase()).filter(Boolean).slice(0, 5)
      : selectedPrefixes;
    if (!selectedDomains.length || !prefixes.length) return;
    setPaying(true);
    setPayError(null);
    try {
      const wsId = getWorkspaceId() ?? "";
      const res = await fetch("/api/outreach/domains/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": wsId },
        body: JSON.stringify({
          domains:          selectedDomains.map(d => ({ domain: d.domain, price: d.price })),
          mailbox_prefixes: prefixes,
          first_name:       firstName || undefined,
          last_name:        lastName  || undefined,
          payment_provider: currency,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      window.location.href = data.checkout_url;
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setPaying(false);
    }
  }

  // ── Provision (called after payment redirect) ─────────────────────────────
  const startProvision = useCallback(async (ids: string[], sessionId?: string | null, ref?: string | null) => {
    if (provisioning || !ids.length) return;
    setProvisioning(true);
    const wsId = getWorkspaceId() ?? "";
    // Fire provision for each domain in parallel (fire-and-forget)
    await Promise.all(ids.map(dId =>
      fetch("/api/outreach/domains/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": wsId },
        body: JSON.stringify({
          domain_record_id:   dId,
          stripe_session_id:  sessionId ?? undefined,
          paystack_reference: ref ?? undefined,
        }),
      }).catch(() => {}),
    ));
  }, [provisioning]);

  // Kick off provision on mount when returning from payment
  useEffect(() => {
    if (returnedIdList.length && !provisioning) {
      startProvision(returnedIdList, returnedSessionId, returnedRef);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Poll provision status for all domains ────────────────────────────────
  useEffect(() => {
    if (step !== "provisioning" || !domainIds.length) return;
    if (allActive || (anyFailed && domainIds.every(id => ["active","failed"].includes(provisionStatuses[id] ?? "")))) return;

    const interval = setInterval(async () => {
      const wsId = getWorkspaceId() ?? "";
      await Promise.all(domainIds.map(async id => {
        try {
          const res  = await fetch(`/api/outreach/domains/${id}/status`, { headers: { "x-workspace-id": wsId } });
          const data = await res.json();
          setProvisionStatuses(prev => ({ ...prev, [id]: data.status ?? "pending" }));
          if (data.error_message) setProvisionErrors(prev => ({ ...prev, [id]: data.error_message }));
        } catch { /* silent */ }
      }));
    }, 3_000);

    return () => clearInterval(interval);
  }, [step, domainIds, allActive, anyFailed]);

  // ─────────────────────────────────────────────────────────────────────────────

  const activePrefixes = prefixMode === "custom"
    ? customPrefix.split(",").map(p => p.trim()).filter(Boolean).slice(0, 5)
    : selectedPrefixes;
  const mailboxCount   = activePrefixes.length || 1;
  const totalInboxes   = selectedDomains.length * mailboxCount;
  const cap            = domainCapacity(selectedDomains.length, mailboxCount);

  const oneTimeUsd   = selectedDomains.reduce((s, d) => s + d.price + DOMAIN_SERVICE_FEE_USD, 0);
  const recurringUsd = INBOX_PRICE_USD * totalInboxes;
  const totalNgn     = Math.round((oneTimeUsd + recurringUsd) * NGN_PER_USD);

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/inboxes" className="text-white/40 hover:text-white/70 text-sm transition-colors">← Inboxes</Link>
        <span className="text-white/20">/</span>
        <Link href="/inboxes/new" className="text-white/40 hover:text-white/70 text-sm transition-colors">Add Inbox</Link>
        <span className="text-white/20">/</span>
        <span className="text-white/60 text-sm">Buy a Domain</span>
      </div>

      {/* Step indicator */}
      {step !== "provisioning" && (
        <div className="flex items-center gap-2 mb-8">
          {(["search", "configure", "review"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s ? "bg-blue-600 text-white" :
                (["search","configure","review"].indexOf(step) > i) ? "bg-green-600 text-white" :
                "bg-white/10 text-white/30"
              }`}>{i + 1}</div>
              <span className={`text-xs capitalize hidden sm:block ${step === s ? "text-white/70" : "text-white/30"}`}>
                {s === "search" ? "Search" : s === "configure" ? "Configure" : "Review & Pay"}
              </span>
              {i < 2 && <div className="w-8 h-px bg-white/10" />}
            </div>
          ))}
        </div>
      )}

      {/* ── Registrant info banner ───────────────────────────────────────────── */}
      {step !== "provisioning" && registrantComplete === false && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/8 border border-amber-500/25 mb-6">
          <span className="text-amber-400 text-lg flex-shrink-0 mt-0.5">⚠</span>
          <div className="flex-1">
            <p className="text-amber-300 text-sm font-medium">Registrant info required</p>
            <p className="text-amber-300/60 text-xs mt-0.5">
              You need to fill in your domain registrant contact details before purchasing a domain.
              This is required by ICANN and used only once per workspace.
            </p>
          </div>
          <Link
            href="/settings?tab=outreach"
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
          >
            Fill in now →
          </Link>
        </div>
      )}

      {/* ── Step 1: Search ────────────────────────────────────────────────────── */}
      {step === "search" && (
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Find a sending domain</h1>
          <p className="text-white/40 text-sm mb-6">Choose a domain dedicated to cold outreach — never use your main company domain.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-white/50 text-xs font-medium mb-1.5">Domain name</label>
              <div className="flex gap-3">
                <input
                  value={sld}
                  onChange={e => setSld(e.target.value.replace(/[^a-z0-9-]/gi, "").toLowerCase())}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  placeholder="yourcompany-outreach"
                  className="flex-1 bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors"
                />
                <button
                  onClick={handleSearch}
                  disabled={checking || !sld.trim() || !selectedTlds.length}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {checking ? "Checking…" : "Search"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-white/50 text-xs font-medium mb-2">Extensions</label>
              <div className="flex gap-2 flex-wrap">
                {TLDS.map(tld => (
                  <button
                    key={tld}
                    onClick={() => setSelectedTlds(prev =>
                      prev.includes(tld) ? prev.filter(t => t !== tld) : [...prev, tld]
                    )}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      selectedTlds.includes(tld)
                        ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                        : "bg-white/4 border-white/10 text-white/40 hover:border-white/20"
                    }`}
                  >
                    {tld}
                  </button>
                ))}
              </div>
            </div>

            {searchError && <p className="text-red-400 text-sm">{searchError}</p>}

            {results.length > 0 && (
              <div>
                <div className="border border-white/8 rounded-xl overflow-hidden mt-2">
                  {results.map(r => {
                    const isSelected = selectedDomains.some(d => d.domain === r.domain);
                    return (
                      <div
                        key={r.domain}
                        onClick={() => r.available && toggleDomain(r)}
                        className={`flex items-center justify-between px-4 py-3 border-b border-white/6 last:border-0 transition-colors ${
                          r.available ? "cursor-pointer" : "opacity-40 cursor-not-allowed"
                        } ${isSelected ? "bg-blue-600/10" : "hover:bg-white/3"}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected ? "bg-blue-600 border-blue-500" : "border-white/20"
                          }`}>
                            {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                          </div>
                          <span className="text-white text-sm font-mono">{r.domain}</span>
                          {!r.available && <span className="text-white/30 text-xs">Taken</span>}
                          {r.available && (
                            <span className="text-white/25 text-xs hidden sm:inline">
                              up to {(MAX_INBOXES_PER_DOMAIN * FULL_SENDS_PER_INBOX).toLocaleString()}/day
                            </span>
                          )}
                        </div>
                        <span className="text-white/50 text-sm">${r.price.toFixed(2)}/yr</span>
                      </div>
                    );
                  })}
                </div>
                {selectedDomains.length > 0 && (
                  <div className="mt-4 space-y-4">
                    {/* Selected domains pills */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedDomains.map(d => (
                        <span key={d.domain} className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-600/15 border border-blue-500/30 rounded-full text-blue-300 text-xs font-mono">
                          {d.domain}
                          <button onClick={() => toggleDomain(d)} className="hover:text-white">×</button>
                        </span>
                      ))}
                    </div>

                    {/* Capacity preview card */}
                    <CapacityCard domainCount={selectedDomains.length} />

                    <div className="flex justify-end">
                      <button
                        onClick={() => setStep("configure")}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
                      >
                        Configure {selectedDomains.length} domain{selectedDomains.length > 1 ? "s" : ""} →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: Configure ─────────────────────────────────────────────────── */}
      {step === "configure" && selectedDomains.length > 0 && (
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Configure inboxes</h1>
          <p className="text-white/40 text-sm mb-6">
            Settings apply to all {selectedDomains.length} selected domain{selectedDomains.length > 1 ? "s" : ""}.
          </p>

          <div className="space-y-6">
            {/* Sender name */}
            <div>
              <label className="block text-white/50 text-xs font-medium mb-3">Sender name</label>
              <div className="grid grid-cols-2 gap-4">
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Alex"
                  className="bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors" />
                <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith"
                  className="bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors" />
              </div>
            </div>

            {/* Inbox address selection */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-white/50 text-xs font-medium">Inbox addresses <span className="text-white/30">(pick up to 5)</span></label>
                <div className="flex gap-1 bg-white/6 rounded-lg p-0.5">
                  {(["generated", "custom"] as const).map(m => (
                    <button key={m} onClick={() => setPrefixMode(m)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${prefixMode === m ? "bg-white/12 text-white" : "text-white/30 hover:text-white/60"}`}>
                      {m === "generated" ? "From name" : "Custom"}
                    </button>
                  ))}
                </div>
              </div>

              {prefixMode === "generated" && (
                <div>
                  {combos.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {combos.map(c => {
                        const isOn = selectedPrefixes.includes(c);
                        return (
                          <button key={c} onClick={() => setSelectedPrefixes(prev =>
                            isOn ? prev.filter(p => p !== c)
                                 : prev.length < 5 ? [...prev, c] : prev
                          )}
                            className={`px-3 py-1.5 rounded-lg border text-sm font-mono transition-all ${
                              isOn ? "bg-blue-600/20 border-blue-500/50 text-blue-200"
                                   : "bg-white/4 border-white/10 text-white/50 hover:border-white/25"
                            }`}>
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-white/30 text-sm">Enter a first and/or last name above to generate suggestions.</p>
                  )}
                  {selectedPrefixes.length > 0 && (
                    <div className="mt-3 p-3 rounded-lg bg-white/3 border border-white/6">
                      <p className="text-white/30 text-xs mb-2">Preview ({selectedDomains[0]?.domain})</p>
                      {selectedPrefixes.map(p => (
                        <p key={p} className="text-white/60 text-xs font-mono">{p}@{selectedDomains[0]?.domain}</p>
                      ))}
                      {selectedDomains.length > 1 && <p className="text-white/25 text-xs mt-1">+ {selectedDomains.length - 1} more domain{selectedDomains.length > 2 ? "s" : ""}</p>}
                    </div>
                  )}
                </div>
              )}

              {prefixMode === "custom" && (
                <div>
                  <input value={customPrefix} onChange={e => setCustomPrefix(e.target.value.toLowerCase())}
                    placeholder="john, j.smith, john.smith"
                    className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 font-mono focus:outline-none focus:border-blue-500/60 transition-colors" />
                  <p className="text-white/30 text-xs mt-1.5">Comma-separated local-parts, max 5. e.g. john, j.smith, john.smith</p>
                </div>
              )}
            </div>

            {/* Sending capacity stats */}
            {activePrefixes.length > 0 && selectedDomains.length > 0 && (
              <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-white/8">
                  {[
                    { label: "Total inboxes", value: String(totalInboxes), sub: `${selectedDomains.length} domain${selectedDomains.length > 1 ? "s" : ""} × ${mailboxCount}` },
                    { label: "Warmup sends/day", value: cap.warmupDay.toLocaleString(), sub: "first 21 days" },
                    { label: "Full sends/day", value: cap.fullDay.toLocaleString(), sub: "after warmup" },
                  ].map(({ label, value, sub }) => (
                    <div key={label} className="p-3 text-center">
                      <p className="text-white font-bold text-xl">{value}</p>
                      <p className="text-white/50 text-xs mt-0.5">{label}</p>
                      <p className="text-white/25 text-xs">{sub}</p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-white/8 px-4 py-2 text-center">
                  <p className="text-white/40 text-xs">
                    <span className="text-white/70 font-medium">{cap.fullMonth.toLocaleString()}</span> sends/month at full capacity
                  </p>
                </div>
              </div>
            )}

            {/* Warmup notice */}
            <div className="flex gap-3 p-4 rounded-xl bg-amber-500/8 border border-amber-500/20">
              <span className="text-amber-400 flex-shrink-0 mt-0.5">⚠</span>
              <p className="text-amber-300/70 text-xs">
                New inboxes warm up for 21 days (max 15 sends/day) to build sender reputation before campaigns can use them.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setStep("review")}
                disabled={activePrefixes.length === 0}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Continue
              </button>
              <button onClick={() => setStep("search")} className="text-white/40 hover:text-white/70 text-sm transition-colors">Back</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Review & Pay ──────────────────────────────────────────────── */}
      {step === "review" && selectedDomains.length > 0 && (
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Review & pay</h1>
          <p className="text-white/40 text-sm mb-6">Your domain will be registered and inboxes provisioned automatically.</p>

          {/* Summary card */}
          <div className="border border-white/8 rounded-xl p-5 mb-6 space-y-3">
            {selectedDomains.map(d => (
              <Row key={d.domain} label={d.domain} value={`$${(d.price + DOMAIN_SERVICE_FEE_USD).toFixed(2)}/yr`} mono />
            ))}
            <div className="border-t border-white/8 pt-3 mt-1 space-y-1">
              <Row label="Inboxes per domain" value={`${mailboxCount} (${activePrefixes.join(", ")})`} mono />
              <Row label="Total inboxes" value={String(totalInboxes)} />
            </div>
            <div className="border-t border-white/8 pt-3 grid grid-cols-4 gap-2 text-center">
              {[
                ["Inboxes",      totalInboxes.toString()],
                ["Warmup/day",   cap.warmupDay.toLocaleString()],
                ["Full/day",     cap.fullDay.toLocaleString()],
                ["Full/month",   cap.fullMonth.toLocaleString()],
              ].map(([l,v])=>(
                <div key={l}><p className="text-white font-semibold text-sm">{v}</p><p className="text-white/30 text-xs">{l}</p></div>
              ))}
            </div>
            <div className="border-t border-white/8 pt-3">
              <Row label="Monthly subscription" value={`$${recurringUsd}/mo`} highlight />
              <p className="text-white/30 text-xs mt-1">${INBOX_PRICE_USD}/inbox × {totalInboxes} inboxes</p>
            </div>
          </div>

          {/* Currency — driven by sidebar toggle */}
          <div className="mb-6 flex items-center justify-between px-4 py-3 bg-white/4 border border-white/8 rounded-xl">
            <div>
              <p className="text-white text-sm font-semibold">
                {currency === "stripe" ? "USD · via Stripe" : "NGN · via Paystack"}
              </p>
              <p className="text-white/60 text-sm font-mono mt-0.5">
                {currency === "stripe"
                  ? `$${oneTimeUsd.toFixed(2)} one-time + $${recurringUsd}/mo`
                  : `₦${totalNgn.toLocaleString()} one-time`}
              </p>
            </div>
            <p className="text-white/30 text-xs">Change in sidebar</p>
          </div>

          {payError && <p className="text-red-400 text-sm mb-4">{payError}</p>}

          <div className="flex items-center gap-3">
            <button
              onClick={handleCheckout}
              disabled={paying || registrantComplete === false}
              title={registrantComplete === false ? "Fill in registrant info in Settings → Outreach first" : undefined}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2"
            >
              {paying && <Spinner />}
              {paying ? "Redirecting…" : "Purchase & set up →"}
            </button>
            <button onClick={() => setStep("configure")} className="text-white/40 hover:text-white/70 text-sm transition-colors">
              Back
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Provisioning ──────────────────────────────────────────────── */}
      {step === "provisioning" && (
        <div>
          <h1 className="text-xl font-bold text-white mb-1">
            {overallStatus === "active" ? "All set!" : overallStatus === "failed" ? "Setup failed" : `Setting up ${domainIds.length} domain${domainIds.length > 1 ? "s" : ""}…`}
          </h1>
          <p className="text-white/40 text-sm mb-8">
            {overallStatus === "active"
              ? "Your inboxes are created and warming up. They'll be ready for campaigns in 21 days."
              : overallStatus === "failed"
              ? "Something went wrong during setup. Contact support if this persists."
              : "This usually takes under a minute. Don't close this tab."}
          </p>

          <div className="space-y-3">
            {PROVISION_STEPS.map((label, i) => {
              const isDone   = overallStatus !== "failed" && minStep > i;
              const isActive = overallStatus !== "failed" && minStep === i;
              const isFailed = overallStatus === "failed" && minStep === i;

              return (
                <div key={label} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  isDone   ? "border-green-500/20 bg-green-500/5" :
                  isActive ? "border-blue-500/30 bg-blue-500/8" :
                  isFailed ? "border-red-500/30 bg-red-500/8" :
                             "border-white/6 opacity-30"
                }`}>
                  <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                    {isDone   ? <span className="text-green-400 text-sm">✓</span> :
                     isActive ? <Spinner className="text-blue-400" /> :
                     isFailed ? <span className="text-red-400 text-sm">✗</span> :
                                <span className="text-white/20 text-xs">{i + 1}</span>}
                  </div>
                  <span className={`text-sm ${isDone ? "text-green-300" : isActive ? "text-white" : isFailed ? "text-red-300" : "text-white/30"}`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          {Object.entries(provisionErrors).map(([id, msg]) => (
            <div key={id} className="mt-4 p-4 rounded-xl bg-red-500/8 border border-red-500/20">
              <p className="text-red-300/60 text-xs">{msg}</p>
            </div>
          ))}

          {overallStatus === "active" && (
            <div className="mt-8 flex items-center gap-3">
              <button
                onClick={() => router.push("/inboxes")}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                View inboxes →
              </button>
            </div>
          )}

          {overallStatus === "failed" && (
            <div className="mt-6 flex items-center gap-3">
              <Link
                href="/inboxes/new/domain"
                className="px-6 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Try again
              </Link>
              <Link
                href="/support"
                className="text-white/40 hover:text-white/70 text-sm transition-colors"
              >
                Contact support
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function Row({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/40 text-sm">{label}</span>
      <span className={`text-sm ${highlight ? "text-white font-semibold" : "text-white/70"} ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function Spinner({ className = "text-white" }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ─── Capacity preview (shown in search step after domain selection) ────────────

function CapacityCard({ domainCount }: { domainCount: number }) {
  const rows = [1, 2, 3, 5].map(inboxes => {
    const c = domainCapacity(domainCount, inboxes);
    return { inboxes: domainCount * inboxes, warmupDay: c.warmupDay, fullDay: c.fullDay, fullMonth: c.fullMonth };
  });

  return (
    <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/8 flex items-center justify-between">
        <p className="text-white/60 text-xs font-medium">Sending capacity · {domainCount} domain{domainCount > 1 ? "s" : ""}</p>
        <p className="text-white/30 text-xs">5 inboxes max per domain</p>
      </div>
      <div className="divide-y divide-white/6">
        {/* Header */}
        <div className="grid grid-cols-4 px-4 py-2 text-white/30 text-xs">
          <span>Inboxes</span>
          <span className="text-right">Warmup/day</span>
          <span className="text-right">Full/day</span>
          <span className="text-right">Full/month</span>
        </div>
        {rows.map(r => (
          <div key={r.inboxes} className={`grid grid-cols-4 px-4 py-2.5 text-xs ${r.inboxes === domainCount * MAX_INBOXES_PER_DOMAIN ? "bg-blue-600/8" : ""}`}>
            <span className="text-white/70 font-medium">{r.inboxes} {r.inboxes === domainCount * MAX_INBOXES_PER_DOMAIN && <span className="text-white/30">(max)</span>}</span>
            <span className="text-right text-white/40">{r.warmupDay.toLocaleString()}</span>
            <span className="text-right text-white/70">{r.fullDay.toLocaleString()}</span>
            <span className="text-right text-white/70">{r.fullMonth.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <div className="px-4 py-2 border-t border-white/8 bg-white/2">
        <p className="text-white/25 text-xs">Warmup = first 21 days (15/inbox/day) · Full = after warmup (40/inbox/day)</p>
      </div>
    </div>
  );
}
