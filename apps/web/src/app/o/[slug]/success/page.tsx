"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle02Icon,
  Loading03Icon,
  AlertCircleIcon,
  Clock01Icon,
  UserGroupIcon,
  DashboardSpeed01Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import "@/v2-app/v2-app.css";
import {
  GRANT_COLORS,
  GRANT_LABELS,
  grantLine,
  formatOfferPrice,
  type Offer,
  type OfferPurchase,
  type GrantedItem,
  type CommunityGrant,
} from "@/types/offers";
import { GRANT_ICONS } from "@/app/(admin)/admin/offers/grantIcons";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PurchaseGetResponse {
  purchase: OfferPurchase;
  offer: Offer;
  error?: string;
}

interface UpsellPostResponse {
  ok?: boolean;
  downsell?: Offer["upsell"];
  error?: string;
}

type LoadState = "loading" | "polling" | "ready" | "timeout" | "not_found";
type UpsellStage = "upsell" | "downsell" | "resolved";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 7;

// ─── Style helpers ────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--app-bg-elevated)",
  border: "1px solid var(--app-border)",
  borderRadius: 12,
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

const pageBgStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "radial-gradient(ellipse at top, rgba(52,211,153,0.07), transparent 55%), var(--app-bg)",
  color: "var(--app-text)",
};

const spinKeyframes = `
  .offer-spin { animation: offerSpin 0.9s linear infinite; }
  @keyframes offerSpin { to { transform: rotate(360deg); } }
`;

function statusBadge(status: GrantedItem["status"]) {
  switch (status) {
    case "granted":
      return { label: "Active", color: "var(--app-success)", bg: "var(--app-success-soft)" };
    case "pending_manual":
      return { label: "Pending setup", color: "var(--app-warning)", bg: "var(--app-warning-soft)" };
    case "failed":
      return { label: "Issue — contact support", color: "var(--app-danger)", bg: "var(--app-danger-soft)" };
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OfferSuccessPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const purchaseId = searchParams.get("purchase_id");

  const [state, setState] = useState<LoadState>("loading");
  const [purchase, setPurchase] = useState<OfferPurchase | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!slug || !purchaseId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch(`/api/offers/${slug}/purchase/${purchaseId}`);
        if (!res.ok) {
          if (!cancelled) setState("not_found");
          return;
        }
        const data: PurchaseGetResponse = await res.json();
        if (cancelled) return;

        setPurchase(data.purchase);
        setOffer(data.offer);

        if (data.purchase.status === "paid" || data.purchase.status === "failed" || data.purchase.status === "refunded") {
          setState("ready");
          return;
        }

        // status is 'pending' — keep polling
        attemptsRef.current += 1;
        if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
          setState("timeout");
          return;
        }
        setState("polling");
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (!cancelled) setState("not_found");
      }
    }
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [slug, purchaseId]);

  const missingParams = !slug || !purchaseId;

  if (!missingParams && (state === "loading" || state === "polling")) {
    return (
      <div className="v2-app" style={pageBgStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 16, textAlign: "center", padding: 24 }}>
          <HugeiconsIcon icon={Loading03Icon} size={28} strokeWidth={1.8} color="var(--app-text-quiet)" className="offer-spin" />
          <p style={{ fontSize: 14.5, fontWeight: 600, color: "var(--app-text)" }}>Confirming your payment…</p>
          <p style={{ fontSize: 12.5, color: "var(--app-text-muted)", maxWidth: 320 }}>
            This usually takes just a couple of seconds.
          </p>
        </div>
        <style>{spinKeyframes}</style>
      </div>
    );
  }

  if (missingParams || state === "not_found") {
    return (
      <div className="v2-app" style={pageBgStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 14, textAlign: "center", padding: 24 }}>
          <HugeiconsIcon icon={AlertCircleIcon} size={32} strokeWidth={1.6} color="var(--app-text-quiet)" />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text)" }}>Purchase not found</h1>
          <p style={{ fontSize: 13.5, color: "var(--app-text-muted)" }}>We couldn&apos;t find this order. Check your email for a receipt or contact support.</p>
          <Link href="/" style={{ color: "var(--app-accent)", fontSize: 13.5, fontWeight: 600, textDecoration: "none" }}>
            ← Back to Leadash
          </Link>
        </div>
      </div>
    );
  }

  if (state === "timeout") {
    return (
      <div className="v2-app" style={pageBgStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 14, textAlign: "center", padding: 24 }}>
          <HugeiconsIcon icon={Clock01Icon} size={32} strokeWidth={1.6} color="var(--app-warning)" />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text)" }}>Still processing</h1>
          <p style={{ fontSize: 13.5, color: "var(--app-text-muted)", maxWidth: 380 }}>
            Your payment is still processing — this can take a minute. Refresh this page or check your email for confirmation.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ ...primaryButtonStyle, padding: "10px 20px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={2} />
            Refresh
          </button>
        </div>
      </div>
    );
  }

  if (!purchase || !offer) return null;

  if (purchase.status === "failed") {
    return (
      <div className="v2-app" style={pageBgStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 14, textAlign: "center", padding: 24 }}>
          <HugeiconsIcon icon={AlertCircleIcon} size={32} strokeWidth={1.6} color="var(--app-danger)" />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text)" }}>Payment failed</h1>
          <p style={{ fontSize: 13.5, color: "var(--app-text-muted)", maxWidth: 360 }}>
            Your payment didn&apos;t go through. No charge was completed. You can try again below.
          </p>
          <Link href={`/o/${slug}`} style={{ ...primaryButtonStyle, padding: "10px 22px", fontSize: 13.5, textDecoration: "none", display: "inline-block" }}>
            Try again
          </Link>
        </div>
      </div>
    );
  }

  if (purchase.status === "refunded") {
    return (
      <div className="v2-app" style={pageBgStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 14, textAlign: "center", padding: 24 }}>
          <HugeiconsIcon icon={AlertCircleIcon} size={32} strokeWidth={1.6} color="var(--app-text-quiet)" />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text)" }}>This order was refunded</h1>
          <p style={{ fontSize: 13.5, color: "var(--app-text-muted)", maxWidth: 360 }}>
            This purchase has been refunded and access has been removed. Contact support@leadash.com if you have questions.
          </p>
          <Link href="/" style={{ color: "var(--app-accent)", fontSize: 13.5, fontWeight: 600, textDecoration: "none" }}>
            ← Back to Leadash
          </Link>
        </div>
      </div>
    );
  }

  // status === 'paid'
  return <PaidConfirmation slug={slug} purchase={purchase} offer={offer} />;
}

// ─── Paid confirmation (with upsell interstitial) ─────────────────────────────

function PaidConfirmation({ slug, purchase, offer }: { slug: string; purchase: OfferPurchase; offer: Offer }) {
  const [localPurchase, setLocalPurchase] = useState(purchase);
  const localOffer = offer;
  const [stage, setStage] = useState<UpsellStage>(() => {
    if (localPurchase.upsell_status === null && localOffer.upsell?.is_active) return "upsell";
    return "resolved";
  });
  const [downsell, setDownsell] = useState<Offer["downsell"] | null>(null);
  const [upsellBusy, setUpsellBusy] = useState(false);
  const [upsellError, setUpsellError] = useState("");
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setIsAuthed(!!data.user);
    }).catch(() => setIsAuthed(false));
  }, []);

  async function respondToOffer(stageArg: "upsell" | "downsell", accept: boolean) {
    setUpsellBusy(true);
    setUpsellError("");
    try {
      const res = await fetch(`/api/offers/${slug}/upsell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase_id: localPurchase.id, accept, stage: stageArg }),
      });
      const data: UpsellPostResponse = await res.json();
      if (!res.ok || data.error) {
        setUpsellError(data.error ?? "Something went wrong. Please try again.");
        setUpsellBusy(false);
        return;
      }

      if (accept) {
        // Re-fetch the purchase so granted_items / total reflect the new state.
        const refreshed = await fetch(`/api/offers/${slug}/purchase/${localPurchase.id}`);
        if (refreshed.ok) {
          const refreshedData: PurchaseGetResponse = await refreshed.json();
          setLocalPurchase(refreshedData.purchase);
        }
        setStage("resolved");
      } else if (stageArg === "upsell" && data.downsell) {
        setDownsell(data.downsell);
        setStage("downsell");
      } else {
        setStage("resolved");
      }
    } catch {
      setUpsellError("Network error. Please try again.");
    } finally {
      setUpsellBusy(false);
    }
  }

  if (stage === "upsell" && localOffer.upsell) {
    return (
      <UpsellInterstitial
        title={localOffer.upsell.label}
        description={localOffer.upsell.description}
        price={localOffer.upsell.price_ngn}
        busy={upsellBusy}
        error={upsellError}
        onAccept={() => respondToOffer("upsell", true)}
        onDecline={() => respondToOffer("upsell", false)}
      />
    );
  }

  if (stage === "downsell" && downsell) {
    return (
      <UpsellInterstitial
        title={downsell.label}
        description={downsell.description}
        price={downsell.price_ngn}
        busy={upsellBusy}
        error={upsellError}
        onAccept={() => respondToOffer("downsell", true)}
        onDecline={() => respondToOffer("downsell", false)}
      />
    );
  }

  return <ConfirmationView purchase={localPurchase} offer={localOffer} isAuthed={isAuthed} />;
}

function UpsellInterstitial({
  title, description, price, busy, error, onAccept, onDecline,
}: {
  title: string; description: string; price: number; busy: boolean; error: string;
  onAccept: () => void; onDecline: () => void;
}) {
  return (
    <div className="v2-app" style={pageBgStyle}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "60px 24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 22 }}>
        <div style={{ textAlign: "center" }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: "var(--app-accent)", background: "var(--app-accent-soft)",
            border: "1px solid var(--app-accent-line)", padding: "4px 12px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            Before you go — one quick thing
          </span>
        </div>
        <div style={{ ...cardStyle, padding: 28, width: "100%", display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--app-text)" }}>{title}</h2>
          <p style={{ fontSize: 14, color: "var(--app-text-muted)", lineHeight: 1.6 }}>{description}</p>
          <p style={{ ...monoStyle, fontSize: 26, fontWeight: 800, color: "var(--app-accent)" }}>{formatOfferPrice(price)}</p>
          {error && (
            <p style={{ fontSize: 12.5, color: "var(--app-danger)", background: "var(--app-danger-soft)", borderRadius: 8, padding: "9px 12px" }}>
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            style={{
              ...primaryButtonStyle, width: "100%", padding: "14px 0", fontSize: 14.5,
              opacity: busy ? 0.7 : 1, cursor: busy ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {busy && <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="offer-spin" />}
            Yes, add this — {formatOfferPrice(price)}
          </button>
          <button
            type="button"
            onClick={onDecline}
            disabled={busy}
            style={{
              background: "transparent", border: "none", color: "var(--app-text-quiet)",
              fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit",
              padding: "4px 0",
            }}
          >
            No thanks
          </button>
        </div>
      </div>
      <style>{spinKeyframes}</style>
    </div>
  );
}

// ─── Final confirmation view ───────────────────────────────────────────────────

function ConfirmationView({ purchase, offer, isAuthed }: { purchase: OfferPurchase; offer: Offer; isAuthed: boolean | null }) {
  const firstName = (purchase.buyer_name ?? "").split(" ")[0] || "there";
  const hasPendingManual = purchase.granted_items.some(gi => gi.status === "pending_manual");
  const orderNumber = purchase.id.slice(0, 8).toUpperCase();

  const communityGrant = offer.grants.find(g => g.type === "community") as CommunityGrant | undefined;
  const hasCommunityGrant = purchase.granted_items.some(gi => gi.type === "community") && communityGrant?.inviteUrl;
  const hasInboxGrant = purchase.granted_items.some(gi => gi.type === "inbox");

  // Bump line items don't carry a grant_id back-reference, so we can't map them
  // 1:1 to a granted_items status. Every fulfilled grant (including bump grants)
  // produces its own granted_items entry, so a bump only needs its own row here
  // when the number of granted items is too low to plausibly cover it — in that
  // case we show it with a neutral "Included" badge rather than guessing Active.
  const bumpLineItems = purchase.line_items.filter(li => li.kind === "bump");
  const unmatchedBumpCount = Math.max(0, bumpLineItems.length - Math.max(0, purchase.granted_items.length - offer.grants.length));

  const dashboardHref = isAuthed ? "/dashboard" : "/login";
  const inboxSetupHref = isAuthed ? "/inboxes/new" : "/login?redirect=/inboxes/new";
  const quickLinkCount = (hasInboxGrant ? 1 : 0) + (hasCommunityGrant ? 1 : 0) + 1;

  return (
    <div className="v2-app" style={pageBgStyle}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "60px 24px 80px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, marginBottom: 36 }}>
          <span style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(52,211,153,0.25), rgba(52,211,153,0.05))",
            border: "1px solid rgba(52,211,153,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={30} strokeWidth={1.8} color="var(--app-success)" />
          </span>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--app-text)" }}>
            You&apos;re all set, {firstName} 🎉
          </h1>
          <p style={{ fontSize: 14, color: "var(--app-text-muted)", maxWidth: 440, lineHeight: 1.6 }}>
            Payment received. Everything below is already active in your Leadash workspace.
            {hasPendingManual && " A couple of items need a quick manual setup step from our team — we'll follow up shortly."}
          </p>
          <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)" }}>
            Receipt sent to {purchase.buyer_email} · Order #{orderNumber}
          </p>
        </div>

        <div style={{ ...cardStyle, padding: 22, marginBottom: 24 }}>
          <h2 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 16, color: "var(--app-text)" }}>What you unlocked</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {purchase.granted_items.map(gi => {
              const grant = offer.grants.find(g => g.id === gi.grant_id) ?? offer.upsell?.grant ?? null;
              const label = GRANT_LABELS[gi.type];
              const color = GRANT_COLORS[gi.type];
              const Icon = GRANT_ICONS[gi.type];
              const badge = statusBadge(gi.status);
              return (
                <div key={gi.grant_id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: `${color}1A`, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <HugeiconsIcon icon={Icon} size={16} strokeWidth={1.8} color={color} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--app-text)" }}>{label}</p>
                    <p style={{ fontSize: 12.5, color: "var(--app-text-muted)", marginTop: 1 }}>
                      {grant ? grantLine(grant) : (gi.detail ?? "")}
                    </p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: badge.color, background: badge.bg, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
                    {badge.label}
                  </span>
                </div>
              );
            })}

            {bumpLineItems.slice(0, unmatchedBumpCount).map((li, idx) => {
              return (
                <div key={`bump-${idx}`} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: "var(--app-surface-strong)", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.8} color="var(--app-text-quiet)" />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--app-text)" }}>{li.label}</p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface-strong)", padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
                    Included
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${quickLinkCount}, 1fr)`, gap: 14, marginBottom: 32 }}>
          {hasInboxGrant && (
            <Link
              href={inboxSetupHref}
              style={{
                ...cardStyle, padding: 18, textDecoration: "none", display: "flex", flexDirection: "column", gap: 8,
                border: "1px solid var(--app-accent-line, rgba(52,211,153,0.35))",
              }}
            >
              <HugeiconsIcon icon={GRANT_ICONS.inbox} size={20} strokeWidth={1.6} color="var(--app-accent)" />
              <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--app-text)" }}>Set up your inboxes</p>
              <p style={{ fontSize: 12, color: "var(--app-text-muted)" }}>
                {isAuthed ? "Buy or connect a domain, then add inboxes" : "Sign in to start setting them up"}
              </p>
            </Link>
          )}
          {hasCommunityGrant && communityGrant && (
            <a
              href={communityGrant.inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...cardStyle, padding: 18, textDecoration: "none", display: "flex", flexDirection: "column", gap: 8 }}
            >
              <HugeiconsIcon icon={UserGroupIcon} size={20} strokeWidth={1.6} color="var(--app-success)" />
              <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--app-text)" }}>Join the community</p>
              <p style={{ fontSize: 12, color: "var(--app-text-muted)" }}>{communityGrant.label || "Connect with other members"}</p>
            </a>
          )}
          <Link
            href={dashboardHref}
            style={{ ...cardStyle, padding: 18, textDecoration: "none", display: "flex", flexDirection: "column", gap: 8 }}
          >
            <HugeiconsIcon icon={DashboardSpeed01Icon} size={20} strokeWidth={1.6} color="var(--app-accent)" />
            <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--app-text)" }}>Go to dashboard</p>
            <p style={{ fontSize: 12, color: "var(--app-text-muted)" }}>
              {isAuthed ? "Jump straight into your workspace" : "Sign in to access your workspace"}
            </p>
          </Link>
        </div>

        <div style={{ textAlign: "center" }}>
          {isAuthed ? (
            <Link
              href="/dashboard"
              style={{ ...primaryButtonStyle, padding: "14px 32px", fontSize: 14.5, textDecoration: "none", display: "inline-block" }}
            >
              Enter Leadash →
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                style={{ ...primaryButtonStyle, padding: "14px 32px", fontSize: 14.5, textDecoration: "none", display: "inline-block" }}
              >
                Enter Leadash →
              </Link>
              <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: 12 }}>
                Check your email for a login link, or sign in below.
              </p>
            </>
          )}
        </div>

        <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--app-text-quiet)", marginTop: 28 }}>
          Need help? <a href="mailto:support@leadash.com" style={{ color: "var(--app-text-muted)" }}>support@leadash.com</a>
        </p>
      </div>
      <style>{spinKeyframes}</style>
    </div>
  );
}
