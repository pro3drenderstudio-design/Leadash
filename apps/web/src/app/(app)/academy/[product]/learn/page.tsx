"use client";
import "@/v2-app/v2-app.css";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { wsGet, wsPost } from "@/lib/workspace/client";
import type { SectionWithLessons, AcademyEnrollment, AcademyCohort } from "@/types/academy";
import { lessonDuration } from "@/types/academy";

// ─── Challenge types ──────────────────────────────────────────────────────────

interface ChallengeConfig {
  duration_days?: number;
  week_titles?: string[];
  auto_advance_offer?: {
    enabled?: boolean;
    trigger?: string;
    trigger_day?: number;
    window_hours?: number;
    target_product_id?: string;
    discount_type?: string;
    discount_value?: number;
  };
}

interface ChallengeTask {
  id: string;
  day: number;
  task_type: string;
  title: string;
  points: number;
  is_published: boolean;
  unlocked: boolean;
  completed: boolean;
}

interface ChallengeState {
  product: { id: string; name: string; challenge_config: ChallengeConfig | null; slug: string };
  enrollment: { id: string; enrolled_at: string };
  cohort: { name: string; starts_at: string } | null;
  gamification: {
    points: number;
    streak_days: number;
    last_active_date: string | null;
    reported_earnings_cents: number;
    grace_days_used: number;
  };
  tasks: ChallengeTask[];
  days_completed: number[];
  offer_unlocked: boolean;
}

// Task accent colors
const TASK_COLORS: Record<string, string> = {
  lesson:     "#60A5FA",
  proof:      "#F97316",
  self_check: "#34D399",
  metric:     "#A78BFA",
  live:       "#F472B6",
  quiz:       "#FBBF24",
};

function taskColor(type: string) {
  return TASK_COLORS[type] ?? "#9A9AA8";
}

function weekTitle(weekNum: number, cfg: ChallengeConfig | null): string {
  const titles = cfg?.week_titles;
  if (titles && titles[weekNum - 1]) return titles[weekNum - 1];
  const defaults = ["Foundation", "Outreach blitz", "Close & deliver", "Scale & retain"];
  return defaults[weekNum - 1] ?? `Week ${weekNum}`;
}

// ─── Progress Ring ────────────────────────────────────────────────────────────

function Ring({ pct, size = 80, stroke = 7, color = "var(--app-accent)" }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct, 1));
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease" }} />
    </svg>
  );
}

// ─── Revenue Modal ────────────────────────────────────────────────────────────

function RevenueModal({ productId, onClose, onLogged }: { productId: string; onClose: () => void; onLogged: (cents: number) => void }) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    const dollars = parseFloat(amount);
    if (isNaN(dollars) || dollars <= 0) { setError("Enter a valid dollar amount"); return; }
    setSubmitting(true);
    setError("");
    try {
      await wsPost("/api/academy/report-earnings", { product_id: productId, amount_cents: Math.round(dollars * 100), notes });
      onLogged(Math.round(dollars * 100));
      onClose();
    } catch {
      setError("Failed to log revenue. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(7,7,10,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
      <div style={{ background: "var(--app-bg-elevated)", border: "1px solid var(--app-border-strong)", borderRadius: "var(--app-radius-lg)", padding: "28px 24px", width: "100%", maxWidth: 400 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--app-text)", marginBottom: 6 }}>Log revenue</h3>
        <p style={{ fontSize: 13, color: "var(--app-text-muted)", marginBottom: 20 }}>Report dollars you&apos;ve earned this challenge. All amounts are verified with proof.</p>
        <label style={{ display: "block", fontSize: 12, color: "var(--app-text-muted)", marginBottom: 6 }}>Amount (USD $)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="e.g. 150"
          style={{ width: "100%", background: "var(--app-surface)", border: "1px solid var(--app-border-strong)", borderRadius: "var(--app-radius)", padding: "10px 12px", color: "var(--app-text)", fontSize: 14, marginBottom: 14, boxSizing: "border-box" }}
        />
        <label style={{ display: "block", fontSize: 12, color: "var(--app-text-muted)", marginBottom: 6 }}>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="What did you close? Client type, deal details..."
          rows={3}
          style={{ width: "100%", background: "var(--app-surface)", border: "1px solid var(--app-border-strong)", borderRadius: "var(--app-radius)", padding: "10px 12px", color: "var(--app-text)", fontSize: 13, marginBottom: 16, resize: "vertical", boxSizing: "border-box" }}
        />
        {error && <p style={{ fontSize: 12, color: "var(--app-danger)", marginBottom: 12 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius)", padding: "10px", color: "var(--app-text-muted)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={submitting}
            style={{ flex: 1, background: "var(--app-accent)", border: "none", borderRadius: "var(--app-radius)", padding: "10px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1 }}>
            {submitting ? "Logging…" : "Log revenue"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Challenge Dashboard ──────────────────────────────────────────────────────

function ChallengeDashboard({ slug }: { slug: string }) {
  const [state, setState] = useState<ChallengeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRevenueModal, setShowRevenueModal] = useState(false);

  const load = useCallback(() => {
    wsGet<ChallengeState>(`/api/academy/challenge?product_slug=${slug}`)
      .then(d => setState(d))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--app-text-muted)", fontSize: 13 }}>Loading…</div>
    </div>
  );
  if (!state) return (
    <div style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--app-text-muted)" }}>Challenge not found or not enrolled.</div>
    </div>
  );

  // A learner who hasn't completed a single task yet has no academy_gamification
  // row at all (it's created lazily on first completion) — default it so the
  // dashboard renders a normal "0 points / day 1" state instead of crashing.
  const gam = state.gamification ?? { points: 0, streak_days: 0, last_active_date: null, reported_earnings_cents: 0, grace_days_used: 0 };

  const cfg = state.product.challenge_config;
  const totalDays = cfg?.duration_days ?? 30;
  const currentDay = state.days_completed.length > 0 ? Math.max(...state.days_completed) + 1 : 1;
  const cappedDay = Math.min(currentDay, totalDays);
  const weekNum = Math.ceil(cappedDay / 7);
  const pctComplete = Math.round((state.days_completed.length / totalDays) * 100);
  const daysToGrad = totalDays - state.days_completed.length;
  const graceLeft = 2 - (gam.grace_days_used ?? 0);

  // Tasks for today
  const todayTasks = state.tasks.filter(t => t.day === cappedDay);
  const todayPoints = todayTasks.reduce((a, t) => a + t.points, 0);

  // Reported earnings
  const earnedDollars = (gam.reported_earnings_cents ?? 0) / 100;
  const earnPct = Math.min((gam.reported_earnings_cents ?? 0) / 250000, 1);

  // Current week days (7 days starting from week start)
  const weekStart = (weekNum - 1) * 7 + 1;
  const weekDays = Array.from({ length: 7 }, (_, i) => weekStart + i).filter(d => d <= totalDays);

  // ── Pre-live cohort gate ──────────────────────────────────────────────────
  // Cohort-based challenges are locked until their cohort goes live. Show a
  // "your cohort starts on <date>" holding screen instead of an empty grid.
  const cohortStart = state.cohort?.starts_at ? new Date(state.cohort.starts_at) : null;
  if (cohortStart && cohortStart.getTime() > Date.now()) {
    const goLive = cohortStart.toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
      timeZone: "Africa/Lagos", timeZoneName: "short",
    });
    return (
      <div style={{ minHeight: "100vh", background: "var(--app-bg)", padding: "24px 22px 90px" }}>
        <div style={{ maxWidth: 620, margin: "48px auto 0", textAlign: "center" }}>
          <div style={{ fontSize: 52, marginBottom: 18 }}>🚀</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--app-text)", marginBottom: 10 }}>
            You&apos;re in! Your cohort starts soon
          </h1>
          <p style={{ fontSize: 15, color: "var(--app-text-muted)", lineHeight: 1.6, marginBottom: 24 }}>
            {state.cohort?.name ? `${state.cohort.name} · ` : ""}Day&nbsp;1 unlocks <strong style={{ color: "var(--app-text)" }}>{goLive}</strong>. We&apos;ll open the challenge live then — make sure you&apos;ve joined the WhatsApp group so you don&apos;t miss the kickoff.
          </p>
          <div style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.16), rgba(14,14,19,0.4))", border: "1px solid rgba(249,115,22,0.28)", borderRadius: "var(--app-radius-lg)", padding: "22px 20px", textAlign: "left" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>While you wait</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: "var(--app-text)", lineHeight: 1.9 }}>
              <li>Set up your Leadash workspace — connect an inbox and build your first sequence.</li>
              <li>Every action you take now counts toward the cohort leaderboard once it goes live.</li>
              <li>The winner gets the $10k Academy + ₦50,000 cash. Come ready.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--app-bg)", padding: "24px 22px 90px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>

        {/* Greeting */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--app-text)", marginBottom: 6 }}>Welcome back 👋</h1>
          <p style={{ fontSize: 14, color: "var(--app-text-muted)" }}>
            Day {cappedDay} of your $0 → $2,500 sprint. Let&apos;s keep it moving.
          </p>
        </div>

        {/* Today's task hero */}
        <div style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.16), rgba(14,14,19,0.4))", border: "1px solid rgba(249,115,22,0.28)", borderRadius: "var(--app-radius-lg)", padding: "24px 22px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ background: "var(--app-accent)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>Today · Day {cappedDay}</span>
            <span style={{ fontSize: 13, color: "var(--app-text-muted)" }}>Week {weekNum} · {weekTitle(weekNum, cfg)}</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--app-text)", marginBottom: 12 }}>
            {todayTasks[0]?.title ?? `Day ${cappedDay} tasks`}
          </h2>
          {todayTasks.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {todayTasks.map(t => (
                <span key={t.id} style={{ fontSize: 11, fontWeight: 600, color: taskColor(t.task_type), background: taskColor(t.task_type) + "18", border: `1px solid ${taskColor(t.task_type)}40`, padding: "3px 9px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {t.task_type.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link href={`/academy/${slug}/day/${cappedDay}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--app-accent)", color: "#fff", fontWeight: 700, fontSize: 14, padding: "10px 20px", borderRadius: "var(--app-radius)", textDecoration: "none" }}>
              Start today&apos;s task →
            </Link>
            <span style={{ fontSize: 12, color: "var(--app-text-muted)" }}>+{todayPoints} points · keep your streak alive</span>
          </div>
        </div>

        {/* 3 stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
          {/* Progress ring */}
          <div style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius-lg)", padding: "20px 18px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <Ring pct={pctComplete / 100} size={80} color="var(--app-accent)" />
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: "var(--app-text)" }}>{pctComplete}%</span>
              </div>
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)", marginBottom: 2 }}>Day {cappedDay} / {totalDays}</p>
            <p style={{ fontSize: 12, color: "var(--app-text-muted)" }}>{daysToGrad} days to graduate</p>
          </div>

          {/* Streak */}
          <div style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius-lg)", padding: "20px 18px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>🔥</div>
            <p style={{ fontSize: 28, fontWeight: 800, color: "#F97316", marginBottom: 2 }}>{gam.streak_days}</p>
            <p style={{ fontSize: 12, color: "var(--app-text-muted)", marginBottom: 4 }}>day streak</p>
            <p style={{ fontSize: 11, color: graceLeft > 0 ? "var(--app-warning)" : "var(--app-danger)" }}>
              {graceLeft} grace day{graceLeft !== 1 ? "s" : ""} left
            </p>
          </div>

          {/* Points */}
          <div style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius-lg)", padding: "20px 18px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <p style={{ fontSize: 28, fontWeight: 800, color: "#A78BFA", marginBottom: 2 }}>{gam.points.toLocaleString()}</p>
            <p style={{ fontSize: 12, color: "var(--app-text-muted)", marginBottom: 6 }}>points earned</p>
            <Link href={`/academy/${slug}/leaderboard`}
              style={{ fontSize: 12, color: "#60A5FA", textDecoration: "none" }}>
              View leaderboard →
            </Link>
          </div>
        </div>

        {/* Revenue reported */}
        <div style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius-lg)", padding: "18px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ width: 40, height: 40, borderRadius: "var(--app-radius)", background: "rgba(52,211,153,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>💵</div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)", marginBottom: 2 }}>Revenue reported</p>
            <p style={{ fontSize: 11, color: "var(--app-text-muted)", marginBottom: 8 }}>Goal: $2,500 by Day {totalDays}</p>
            <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden", marginBottom: 4 }}>
              <div style={{ height: "100%", width: `${earnPct * 100}%`, background: "#34D399", borderRadius: 999, transition: "width 0.6s ease" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "#34D399", fontWeight: 600 }}>${earnedDollars.toFixed(0)}</span>
              <span style={{ fontSize: 12, color: "var(--app-text-muted)" }}>$2,500</span>
            </div>
          </div>
          <button
            onClick={() => setShowRevenueModal(true)}
            style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "#34D399", fontWeight: 600, fontSize: 12, padding: "8px 14px", borderRadius: "var(--app-radius)", cursor: "pointer", flexShrink: 0 }}>
            + Log revenue
          </button>
        </div>

        {/* This week */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>This week · Week {weekNum}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {weekDays.map(day => {
              const isDone = state.days_completed.includes(day);
              const isToday = day === cappedDay;
              const dayTasks = state.tasks.filter(t => t.day === day);
              const dayPoints = dayTasks.reduce((a, t) => a + t.points, 0);
              const isLocked = day > cappedDay && !dayTasks.some(t => t.unlocked);

              return (
                <div key={day}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    background: isToday ? "rgba(249,115,22,0.08)" : "var(--app-surface)",
                    border: isToday ? "1px solid rgba(249,115,22,0.25)" : "1px solid var(--app-border)",
                    borderRadius: "var(--app-radius)",
                    padding: "10px 14px",
                    opacity: isLocked ? 0.45 : 1,
                    cursor: isLocked ? "default" : "pointer",
                    textDecoration: "none",
                  }}
                  onClick={() => { if (!isLocked) window.location.href = `/academy/${slug}/day/${day}`; }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0 }}>
                    {isDone ? "✅" : isLocked ? "🔒" : isToday ? "▶" : "○"}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: isToday ? 600 : 400, color: isToday ? "var(--app-text)" : isDone ? "#34D399" : "var(--app-text-muted)" }}>
                    Day {day}
                  </span>
                  <span style={{ fontSize: 12, color: isDone ? "#34D399" : "var(--app-text-quiet)", fontWeight: isDone ? 600 : 400 }}>
                    +{dayPoints} pts
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Academy Package offer teaser */}
        {state.offer_unlocked && (() => {
          const offerCfg = cfg?.auto_advance_offer;
          const discountText = offerCfg?.discount_type === "percent"
            ? `${offerCfg.discount_value}% off`
            : offerCfg?.discount_value
              ? `₦${offerCfg.discount_value.toLocaleString()} off`
              : "A special discount";
          const targetSlug = offerCfg?.target_product_id || "academy";
          return (
            <div style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(14,14,19,0.5))", border: "1px solid rgba(251,191,36,0.30)", borderRadius: "var(--app-radius-lg)", padding: "20px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 24, flexShrink: 0 }}>🎁</span>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--app-warning)", marginBottom: 2 }}>Your Academy Package offer is unlocked!</p>
                <p style={{ fontSize: 12, color: "var(--app-text-muted)" }}>{discountText} for challengers · limited time</p>
              </div>
              <Link href={`/academy/${targetSlug}`}
                style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)", color: "var(--app-warning)", fontWeight: 600, fontSize: 12, padding: "9px 16px", borderRadius: "var(--app-radius)", textDecoration: "none", flexShrink: 0 }}>
                See offer →
              </Link>
            </div>
          );
        })()}
      </div>

      {/* Revenue modal */}
      {showRevenueModal && (
        <RevenueModal
          productId={state.product.id}
          onClose={() => setShowRevenueModal(false)}
          onLogged={(cents) => {
            setState(prev => {
              if (!prev) return prev;
              const prevGam = prev.gamification ?? { points: 0, streak_days: 0, last_active_date: null, reported_earnings_cents: 0, grace_days_used: 0 };
              return {
                ...prev,
                gamification: { ...prevGam, reported_earnings_cents: (prevGam.reported_earnings_cents ?? 0) + cents },
              };
            });
          }}
        />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CourseDashboard() {
  const { product: slug } = useParams<{ product: string }>();
  const router = useRouter();

  // Detect product type first
  const [productType, setProductType] = useState<string | null>(null);
  const [sections,   setSections]   = useState<SectionWithLessons[]>([]);
  const [enrollment, setEnrollment] = useState<AcademyEnrollment | null>(null);
  const [cohort,     setCohort]     = useState<AcademyCohort | null>(null);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    // Peek at the product type via the products list
    wsGet<{ products: Array<{ slug: string; id: string; product_type?: string }> }>("/api/academy/products")
      .then(d => {
        const p = d.products.find(x => x.slug === slug || x.id === slug);
        if (p?.product_type === "challenge") {
          setProductType("challenge");
          setLoading(false);
          return;
        }
        setProductType("course");
        // Load course lessons
        return wsGet<{ sections: SectionWithLessons[]; enrollment: AcademyEnrollment | null; cohort: AcademyCohort | null }>(
          `/api/academy/lessons?product_id=${slug}`
        ).then(d2 => {
          setSections(d2.sections ?? []);
          setEnrollment(d2.enrollment ?? null);
          setCohort(d2.cohort ?? null);
          if (!d2.enrollment) router.replace(`/academy/${slug}`);
        });
      })
      .finally(() => setLoading(false));
  }, [slug, router]);

  if (loading) return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="text-white/40 text-sm">Loading…</div>
    </div>
  );

  // Challenge: delegate to ChallengeDashboard
  if (productType === "challenge") {
    return (
      <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)" }}>
        <ChallengeDashboard slug={slug} />
      </div>
    );
  }

  if (!enrollment) return null;

  // ── Course curriculum page (existing) ─────────────────────────────────────

  const allLessons   = sections.flatMap(s => s.lessons);
  const completed    = allLessons.filter(l => l.completed).length;
  const total        = allLessons.length;
  const pct          = total ? Math.round((completed / total) * 100) : 0;
  const resumeLesson = allLessons.find(l => l.unlocked && !l.completed) ?? allLessons.find(l => l.unlocked);

  return (
    <div className="v2-app max-w-3xl mx-auto px-6 py-10" style={{ minHeight: "100vh", background: "var(--app-bg)" }}>
      {/* Header */}
      <div className="mb-8">
        <Link href="/academy" className="mb-4 inline-flex items-center gap-1">
          <img src="/Leadash_academy_logo_white.png" alt="Leadash Academy" style={{ height: 22, width: "auto", opacity: 0.6 }} />
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {enrollment.status === "completed"
                ? <span className="badge-emerald">Completed</span>
                : <span className="badge-orange">In Progress</span>
              }
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Your Course</h1>
            {cohort && <p className="text-white/40 text-sm">Cohort: {cohort.name}</p>}
          </div>
          {resumeLesson && (
            <Link href={`/academy/${slug}/learn/${resumeLesson.id}`}
              className="flex-shrink-0 bg-orange-500 hover:bg-orange-400 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
              {completed > 0 ? "Continue" : "Start"}
            </Link>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-5 bg-white/4 border border-white/8 rounded-xl p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-white/70">{completed} of {total} lessons complete</span>
            <span className="text-white font-semibold">{pct}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Sections + Lessons */}
      <div className="space-y-6">
        {sections.map(section => {
          const secCta = section as unknown as { cta_text?: string | null; cta_url?: string | null };
          return (
          <div key={section.id}>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">{section.title}</h3>
              {secCta.cta_text && secCta.cta_url && (
                <a
                  href={secCta.cta_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs text-orange-400 hover:text-orange-300 inline-flex items-center gap-1.5 transition-colors"
                >
                  {secCta.cta_text}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M7 17L17 7"/><path d="M9 7h8v8"/>
                  </svg>
                </a>
              )}
            </div>
            <div className="space-y-1">
              {section.lessons.map((lesson) => {
                const icon = lesson.completed ? "✓" :
                             !lesson.unlocked ? "🔒" :
                             lesson.lesson_type === "video" ? "▶" :
                             lesson.lesson_type === "live"  ? "📡" :
                             lesson.lesson_type === "text"  ? "📝" : "📋";
                return (
                  <div key={lesson.id}>
                    {lesson.unlocked ? (
                      <Link href={`/academy/${slug}/learn/${lesson.id}`}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${
                          lesson.completed
                            ? "bg-emerald-500/8 border border-emerald-500/15 hover:border-emerald-500/30"
                            : "bg-white/4 border border-white/8 hover:border-orange-500/30"
                        }`}>
                        <span className={`text-base flex-shrink-0 ${lesson.completed ? "text-emerald-400" : "text-white/60"}`}>{icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${lesson.completed ? "text-emerald-300" : "text-white group-hover:text-orange-100"}`}>
                            {lesson.title}
                          </p>
                          {lesson.progress && !lesson.completed && (
                            <div className="h-0.5 bg-white/10 rounded-full mt-1 overflow-hidden w-24">
                              <div className="h-full bg-orange-500 rounded-full" style={{ width: `${lesson.progress.watch_percent}%` }} />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {lesson.is_free_preview && <span className="text-[10px] text-white/30">preview</span>}
                          {lesson.duration_secs && <span className="text-xs text-white/30">{lessonDuration(lesson.duration_secs)}</span>}
                          <svg className="w-4 h-4 text-white/20 group-hover:text-orange-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/2 border border-white/5 opacity-50 cursor-not-allowed">
                        <span className="text-base text-white/30">{icon}</span>
                        <div className="flex-1">
                          <p className="text-sm text-white/40">{lesson.title}</p>
                          {lesson.drip_type === "days_after_cohort_start" && cohort && (
                            <p className="text-xs text-white/25 mt-0.5">
                              Unlocks {new Date(new Date(cohort.starts_at).getTime() + (lesson.drip_value ?? 0) * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

      {/* Certificate CTA */}
      {enrollment.status === "completed" && (
        <Link href={`/academy/${slug}/certificate`}
          className="mt-8 flex items-center justify-between bg-gradient-to-r from-emerald-900/40 to-emerald-800/20 border border-emerald-500/25 rounded-2xl p-5">
          <div>
            <p className="text-emerald-400 font-semibold">🏆 You&apos;ve completed this course!</p>
            <p className="text-emerald-300/60 text-sm mt-0.5">View and download your certificate</p>
          </div>
          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .badge-emerald { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; padding:2px 8px; border-radius:9999px; background:rgba(52,211,153,0.1); color:#34d399; border:1px solid rgba(52,211,153,0.2); }
        .badge-orange  { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; padding:2px 8px; border-radius:9999px; background:rgba(249,115,22,0.1); color:#fb923c; border:1px solid rgba(249,115,22,0.2); }
      ` }} />
    </div>
  );
}
