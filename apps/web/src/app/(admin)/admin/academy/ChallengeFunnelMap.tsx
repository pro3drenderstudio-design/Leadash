"use client";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlusSignIcon,
  ArrowRight01Icon,
  ChartIcon,
  Award01Icon,
  BookOpen02Icon,
  Calendar03Icon,
  BoltIcon,
  Target02Icon,
} from "@hugeicons/core-free-icons";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FunnelStage {
  id: string;
  slug: string;
  name: string;
  product_type: string;
  pricing_type: string;
  price_ngn: number;
  is_published: boolean;
  enrolled: number;
  revenue_ngn: number;
}

interface FunnelTotals {
  total_revenue_ngn: number;
  paid_enrollments: number;
}

interface ChallengeFunnelMapProps {
  onOpenBuilder: (productId: string) => void;
  onToast: (msg: string) => void;
}

// Static Facebook Ads placeholder prepended before real stages
const FB_ADS_STAGE = {
  id: "__fb_ads__",
  name: "Facebook Ads",
  kind: "Traffic source",
  color: "#60A5FA",
  icon: Target02Icon,
  visitors: "—",
  revenue: null,
  isChallenge: false,
  isAd: true,
};

// ── Color helpers ─────────────────────────────────────────────────────────────

function stageColor(stage: FunnelStage, isLast: boolean): string {
  if (isLast) return "#FBBF24";
  if (stage.product_type === "challenge") return "#F97316";
  if (stage.pricing_type === "free" || stage.price_ngn === 0) return "#34D399";
  return "#60A5FA";
}

function stageIcon(stage: FunnelStage): typeof BookOpen02Icon {
  if (stage.product_type === "challenge") return Award01Icon;
  if (stage.product_type === "live") return Calendar03Icon;
  return BookOpen02Icon;
}

function stageKind(stage: FunnelStage): string {
  if (stage.product_type === "challenge") return "Challenge";
  if (stage.pricing_type === "free" || stage.price_ngn === 0) return "Free course";
  return "Paid course";
}

function fmtNgn(n: number): string {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`;
  return `₦${n.toLocaleString("en-NG")}`;
}

// ── Card style ────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--app-bg-elevated)",
  border: "1px solid var(--app-border)",
  borderRadius: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--app-text-quiet)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 600,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChallengeFunnelMap({ onOpenBuilder, onToast }: ChallengeFunnelMapProps) {
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [totals, setTotals] = useState<FunnelTotals | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/academy/funnel-map")
      .then(r => r.json())
      .then(d => {
        setStages(d.stages ?? []);
        setTotals(d.totals ?? null);
        if (d.stages?.length > 0) setSelected(d.stages[0].id);
      })
      .catch(() => onToast("Failed to load funnel map"))
      .finally(() => setLoading(false));
  }, [onToast]);

  const selectedStage = selected
    ? stages.find(s => s.id === selected) ?? null
    : null;

  const totalRevenue = totals?.total_revenue_ngn ?? 0;
  const paidEnrollments = totals?.paid_enrollments ?? 0;
  const totalEnrolled = stages.reduce((s, st) => s + st.enrolled, 0);

  // Compute conversion % between adjacent real stages
  function convPct(fromIdx: number): string {
    if (fromIdx >= stages.length - 1) return "";
    const from = stages[fromIdx];
    const to = stages[fromIdx + 1];
    if (!from.enrolled || !to.enrolled) return "—";
    return `${Math.round((to.enrolled / from.enrolled) * 100)}%`;
  }

  return (
    <div className="v2-app" style={{ color: "var(--app-text)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--app-text)", letterSpacing: "-0.01em" }}>
            Academy Acquisition Funnel
          </h2>
          <p style={{ fontSize: 13, color: "var(--app-text-muted)", marginTop: 6, lineHeight: 1.5 }}>
            Track how learners move from first ad click through to the Academy Package.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "5px 10px",
            borderRadius: 999,
            background: "var(--app-surface-strong)",
            border: "1px solid var(--app-border)",
            color: "var(--app-text-muted)",
          }}>Last 30 days</span>
          <button style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--app-accent)",
            color: "#fff",
            border: "none",
            borderRadius: 9,
            padding: "8px 14px",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}>
            <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
            Add step
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>Loading funnel…</div>
      ) : (
        <>
          {/* Pipeline: horizontal scroll */}
          <div style={{
            overflowX: "auto",
            paddingBottom: 12,
            marginBottom: 24,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 0, minWidth: "max-content", paddingBottom: 4 }}>
              {/* Facebook Ads placeholder */}
              <div>
                <FunnelCard
                  color={FB_ADS_STAGE.color}
                  icon={FB_ADS_STAGE.icon}
                  name={FB_ADS_STAGE.name}
                  kind={FB_ADS_STAGE.kind}
                  visitors="—"
                  revenue={null}
                  isChallenge={false}
                  isSelected={selected === FB_ADS_STAGE.id}
                  isPub={true}
                  onClick={() => setSelected(FB_ADS_STAGE.id)}
                />
              </div>

              {stages.map((stage, i) => {
                const isLast = i === stages.length - 1;
                const color = stageColor(stage, isLast);
                const Icon = stageIcon(stage);
                const isChallenge = stage.product_type === "challenge";
                const cv = i === 0 ? "—" : convPct(i - 1);

                return (
                  <div key={stage.id} style={{ display: "flex", alignItems: "center" }}>
                    {/* Conversion arrow (from previous) */}
                    <ConvArrow pct={cv} color={color} />
                    <FunnelCard
                      color={color}
                      icon={Icon}
                      name={stage.name}
                      kind={stageKind(stage)}
                      visitors={stage.enrolled.toLocaleString()}
                      revenue={stage.revenue_ngn > 0 ? fmtNgn(stage.revenue_ngn) : null}
                      isChallenge={isChallenge}
                      isSelected={selected === stage.id}
                      isPub={stage.is_published}
                      onClick={() => setSelected(stage.id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom two columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "start" }}>
            {/* LEFT: Inspector */}
            <div style={{ ...cardStyle, padding: 24 }}>
              {selected === FB_ADS_STAGE.id ? (
                <FbAdsInspector />
              ) : selectedStage ? (
                <StageInspector
                  stage={selectedStage}
                  stages={stages}
                  onOpenBuilder={onOpenBuilder}
                />
              ) : (
                <div style={{ padding: 24, textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>
                  Select a stage to inspect
                </div>
              )}
            </div>

            {/* RIGHT: Totals + drop-off */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Funnel totals */}
              <div style={{ ...cardStyle, padding: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Funnel totals
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {[
                    { label: "Ad → Package %", value: totalEnrolled > 0 ? "—" : "—", color: "var(--app-accent)" },
                    { label: "Total revenue",   value: fmtNgn(totalRevenue),          color: "var(--app-success)" },
                    { label: "ROAS",            value: "—",                            color: "var(--app-warning)" },
                    { label: "Paid enrollments", value: paidEnrollments.toLocaleString(), color: "var(--app-info)" },
                  ].map(t => (
                    <div key={t.label}>
                      <p style={{ ...labelStyle, marginBottom: 4 }}>{t.label}</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: t.color, fontVariantNumeric: "tabular-nums" }}>{t.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Biggest drop-off */}
              <div style={{ ...cardStyle, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(248,113,113,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <HugeiconsIcon icon={ChartIcon} size={15} strokeWidth={1.8} color="var(--app-danger)" />
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>Biggest drop-off</p>
                </div>
                {stages.length >= 2 ? (() => {
                  // Find stage with largest absolute drop in enrollments
                  let maxDrop = 0;
                  let dropFrom = stages[0];
                  let dropTo = stages[1];
                  for (let i = 0; i < stages.length - 1; i++) {
                    const drop = stages[i].enrolled - stages[i + 1].enrolled;
                    if (drop > maxDrop) { maxDrop = drop; dropFrom = stages[i]; dropTo = stages[i + 1]; }
                  }
                  const pct = dropFrom.enrolled > 0 ? Math.round((maxDrop / dropFrom.enrolled) * 100) : 0;
                  return (
                    <>
                      <p style={{ fontSize: 12, color: "var(--app-text-muted)", lineHeight: 1.5 }}>
                        The biggest leak is between <strong style={{ color: "var(--app-text)" }}>{dropFrom.name}</strong> and{" "}
                        <strong style={{ color: "var(--app-text)" }}>{dropTo.name}</strong> — {pct}% of learners do not continue.
                      </p>
                      <div style={{
                        marginTop: 12,
                        padding: "10px 12px",
                        background: "rgba(248,113,113,0.06)",
                        border: "1px solid rgba(248,113,113,0.15)",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "var(--app-danger)",
                      }}>
                        {maxDrop.toLocaleString()} learners lost ({pct}% drop)
                      </div>
                    </>
                  );
                })() : (
                  <p style={{ fontSize: 12, color: "var(--app-text-quiet)" }}>Not enough data yet.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── FunnelCard ────────────────────────────────────────────────────────────────

function FunnelCard({
  color, icon: Icon, name, kind, visitors, revenue, isChallenge, isSelected, isPub, onClick,
}: {
  color: string;
  icon: typeof BookOpen02Icon;
  name: string;
  kind: string;
  visitors: string;
  revenue: string | null;
  isChallenge: boolean;
  isSelected: boolean;
  isPub: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 212,
        flexShrink: 0,
        background: "var(--app-bg-elevated)",
        border: `1.5px solid ${isSelected ? color : "var(--app-border)"}`,
        borderRadius: 12,
        padding: 16,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        transition: "border-color 0.15s ease",
        position: "relative",
      }}
    >
      {/* Challenge badge */}
      {isChallenge && (
        <span style={{
          position: "absolute",
          top: 8,
          right: 8,
          fontSize: 9,
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: 999,
          background: "rgba(249,115,22,0.15)",
          color: "var(--app-accent)",
          border: "1px solid rgba(249,115,22,0.25)",
          letterSpacing: "0.06em",
        }}>THIS CHALLENGE</span>
      )}
      {/* Icon */}
      <div style={{
        width: 38,
        height: 38,
        borderRadius: 9,
        background: `${color}1a`,
        border: `1px solid ${color}33`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 12,
      }}>
        <HugeiconsIcon icon={Icon} size={18} strokeWidth={1.8} color={color} />
      </div>
      {/* Name */}
      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {name}
      </p>
      {/* Kind tag */}
      <p style={{ fontSize: 10, color: "var(--app-text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 12 }}>
        {kind}
      </p>
      {/* Visitor count */}
      <p style={{
        fontSize: 24,
        fontWeight: 800,
        color: "var(--app-text)",
        fontVariantNumeric: "tabular-nums",
        fontFamily: "ui-monospace, monospace",
        marginBottom: 2,
      }}>{visitors}</p>
      <p style={{ fontSize: 10, color: "var(--app-text-quiet)" }}>enrolled</p>
      {/* Revenue */}
      {revenue && (
        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--app-success)", marginTop: 8 }}>{revenue}</p>
      )}
      {/* Pub dot */}
      <div style={{ position: "absolute", bottom: 10, right: 12 }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: 9,
          color: isPub ? "var(--app-success)" : "var(--app-text-quiet)",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: isPub ? "var(--app-success)" : "var(--app-text-quiet)" }} />
          {isPub ? "Live" : "Draft"}
        </span>
      </div>
    </button>
  );
}

// ── ConvArrow ─────────────────────────────────────────────────────────────────

function ConvArrow({ pct, color }: { pct: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 6px", gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "ui-monospace, monospace" }}>{pct}</span>
      <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} color={color} />
    </div>
  );
}

// ── StageInspector ────────────────────────────────────────────────────────────

function StageInspector({
  stage, stages, onOpenBuilder,
}: {
  stage: FunnelStage;
  stages: FunnelStage[];
  onOpenBuilder: (id: string) => void;
}) {
  const Icon = stageIcon(stage);
  const isLast = stages[stages.length - 1]?.id === stage.id;
  const color = stageColor(stage, isLast);
  const isChallenge = stage.product_type === "challenge";

  const currentIdx = stages.findIndex(s => s.id === stage.id);
  const nextStage = stages[currentIdx + 1] ?? null;
  const continueToNextPct = nextStage && stage.enrolled > 0
    ? Math.round((nextStage.enrolled / stage.enrolled) * 100)
    : null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: `${color}1a`,
          border: `1px solid ${color}33`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <HugeiconsIcon icon={Icon} size={20} strokeWidth={1.8} color={color} />
        </div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--app-text)" }}>{stage.name}</p>
          <p style={{ fontSize: 11, color: "var(--app-text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{stageKind(stage)}</p>
        </div>
      </div>

      {/* Action buttons */}
      {isChallenge ? (
        <button
          onClick={() => onOpenBuilder(stage.id)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--app-accent)",
            color: "#fff",
            border: "none",
            borderRadius: 9,
            padding: "8px 14px",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
            marginBottom: 20,
          }}
        >
          <HugeiconsIcon icon={BoltIcon} size={13} strokeWidth={2} />
          Open challenge builder
        </button>
      ) : (
        <button
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--app-surface-strong)",
            border: "1px solid var(--app-border-strong)",
            color: "var(--app-text)",
            borderRadius: 9,
            padding: "7px 12px",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            marginBottom: 20,
          }}
        >
          Edit step
        </button>
      )}

      {/* Stats */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {[
          { label: "Enrolled / Reach",  value: stage.enrolled.toLocaleString() },
          { label: "Continue to next",  value: continueToNextPct !== null ? `${continueToNextPct}%` : "Last stage" },
          { label: "Revenue",           value: stage.revenue_ngn > 0 ? fmtNgn(stage.revenue_ngn) : "—" },
        ].map((row, i) => (
          <div key={row.label} style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 0",
            borderBottom: i < 2 ? "1px solid var(--app-border)" : "none",
          }}>
            <span style={{ fontSize: 12, color: "var(--app-text-muted)" }}>{row.label}</span>
            <span style={{
              fontSize: 14,
              fontWeight: 700,
              color: row.label === "Revenue" && stage.revenue_ngn > 0
                ? "var(--app-success)"
                : "var(--app-text)",
              fontVariantNumeric: "tabular-nums",
            }}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* Note */}
      {!stage.is_published && (
        <div style={{
          marginTop: 16,
          padding: "10px 12px",
          background: "var(--app-warning-soft)",
          border: "1px solid rgba(251,191,36,0.2)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--app-warning)",
        }}>
          This stage is unpublished — it is not visible to learners yet.
        </div>
      )}
      {stage.price_ngn === 0 && (
        <p style={{ marginTop: 14, fontSize: 11, color: "var(--app-text-quiet)", lineHeight: 1.5 }}>
          This is a free entry point. No revenue is expected here — value is in downstream conversions.
        </p>
      )}
    </div>
  );
}

// ── FbAdsInspector ────────────────────────────────────────────────────────────

function FbAdsInspector() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "rgba(96,165,250,0.1)",
          border: "1px solid rgba(96,165,250,0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <HugeiconsIcon icon={Target02Icon} size={20} strokeWidth={1.8} color="#60A5FA" />
        </div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--app-text)" }}>Facebook Ads</p>
          <p style={{ fontSize: 11, color: "var(--app-text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>Traffic source</p>
        </div>
      </div>
      <p style={{ fontSize: 13, color: "var(--app-text-muted)", lineHeight: 1.6, marginBottom: 16 }}>
        Top-of-funnel traffic from paid Facebook and Instagram campaigns. Connect your Meta Ads account to see live impressions, clicks, and CPL data here.
      </p>
      <div style={{
        padding: "12px 14px",
        background: "rgba(96,165,250,0.06)",
        border: "1px solid rgba(96,165,250,0.15)",
        borderRadius: 8,
        fontSize: 12,
        color: "#60A5FA",
      }}>
        Meta Ads integration not connected — data is not available.
      </div>
    </div>
  );
}
