"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getWorkspaceId } from "@/lib/workspace/client";

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

const TLDS = [".com", ".io", ".co", ".net"];
const INBOX_PRICE_USD = 2;
const DOMAIN_SERVICE_FEE_USD = 1;
const NGN_PER_USD = 1600;

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

  // Detect post-Stripe/Paystack redirect
  const returnedDomainId = searchParams.get("domain_id");
  const returnedSessionId = searchParams.get("session_id");
  const returnedRef       = searchParams.get("ref");

  const [step, setStep]   = useState<Step>(returnedDomainId ? "provisioning" : "search");

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
  const [sld, setSld]           = useState("");
  const [selectedTlds, setSelectedTlds] = useState<string[]>([".com"]);
  const [checking, setChecking] = useState(false);
  const [results, setResults]   = useState<DomainResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DomainResult | null>(null);

  // ── Step 2: Configure ───────────────────────────────────────────────────────
  const [mailboxCount, setMailboxCount]   = useState(3);
  const [prefix, setPrefix]               = useState("outreach");
  const [firstName, setFirstName]         = useState("");
  const [lastName, setLastName]           = useState("");

  // ── Step 3: Review ──────────────────────────────────────────────────────────
  const [currency, setCurrency]           = useState<PaymentProvider>("stripe");
  const [paying, setPaying]               = useState(false);
  const [payError, setPayError]           = useState<string | null>(null);

  // ── Step 4: Provisioning ────────────────────────────────────────────────────
  const [domainId, setDomainId]           = useState<string | null>(returnedDomainId);
  const [provisionStatus, setProvisionStatus] = useState<string>("pending");
  const [provisionError, setProvisionError]   = useState<string | null>(null);
  const [provisioning, setProvisioning]       = useState(false);

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
    if (!selected) return;
    setPaying(true);
    setPayError(null);
    try {
      const wsId = getWorkspaceId() ?? "";
      const res = await fetch("/api/outreach/domains/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": wsId },
        body: JSON.stringify({
          domain:           selected.domain,
          mailbox_count:    mailboxCount,
          mailbox_prefix:   prefix,
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
  const startProvision = useCallback(async (dId: string, sessionId?: string | null, ref?: string | null) => {
    if (provisioning) return;
    setProvisioning(true);
    try {
      const wsId = getWorkspaceId() ?? "";
      await fetch("/api/outreach/domains/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": wsId },
        body: JSON.stringify({
          domain_record_id:  dId,
          stripe_session_id: sessionId ?? undefined,
          paystack_reference: ref ?? undefined,
        }),
      });
    } catch {
      // Provision endpoint responds immediately; errors surface via polling
    }
  }, [provisioning]);

  // Kick off provision on mount when returning from payment
  useEffect(() => {
    if (returnedDomainId && !provisioning) {
      startProvision(returnedDomainId, returnedSessionId, returnedRef);
    }
  }, [returnedDomainId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Poll provision status ─────────────────────────────────────────────────
  useEffect(() => {
    if (step !== "provisioning" || !domainId) return;
    if (provisionStatus === "active" || provisionStatus === "failed") return;

    const interval = setInterval(async () => {
      try {
        const wsId = getWorkspaceId() ?? "";
        const res = await fetch(`/api/outreach/domains/${domainId}/status`, {
          headers: { "x-workspace-id": wsId },
        });
        const data = await res.json();
        setProvisionStatus(data.status ?? "pending");
        if (data.error_message) setProvisionError(data.error_message);
      } catch { /* silent */ }
    }, 3_000);

    return () => clearInterval(interval);
  }, [step, domainId, provisionStatus]);

  // ─────────────────────────────────────────────────────────────────────────────

  const oneTimeUsd  = selected ? (selected.price + DOMAIN_SERVICE_FEE_USD) : 0;
  const recurringUsd = INBOX_PRICE_USD * mailboxCount;
  const totalNgn    = Math.round((oneTimeUsd + recurringUsd) * NGN_PER_USD);

  const currentProvisionStep = STATUS_TO_STEP[provisionStatus] ?? 0;

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
              <div className="border border-white/8 rounded-xl overflow-hidden mt-2">
                {results.map(r => (
                  <div
                    key={r.domain}
                    className={`flex items-center justify-between px-4 py-3 border-b border-white/6 last:border-0 transition-colors ${
                      selected?.domain === r.domain ? "bg-blue-600/10" : "hover:bg-white/3"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${r.available ? "bg-green-400" : "bg-red-400"}`} />
                      <span className="text-white text-sm font-mono">{r.domain}</span>
                      {!r.available && <span className="text-white/30 text-xs">Taken</span>}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-white/50 text-sm">${r.price.toFixed(2)}/yr</span>
                      {r.available && (
                        <button
                          onClick={() => { setSelected(r); setStep("configure"); }}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          Select
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: Configure ─────────────────────────────────────────────────── */}
      {step === "configure" && selected && (
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Configure your inboxes</h1>
          <p className="text-white/40 text-sm mb-6">
            Set up sending mailboxes for <span className="text-white/70 font-mono">{selected.domain}</span>
          </p>

          <div className="space-y-6">
            {/* Mailbox count */}
            <div>
              <label className="block text-white/50 text-xs font-medium mb-3">
                Number of inboxes <span className="text-white/30">(max 5)</span>
              </label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setMailboxCount(c => Math.max(1, c - 1))}
                  className="w-8 h-8 rounded-lg bg-white/6 border border-white/10 text-white flex items-center justify-center text-lg hover:bg-white/10 transition-colors"
                >
                  −
                </button>
                <span className="text-white font-bold text-2xl w-6 text-center">{mailboxCount}</span>
                <button
                  onClick={() => setMailboxCount(c => Math.min(5, c + 1))}
                  className="w-8 h-8 rounded-lg bg-white/6 border border-white/10 text-white flex items-center justify-center text-lg hover:bg-white/10 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* Prefix */}
            <div>
              <label className="block text-white/50 text-xs font-medium mb-1.5">Mailbox prefix</label>
              <input
                value={prefix}
                onChange={e => setPrefix(e.target.value.replace(/[^a-z0-9]/gi, "").toLowerCase())}
                placeholder="outreach"
                className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
              {/* Preview */}
              <div className="mt-3 p-3 rounded-lg bg-white/3 border border-white/6">
                <p className="text-white/30 text-xs mb-2">Preview</p>
                {Array.from({ length: mailboxCount }).map((_, i) => (
                  <p key={i} className="text-white/60 text-xs font-mono">
                    {prefix || "outreach"}{i + 1}@{selected.domain}
                  </p>
                ))}
              </div>
            </div>

            {/* Sender name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white/50 text-xs font-medium mb-1.5">Sender first name</label>
                <input
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Alex"
                  className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors"
                />
              </div>
              <div>
                <label className="block text-white/50 text-xs font-medium mb-1.5">Sender last name</label>
                <input
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Smith"
                  className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-blue-500/60 transition-colors"
                />
              </div>
            </div>

            {/* Warmup notice */}
            <div className="flex gap-3 p-4 rounded-xl bg-amber-500/8 border border-amber-500/20">
              <span className="text-amber-400 text-lg flex-shrink-0">⚠</span>
              <div>
                <p className="text-amber-300 text-sm font-medium">21-day warmup period</p>
                <p className="text-amber-300/60 text-xs mt-0.5">
                  New inboxes warm up for 21 days (max 15 sends/day) to build sender reputation before your campaigns can use them.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setStep("review")}
                disabled={!prefix}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Continue
              </button>
              <button onClick={() => setStep("search")} className="text-white/40 hover:text-white/70 text-sm transition-colors">
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Review & Pay ──────────────────────────────────────────────── */}
      {step === "review" && selected && (
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Review & pay</h1>
          <p className="text-white/40 text-sm mb-6">Your domain will be registered and inboxes provisioned automatically.</p>

          {/* Summary card */}
          <div className="border border-white/8 rounded-xl p-5 mb-6 space-y-3">
            <Row label="Domain" value={selected.domain} mono />
            <Row label="Domain registration (1 yr)" value={`$${(selected.price + DOMAIN_SERVICE_FEE_USD).toFixed(2)}`} />
            <Row label="Inboxes" value={`${mailboxCount} × ${prefix || "outreach"}N@${selected.domain}`} mono />
            <div className="border-t border-white/8 pt-3 mt-3">
              <Row label="Monthly subscription" value={`$${recurringUsd}/mo`} highlight />
              <p className="text-white/30 text-xs mt-1 pl-0">
                ${INBOX_PRICE_USD}/inbox × {mailboxCount} inbox{mailboxCount > 1 ? "es" : ""}
              </p>
            </div>
          </div>

          {/* Currency selector */}
          <div className="mb-6">
            <label className="block text-white/50 text-xs font-medium mb-3">Pay in</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setCurrency("stripe")}
                className={`p-4 rounded-xl border text-left transition-all ${
                  currency === "stripe"
                    ? "border-blue-500/60 bg-blue-600/10"
                    : "border-white/10 bg-white/4 hover:border-white/20"
                }`}
              >
                <p className="text-white font-semibold text-sm">USD</p>
                <p className="text-white/40 text-xs mt-0.5">via Stripe</p>
                <p className="text-white/60 text-sm mt-2 font-mono">
                  ${oneTimeUsd.toFixed(2)} + ${recurringUsd}/mo
                </p>
              </button>

              <button
                onClick={() => setCurrency("paystack")}
                className={`p-4 rounded-xl border text-left transition-all ${
                  currency === "paystack"
                    ? "border-blue-500/60 bg-blue-600/10"
                    : "border-white/10 bg-white/4 hover:border-white/20"
                }`}
              >
                <p className="text-white font-semibold text-sm">NGN</p>
                <p className="text-white/40 text-xs mt-0.5">via Paystack</p>
                <p className="text-white/60 text-sm mt-2 font-mono">
                  ₦{totalNgn.toLocaleString()}
                </p>
              </button>
            </div>
          </div>

          {payError && <p className="text-red-400 text-sm mb-4">{payError}</p>}

          <div className="flex items-center gap-3">
            <button
              onClick={handleCheckout}
              disabled={paying}
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
            {provisionStatus === "active" ? "All set!" : provisionStatus === "failed" ? "Setup failed" : "Setting up your domain…"}
          </h1>
          <p className="text-white/40 text-sm mb-8">
            {provisionStatus === "active"
              ? "Your inboxes are created and warming up. They'll be ready for campaigns in 21 days."
              : provisionStatus === "failed"
              ? "Something went wrong during setup. Contact support if this persists."
              : "This usually takes under a minute. Don't close this tab."}
          </p>

          <div className="space-y-3">
            {PROVISION_STEPS.map((label, i) => {
              const isDone   = provisionStatus !== "failed" && currentProvisionStep > i;
              const isActive = provisionStatus !== "failed" && currentProvisionStep === i;
              const isFailed = provisionStatus === "failed" && currentProvisionStep === i;

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

          {provisionError && (
            <div className="mt-4 p-4 rounded-xl bg-red-500/8 border border-red-500/20">
              <p className="text-red-300 text-sm font-medium mb-1">Error details</p>
              <p className="text-red-300/60 text-xs">{provisionError}</p>
            </div>
          )}

          {provisionStatus === "active" && (
            <div className="mt-8 flex items-center gap-3">
              <button
                onClick={() => router.push("/inboxes")}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                View inboxes →
              </button>
            </div>
          )}

          {provisionStatus === "failed" && (
            <div className="mt-6 flex items-center gap-3">
              <Link
                href="/inboxes/new/domain"
                className="px-6 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Try again
              </Link>
              <a
                href="mailto:support@leadash.io"
                className="text-white/40 hover:text-white/70 text-sm transition-colors"
              >
                Contact support
              </a>
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
