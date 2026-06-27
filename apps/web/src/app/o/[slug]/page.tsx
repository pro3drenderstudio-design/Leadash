"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  LockIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Loading03Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import "@/v2-app/v2-app.css";
import {
  GRANT_COLORS,
  GRANT_LABELS,
  grantLine,
  formatOfferPrice,
  type Offer,
  type OfferBump,
} from "@/types/offers";
import { GRANT_ICONS } from "@/app/(admin)/admin/offers/grantIcons";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OfferGetResponse {
  offer: Offer;
  closed: boolean;
  sold_out: boolean;
  spots_left: number | null;
  session_id: string;
  error?: string;
}

interface CheckoutSubmitResponse {
  free?: boolean;
  purchase_id?: string;
  url?: string;
  error?: string;
}

type LoadState = "loading" | "ready" | "not_found";

// ─── Style helpers ────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--app-bg-elevated)",
  border: "1px solid var(--app-border)",
  borderRadius: 12,
};

const inputStyle: React.CSSProperties = {
  background: "var(--app-bg)",
  border: "1px solid var(--app-border-strong)",
  borderRadius: 8,
  padding: "11px 13px",
  color: "var(--app-text)",
  fontSize: 13.5,
  width: "100%",
  fontFamily: "inherit",
  outline: "none",
};

const monoStyle: React.CSSProperties = {
  fontFamily: "'Geist Mono', ui-monospace, monospace",
};

const primaryButtonStyle: React.CSSProperties = {
  background: "var(--app-accent)",
  color: "#fff",
  fontWeight: 700,
  borderRadius: 10,
  boxShadow: "0 8px 20px -8px var(--app-accent)",
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
};

function sessionKey(slug: string) {
  return `offer_session_${slug}`;
}

/** Full browser navigation (not router.push) — used for free-offer redirects
 *  and handing off to the external Paystack hosted checkout URL. Kept as a
 *  standalone module-level function so it reads as an external-system call
 *  rather than a render-scoped mutation. */
function navigateTo(url: string) {
  window.location.href = url;
}

function useCountdown(target: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const diff = Math.max(0, new Date(target).getTime() - now);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds, expired: diff <= 0 };
}

function pricingSubtext(offer: Offer): string {
  switch (offer.pricing_model) {
    case "recurring":
      return `Billed ${offer.billing_interval ?? "monthly"}`;
    case "trial":
      return `${offer.trial_days ?? 0}-day free trial, then ${formatOfferPrice(offer.price_ngn)}/${offer.billing_interval ?? "monthly"}`;
    case "payment_plan":
      return offer.installments
        ? `${offer.installments.count} payments of ${formatOfferPrice(offer.installments.amount_ngn)}`
        : "Payment plan";
    case "free":
      return "No payment required";
    default:
      return "One-time payment · instant access";
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OfferCheckoutPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [state, setState] = useState<LoadState>("loading");
  const [offer, setOffer] = useState<Offer | null>(null);
  const [closed, setClosed] = useState(false);
  const [soldOut, setSoldOut] = useState(false);
  const [spotsLeft, setSpotsLeft] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    async function load() {
      const stored = sessionStorage.getItem(sessionKey(slug));
      const qs = stored ? `?s=${encodeURIComponent(stored)}` : "";
      try {
        const res = await fetch(`/api/offers/${slug}${qs}`);
        if (!res.ok) {
          if (!cancelled) setState("not_found");
          return;
        }
        const data: OfferGetResponse = await res.json();
        if (cancelled) return;
        sessionStorage.setItem(sessionKey(slug), data.session_id);
        setOffer(data.offer);
        setClosed(data.closed);
        setSoldOut(data.sold_out);
        setSpotsLeft(data.spots_left);
        setSessionId(data.session_id);
        setState("ready");
      } catch {
        if (!cancelled) setState("not_found");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [slug]);

  if (state === "loading") {
    return (
      <div className="v2-app" style={pageBgStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <HugeiconsIcon icon={Loading03Icon} size={28} strokeWidth={1.8} color="var(--app-text-quiet)" className="offer-spin" />
        </div>
        <style>{spinKeyframes}</style>
      </div>
    );
  }

  if (state === "not_found" || !offer) {
    return (
      <div className="v2-app" style={pageBgStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 14, textAlign: "center", padding: 24 }}>
          <HugeiconsIcon icon={AlertCircleIcon} size={32} strokeWidth={1.6} color="var(--app-text-quiet)" />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text)" }}>Offer not found</h1>
          <p style={{ fontSize: 13.5, color: "var(--app-text-muted)" }}>This checkout link may have expired or been removed.</p>
          <Link href="/" style={{ color: "var(--app-accent)", fontSize: 13.5, fontWeight: 600, textDecoration: "none" }}>
            ← Back to Leadash
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="v2-app" style={pageBgStyle}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "34px 24px" }}>
        <TopBar />
        <CheckoutLayout
          offer={offer}
          closed={closed}
          soldOut={soldOut}
          spotsLeft={spotsLeft}
          sessionId={sessionId}
          slug={slug}
        />
      </div>
      <style>{spinKeyframes}</style>
    </div>
  );
}

const pageBgStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "radial-gradient(ellipse at top, rgba(249,115,22,0.06), transparent 55%), var(--app-bg)",
  color: "var(--app-text)",
};

const spinKeyframes = `
  .offer-spin { animation: offerSpin 0.9s linear infinite; }
  @keyframes offerSpin { to { transform: rotate(360deg); } }
`;

function TopBar() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--app-accent)", display: "inline-block" }} />
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>Leadash</span>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600,
        color: "var(--app-text-muted)", padding: "5px 11px", borderRadius: 999,
        background: "var(--app-surface)", border: "1px solid var(--app-border)",
      }}>
        <HugeiconsIcon icon={LockIcon} size={12} strokeWidth={2} />
        Secure checkout
      </div>
    </div>
  );
}

// ─── Layout switcher ──────────────────────────────────────────────────────────

interface LayoutProps {
  offer: Offer;
  closed: boolean;
  soldOut: boolean;
  spotsLeft: number | null;
  sessionId: string;
  slug: string;
}

function CheckoutLayout({ offer, closed, soldOut, spotsLeft, sessionId, slug }: LayoutProps) {
  const layout = offer.checkout.layout;

  if (layout === "single") {
    return (
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <PaymentCard offer={offer} closed={closed} soldOut={soldOut} spotsLeft={spotsLeft} sessionId={sessionId} slug={slug} />
      </div>
    );
  }

  if (layout === "long") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 32, maxWidth: 620, margin: "0 auto" }}>
        <ValueStack offer={offer} />
        <PaymentCard offer={offer} closed={closed} soldOut={soldOut} spotsLeft={spotsLeft} sessionId={sessionId} slug={slug} />
      </div>
    );
  }

  // two_col (default)
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 36, alignItems: "start" }} className="offer-two-col">
      <ValueStack offer={offer} />
      <PaymentCard offer={offer} closed={closed} soldOut={soldOut} spotsLeft={spotsLeft} sessionId={sessionId} slug={slug} />
      <style>{`
        @media (max-width: 860px) {
          .offer-two-col { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Left column: value stack ─────────────────────────────────────────────────

function ValueStack({ offer }: { offer: Offer }) {
  const checkout = offer.checkout;
  const guaranteeDays = offer.refund_window_days;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {checkout.badge && (
        <span style={{
          alignSelf: "flex-start", fontSize: 11.5, fontWeight: 700, padding: "4px 12px", borderRadius: 999,
          color: "var(--app-accent)", background: "var(--app-accent-soft)", border: "1px solid var(--app-accent-line)",
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          {checkout.badge}
        </span>
      )}

      <div>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, color: "var(--app-text)" }}>
          {checkout.headline || offer.name}
        </h1>
        {checkout.subhead && (
          <p style={{ fontSize: 15, color: "var(--app-text-muted)", marginTop: 12, lineHeight: 1.6 }}>
            {checkout.subhead}
          </p>
        )}
      </div>

      {checkout.show_value_stack && offer.grants.length > 0 && (
        <div style={{ ...cardStyle, padding: 22 }}>
          <h3 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 16, color: "var(--app-text)" }}>Everything included</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {offer.grants.map(g => {
              const color = GRANT_COLORS[g.type];
              const Icon = GRANT_ICONS[g.type];
              return (
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: `${color}1A`, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <HugeiconsIcon icon={Icon} size={16} strokeWidth={1.8} color={color} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--app-text)" }}>{GRANT_LABELS[g.type]}</p>
                    <p style={{ fontSize: 12.5, color: "var(--app-text-muted)", marginTop: 1 }}>{grantLine(g)}</p>
                  </div>
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.8} color="var(--app-success)" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {checkout.show_guarantee && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={15} strokeWidth={1.8} color="var(--app-success)" />
            <span style={{ fontSize: 13, color: "var(--app-text-muted)" }}>
              {guaranteeDays > 0 ? `${guaranteeDays}-day money-back guarantee` : "All sales final"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HugeiconsIcon icon={LockIcon} size={15} strokeWidth={1.8} color="var(--app-text-quiet)" />
            <span style={{ fontSize: 13, color: "var(--app-text-muted)" }}>Secure Paystack checkout</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Right column: payment card ───────────────────────────────────────────────

function PaymentCard({ offer, closed, soldOut, spotsLeft, sessionId, slug }: LayoutProps) {
  const [buyer, setBuyer] = useState<Record<string, string>>({});
  const [bumpIds, setBumpIds] = useState<string[]>([]);
  const [discountCode, setDiscountCode] = useState("");
  const [discountApplied, setDiscountApplied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  const startedFired = useRef(false);
  const paymentAddedFired = useRef(false);

  const countdown = useCountdown(offer.checkout.show_countdown && offer.expires_at && !closed ? offer.expires_at : null);

  const isPaused = offer.status === "paused";
  // A 'full_price' expiry behavior means the offer keeps selling (at full price,
  // no promo framing) even after `expires_at` has passed — so `closed` alone
  // should not block purchase in that case.
  const effectivelyClosed = closed && offer.on_expire !== "full_price";
  const isPurchasable = !effectivelyClosed && !soldOut && !isPaused;

  const activeBumps = offer.bumps.filter(b => b.is_active);
  const enabledFields = offer.checkout.fields.filter(f => f.enabled);

  const bumpTotal = activeBumps
    .filter(b => bumpIds.includes(b.id))
    .reduce((sum, b) => sum + b.price_ngn, 0);
  const total = offer.price_ngn + bumpTotal;

  function fireEvent(event: "started" | "payment_added") {
    fetch(`/api/offers/${slug}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, event }),
    }).catch(() => {});
  }

  function handleFieldInteraction() {
    if (!startedFired.current) {
      startedFired.current = true;
      fireEvent("started");
    }
  }

  function updateBuyer(key: string, value: string) {
    handleFieldInteraction();
    setBuyer(prev => {
      const next = { ...prev, [key]: value };
      if (!paymentAddedFired.current) {
        const requiredFields = enabledFields.filter(f => f.required);
        const allFilled = requiredFields.every(f => (next[f.key] ?? "").trim().length > 0);
        if (allFilled && requiredFields.length > 0) {
          paymentAddedFired.current = true;
          fireEvent("payment_added");
        }
      }
      return next;
    });
  }

  function toggleBump(id: string) {
    setBumpIds(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);
  }

  function applyDiscount() {
    if (!discountCode.trim()) return;
    setDiscountApplied(true);
  }

  async function handleSubmit() {
    setErrorMsg("");
    const errs: Record<string, boolean> = {};
    for (const f of enabledFields) {
      if (f.required && !(buyer[f.key] ?? "").trim()) errs[f.key] = true;
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setErrorMsg("Please fill in all required fields.");
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    const payload: Record<string, unknown> = {
      session_id: sessionId,
      buyer,
      bump_ids: bumpIds,
    };
    if (discountCode.trim()) payload.discount_code = discountCode.trim();

    try {
      const res = await fetch(`/api/offers/${slug}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: CheckoutSubmitResponse = await res.json();
      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      if (data.free && data.purchase_id) {
        navigateTo(`/o/${slug}/success?purchase_id=${data.purchase_id}`);
        return;
      }
      if (data.url) {
        navigateTo(data.url);
        return;
      }
      setErrorMsg("Unexpected response from server. Please try again.");
      setSubmitting(false);
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: "sticky", top: 24 }}>
      <div style={{ ...cardStyle, overflow: "hidden" }}>
        {countdown && !countdown.expired && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: "var(--app-warning-soft)", borderBottom: "1px solid var(--app-border)",
            padding: "10px 16px", fontSize: 12.5, fontWeight: 700, color: "var(--app-warning)",
          }}>
            <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={2} />
            <span style={monoStyle}>
              {countdown.days > 0 ? `${countdown.days}d ` : ""}
              {String(countdown.hours).padStart(2, "0")}:{String(countdown.minutes).padStart(2, "0")}:{String(countdown.seconds).padStart(2, "0")}
            </span>
            <span>left at this price</span>
          </div>
        )}

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Price block */}
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ ...monoStyle, fontSize: 34, fontWeight: 800, color: "var(--app-text)" }}>
                {formatOfferPrice(offer.price_ngn, offer.currency_mode === "usd_only" ? "USD" : "NGN")}
              </span>
              {offer.compare_at_ngn && offer.compare_at_ngn > offer.price_ngn && !(closed && offer.on_expire === "full_price") && (
                <>
                  <span style={{ ...monoStyle, fontSize: 16, color: "var(--app-text-quiet)", textDecoration: "line-through" }}>
                    {formatOfferPrice(offer.compare_at_ngn, offer.currency_mode === "usd_only" ? "USD" : "NGN")}
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--app-success)", background: "var(--app-success-soft)", padding: "3px 9px", borderRadius: 999 }}>
                    Save {formatOfferPrice(offer.compare_at_ngn - offer.price_ngn, offer.currency_mode === "usd_only" ? "USD" : "NGN")}
                  </span>
                </>
              )}
            </div>
            <p style={{ fontSize: 13, color: "var(--app-text-muted)", marginTop: 6 }}>{pricingSubtext(offer)}</p>
            {!soldOut && spotsLeft !== null && spotsLeft <= 20 && spotsLeft > 0 && (
              <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--app-warning)", marginTop: 6 }}>
                Only {spotsLeft} left
              </p>
            )}
          </div>

          {/* Unavailable states */}
          {soldOut && (
            <StatusBanner icon={AlertCircleIcon} color="var(--app-text-quiet)" title="Sold out" body="This offer has reached its stock limit and is no longer available." />
          )}
          {!soldOut && isPaused && (
            <StatusBanner icon={AlertCircleIcon} color="var(--app-warning)" title="Not currently available" body="This offer isn't currently available." />
          )}
          {!soldOut && !isPaused && closed && offer.on_expire === "hide_button" && (
            <StatusBanner icon={Clock01Icon} color="var(--app-text-quiet)" title="This offer has closed" body="The window to purchase this offer has ended." />
          )}
          {!soldOut && !isPaused && closed && offer.on_expire === "waitlist" && (
            <StatusBanner icon={Clock01Icon} color="var(--app-text-quiet)" title="This offer is closed" body="Email support@leadash.com to be notified when it reopens." />
          )}

          {isPurchasable && (
            <>
              {/* Buyer fields */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {enabledFields.map(f => (
                  <div key={f.key}>
                    <label style={{ display: "flex", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--app-text-muted)", marginBottom: 6 }}>
                      {f.label}
                      {f.required && <span style={{ color: "var(--app-danger)" }}>*</span>}
                    </label>
                    {f.type === "select" ? (
                      <select
                        style={{ ...inputStyle, borderColor: fieldErrors[f.key] ? "var(--app-danger)" : "var(--app-border-strong)" }}
                        value={buyer[f.key] ?? ""}
                        onFocus={handleFieldInteraction}
                        onChange={e => updateBuyer(f.key, e.target.value)}
                      >
                        <option value="">Select…</option>
                        {(f.options ?? []).map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"}
                        style={{ ...inputStyle, borderColor: fieldErrors[f.key] ? "var(--app-danger)" : "var(--app-border-strong)" }}
                        value={buyer[f.key] ?? ""}
                        onFocus={handleFieldInteraction}
                        onChange={e => updateBuyer(f.key, e.target.value)}
                        placeholder={f.label}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Order bumps */}
              {activeBumps.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {activeBumps.map(bump => {
                    const checked = bumpIds.includes(bump.id);
                    return <BumpRow key={bump.id} bump={bump} checked={checked} onToggle={() => toggleBump(bump.id)} />;
                  })}
                </div>
              )}

              {/* Discount code */}
              <div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="Discount code"
                    value={discountCode}
                    onChange={e => { setDiscountCode(e.target.value); setDiscountApplied(false); }}
                  />
                  <button
                    type="button"
                    onClick={applyDiscount}
                    disabled={!discountCode.trim()}
                    style={{
                      padding: "0 16px", borderRadius: 8, border: "1px solid var(--app-border-strong)",
                      background: "var(--app-surface-strong)", color: "var(--app-text)", fontSize: 12.5, fontWeight: 700,
                      cursor: discountCode.trim() ? "pointer" : "not-allowed", opacity: discountCode.trim() ? 1 : 0.5,
                      fontFamily: "inherit",
                    }}
                  >
                    Apply
                  </button>
                </div>
                {discountApplied && (
                  <p style={{ fontSize: 11.5, color: "var(--app-text-quiet)", marginTop: 6 }}>
                    Code will be validated at checkout — your final total may be lower.
                  </p>
                )}
              </div>

              {/* Totals */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 14, borderTop: "1px solid var(--app-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--app-text-muted)" }}>
                  <span>{offer.name}</span>
                  <span style={monoStyle}>{formatOfferPrice(offer.price_ngn)}</span>
                </div>
                {activeBumps.filter(b => bumpIds.includes(b.id)).map(b => (
                  <div key={b.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--app-text-muted)" }}>
                    <span>{b.label}</span>
                    <span style={monoStyle}>{formatOfferPrice(b.price_ngn)}{b.recurring ? "/mo" : ""}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 800, color: "var(--app-text)", paddingTop: 8, borderTop: "1px solid var(--app-border)" }}>
                  <span>Total</span>
                  <span style={monoStyle}>{formatOfferPrice(total, offer.currency_mode === "usd_only" ? "USD" : "NGN")}</span>
                </div>
              </div>

              {errorMsg && (
                <p style={{ fontSize: 12.5, color: "var(--app-danger)", background: "var(--app-danger-soft)", borderRadius: 8, padding: "9px 12px" }}>
                  {errorMsg}
                </p>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  ...primaryButtonStyle,
                  width: "100%", padding: "14px 0", fontSize: 14.5,
                  opacity: submitting ? 0.7 : 1,
                  cursor: submitting ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {submitting && <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="offer-spin" />}
                {submitting ? "Processing…" : `Complete purchase — ${formatOfferPrice(total, offer.currency_mode === "usd_only" ? "USD" : "NGN")}`}
              </button>
            </>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <HugeiconsIcon icon={LockIcon} size={12} strokeWidth={2} color="var(--app-text-quiet)" />
            <span style={{ fontSize: 11.5, color: "var(--app-text-quiet)" }}>Secured by Paystack · ₦ / $ accepted</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBanner({ icon, color, title, body }: { icon: typeof AlertCircleIcon; color: string; title: string; body: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 6, alignItems: "center", textAlign: "center",
      padding: "20px 16px", borderRadius: 10, background: "var(--app-surface)", border: "1px solid var(--app-border)",
    }}>
      <HugeiconsIcon icon={icon} size={22} strokeWidth={1.6} color={color} />
      <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--app-text)" }}>{title}</p>
      <p style={{ fontSize: 12.5, color: "var(--app-text-muted)" }}>{body}</p>
    </div>
  );
}

function BumpRow({ bump, checked, onToggle }: { bump: OfferBump; checked: boolean; onToggle: () => void }) {
  const color = GRANT_COLORS[bump.grant.type];
  const Icon = GRANT_ICONS[bump.grant.type];
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "flex-start", gap: 10, padding: 13, borderRadius: 9,
        background: checked ? "var(--app-accent-soft)" : "var(--app-surface)",
        border: `1px solid ${checked ? "var(--app-accent-line)" : "var(--app-border)"}`,
        cursor: "pointer", textAlign: "left", width: "100%", fontFamily: "inherit",
      }}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ marginTop: 3, accentColor: "var(--app-accent)" }} onClick={e => e.stopPropagation()} />
      <span style={{
        width: 26, height: 26, borderRadius: 7, flexShrink: 0,
        background: `${color}1A`, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
      }}>
        <HugeiconsIcon icon={Icon} size={13} strokeWidth={1.8} color={color} />
      </span>
      <span style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)" }}>{bump.label}</p>
        <p style={{ ...monoStyle, fontSize: 12, color: "var(--app-text-muted)", marginTop: 2 }}>
          + {formatOfferPrice(bump.price_ngn)}{bump.recurring ? "/mo" : ""}
        </p>
      </span>
    </button>
  );
}
