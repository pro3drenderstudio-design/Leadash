"use client";
import { useEffect, useState, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  UserMultipleIcon,
  CheckmarkCircle02Icon,
  Activity01Icon,
  FireIcon,
  Award01Icon,
  Medal01Icon,
  ChartIcon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsTiles {
  enrolled: number;
  active_today: number;
  completion_rate: number;
  avg_streak: number;
  revenue_reported_cents: number;
  earning_count: number;
}

interface RetentionRow {
  day: number;
  completed: number;
  pct?: number;
}

interface Participant {
  enrollment_id: string;
  workspace_id: string;
  workspace_name: string;
  current_day: number;
  streak_days: number;
  points: number;
  reported_earnings_cents: number;
  status: "active" | "at_risk" | "graduated";
  completed_at: string | null;
}

interface Winner {
  rank: number;
  enrollment_id: string;
  workspace_id: string | null;
  workspace_name: string;
  points: number;
  streak_days: number;
  reported_earnings_cents: number;
  earnings_verified: boolean;
}

interface AnalyticsData {
  duration_days: number;
  tiles: AnalyticsTiles;
  retention: RetentionRow[];
  participants: Participant[];
}

interface ChallengeAnalyticsProps {
  productId: string;
  productName: string;
  onToast: (msg: string) => void;
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--app-bg-elevated)",
  border: "1px solid var(--app-border)",
  borderRadius: 12,
};

function fmtUsd(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${n}%`;
}

function getInitials(name: string): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function avatarColor(name: string): string {
  const colors = [
    "#F97316", "#60A5FA", "#34D399", "#A78BFA", "#F472B6", "#FBBF24", "#F87171",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function statusColor(status: string): { bg: string; text: string; border: string } {
  switch (status) {
    case "graduated": return { bg: "rgba(52,211,153,0.1)",   text: "#34D399", border: "rgba(52,211,153,0.2)" };
    case "at_risk":   return { bg: "rgba(251,191,36,0.1)",   text: "#FBBF24", border: "rgba(251,191,36,0.2)" };
    default:          return { bg: "rgba(96,165,250,0.1)",   text: "#60A5FA", border: "rgba(96,165,250,0.2)" };
  }
}

// ── ChallengeAnalytics ────────────────────────────────────────────────────────

export default function ChallengeAnalytics({ productId, productName, onToast }: ChallengeAnalyticsProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingWinners, setLoadingWinners] = useState(true);
  const [savingWinners, setSavingWinners] = useState(false);
  const [cohortFilter, setCohortFilter] = useState("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/academy/challenge-analytics?product_id=${productId}`);
      const json = await res.json();
      if (!res.ok) { onToast(json.error ?? "Failed to load analytics"); return; }
      setData(json);
    } catch {
      onToast("Network error loading analytics");
    } finally {
      setLoading(false);
    }
  }, [productId, onToast]);

  const loadWinners = useCallback(async () => {
    setLoadingWinners(true);
    try {
      const res = await fetch(`/api/admin/academy/challenge-winners?product_id=${productId}`);
      const json = await res.json();
      if (res.ok) setWinners(json.top_by_points ?? []);
    } catch {
      // silently ignore
    } finally {
      setLoadingWinners(false);
    }
  }, [productId]);

  useEffect(() => {
    loadData();
    loadWinners();
  }, [loadData, loadWinners]);

  async function autoPickWinners() {
    if (!data || data.participants.length === 0) { onToast("No participants yet"); return; }
    setSavingWinners(true);
    try {
      // Sort participants by points descending, pick top 3
      const sorted = [...data.participants].sort((a, b) => b.points - a.points).slice(0, 3);
      const winnerPayload = sorted.map((p, i) => ({
        rank: i + 1,
        enrollment_id: p.enrollment_id,
      }));
      const res = await fetch("/api/admin/academy/challenge-winners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, winners: winnerPayload }),
      });
      const json = await res.json();
      if (!res.ok) { onToast(json.error ?? "Failed to save winners"); return; }
      onToast("Winners saved");
      await loadWinners();
    } finally {
      setSavingWinners(false);
    }
  }

  const tiles = data?.tiles;
  const retention = data?.retention ?? [];
  const participants = data?.participants ?? [];
  const durationDays = data?.duration_days ?? 30;

  // For retention chart, build one bar per challenge day
  const maxCompleted = Math.max(...retention.map(r => r.completed), 1);
  const retentionBars: Array<{ day: number; completed: number; pct: number }> = Array.from({ length: durationDays }, (_, i) => {
    const row = retention.find(r => r.day === i + 1);
    return { day: i + 1, completed: row?.completed ?? 0, pct: row?.pct ?? 0 };
  });

  const medalIcons = [Award01Icon, Medal01Icon, Medal01Icon];
  const medalColors = ["#FBBF24", "#9CA3AF", "#D97706"];

  if (loading) {
    return (
      <div className="v2-app" style={{ padding: "48px 0", textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>
        Loading analytics…
      </div>
    );
  }

  return (
    <div className="v2-app" style={{ color: "var(--app-text)" }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text)" }}>{productName} · Analytics</h2>
        <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: 2 }}>
          Live cohort performance, retention, and winner selection.
        </p>
      </div>
      {/* ── Metric tiles ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          {
            label: "Enrolled",
            value: (tiles?.enrolled ?? 0).toLocaleString(),
            icon: UserMultipleIcon,
            color: "var(--app-info)",
          },
          {
            label: "Active today",
            value: (tiles?.active_today ?? 0).toLocaleString(),
            icon: Activity01Icon,
            color: "var(--app-success)",
          },
          {
            label: "Completion rate",
            value: fmtPct(tiles?.completion_rate ?? 0),
            icon: CheckmarkCircle02Icon,
            color: "var(--app-accent)",
          },
          {
            label: "Avg streak",
            value: `${tiles?.avg_streak ?? 0} days`,
            icon: FireIcon,
            color: "#F472B6",
          },
          {
            label: "Revenue reported",
            value: fmtUsd(tiles?.revenue_reported_cents ?? 0),
            icon: Award01Icon,
            color: "var(--app-warning)",
          },
        ].map(tile => {
          const Icon = tile.icon;
          return (
            <div key={tile.label} style={{ ...cardStyle, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <p style={{ fontSize: 10, color: "var(--app-text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{tile.label}</p>
                <HugeiconsIcon icon={Icon} size={14} strokeWidth={1.8} color={tile.color} />
              </div>
              <p style={{ fontSize: 22, fontWeight: 800, color: "var(--app-text)", fontVariantNumeric: "tabular-nums" }}>{tile.value}</p>
            </div>
          );
        })}
      </div>

      {/* ── Middle two columns ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, marginBottom: 24 }}>
        {/* LEFT: Retention chart */}
        <div style={{ ...cardStyle, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>Daily completion retention</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: "var(--app-text-quiet)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--app-accent)", display: "inline-block" }} />
                Completed
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--app-surface-strong)", display: "inline-block" }} />
                Upcoming
              </span>
            </div>
          </div>
          {/* Bar chart */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120, paddingBottom: 4 }}>
            {retentionBars.map(bar => {
              const barHeight = maxCompleted > 0 ? Math.round((bar.completed / maxCompleted) * 100) : 0;
              const isPast = bar.completed > 0;
              const isToday = bar.day === Math.max(...retention.map(r => r.day), 0);
              return (
                <div
                  key={bar.day}
                  title={`Day ${bar.day}: ${bar.completed} completed (${bar.pct}%)`}
                  style={{
                    flex: 1,
                    height: `${Math.max(barHeight, 4)}%`,
                    minHeight: 4,
                    borderRadius: 3,
                    background: isPast
                      ? isToday
                        ? "rgba(249,115,22,0.5)"
                        : "var(--app-accent)"
                      : "var(--app-surface-strong)",
                    transition: "height 0.3s ease",
                  }}
                />
              );
            })}
          </div>
          {/* X-axis labels */}
          <div style={{ display: "flex", alignItems: "center", paddingTop: 6 }}>
            <span style={{ fontSize: 10, color: "var(--app-text-quiet)", flex: 1 }}>Day 1</span>
            <span style={{ fontSize: 10, color: "var(--app-text-quiet)", textAlign: "center", flex: 1 }}>Day 15</span>
            <span style={{ fontSize: 10, color: "var(--app-text-quiet)", textAlign: "right", flex: 1 }}>Day 30</span>
          </div>
        </div>

        {/* RIGHT: Winner selection */}
        <div style={{ ...cardStyle, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>Winner selection</h3>
            <HugeiconsIcon icon={Award01Icon} size={16} strokeWidth={1.8} color="var(--app-warning)" />
          </div>

          {loadingWinners ? (
            <div style={{ fontSize: 12, color: "var(--app-text-quiet)", padding: "12px 0" }}>Loading…</div>
          ) : winners.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {winners.map((w, i) => {
                const MedalIcon = medalIcons[i] ?? Medal01Icon;
                const mColor = medalColors[i] ?? "var(--app-text-quiet)";
                const initials = getInitials(w.workspace_name);
                const aColor = avatarColor(w.workspace_name);
                return (
                  <div key={w.enrollment_id} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: "var(--app-surface)",
                    borderRadius: 9,
                    border: "1px solid var(--app-border)",
                  }}>
                    <HugeiconsIcon icon={MedalIcon} size={18} strokeWidth={1.8} color={mColor} />
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: `${aColor}22`,
                      border: `1.5px solid ${aColor}44`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: aColor,
                      flexShrink: 0,
                    }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--app-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {w.workspace_name || w.enrollment_id.slice(0, 8)}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--app-text-quiet)" }}>{w.points.toLocaleString()} pts</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--app-text-quiet)", marginBottom: 16, padding: "8px 0" }}>
              No winners picked yet. Click below to auto-select based on points.
            </div>
          )}

          <button
            onClick={autoPickWinners}
            disabled={savingWinners}
            style={{
              width: "100%",
              background: "var(--app-accent)",
              color: "#fff",
              border: "none",
              borderRadius: 9,
              padding: "9px 14px",
              fontWeight: 600,
              fontSize: 13,
              cursor: savingWinners ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              opacity: savingWinners ? 0.6 : 1,
            }}
          >
            <HugeiconsIcon icon={ChartIcon} size={13} strokeWidth={2} />
            {savingWinners ? "Saving…" : "Auto-pick winners"}
          </button>
        </div>
      </div>

      {/* ── Participants table ── */}
      <div style={{ ...cardStyle, overflow: "hidden" }}>
        {/* Table header */}
        <div style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--app-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>
            Participants
            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--app-text-quiet)", fontWeight: 400 }}>
              {participants.length.toLocaleString()} total
            </span>
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <select
              value={cohortFilter}
              onChange={e => setCohortFilter(e.target.value)}
              style={{
                background: "var(--app-bg)",
                border: "1px solid var(--app-border-strong)",
                borderRadius: 8,
                padding: "6px 10px",
                color: "var(--app-text)",
                fontSize: 12.5,
                fontFamily: "inherit",
                outline: "none",
              }}
            >
              <option value="all">All cohorts</option>
            </select>
            <button
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "var(--app-surface-strong)",
                border: "1px solid var(--app-border-strong)",
                color: "var(--app-text)",
                borderRadius: 9,
                padding: "6px 12px",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <HugeiconsIcon icon={UserMultipleIcon} size={13} strokeWidth={1.8} />
              Message all
            </button>
          </div>
        </div>

        {participants.length === 0 ? (
          <div style={{ padding: "48px 18px", textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>
            No participants yet — enrollments will appear here once the challenge goes live.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr>
                  {["Participant", "Progress", "Streak", "Points", "Reported $", "Status", ""].map(h => (
                    <th key={h} style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--app-text-quiet)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      borderBottom: "1px solid var(--app-border)",
                      whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {participants.map(p => {
                  const initials = getInitials(p.workspace_name);
                  const aColor = avatarColor(p.workspace_name);
                  const progressPct = Math.min(Math.round((p.current_day / durationDays) * 100), 100);
                  const sc = statusColor(p.status);
                  const statusLabel = p.status === "graduated" ? "Graduated"
                    : p.status === "at_risk" ? "At risk" : "Active";
                  const highStreak = p.streak_days >= 10;

                  return (
                    <tr
                      key={p.enrollment_id}
                      style={{ borderBottom: "1px solid var(--app-border)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--app-surface)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* Avatar + name */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background: `${aColor}22`,
                            border: `1.5px solid ${aColor}44`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 700,
                            color: aColor,
                            flexShrink: 0,
                          }}>{initials}</div>
                          <span style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "var(--app-text)",
                            maxWidth: 160,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                            {p.workspace_name || p.workspace_id.slice(0, 8)}
                          </span>
                        </div>
                      </td>

                      {/* Progress bar */}
                      <td style={{ padding: "12px 16px", minWidth: 140 }}>
                        <div style={{ marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: "var(--app-text-muted)" }}>
                            Day {p.current_day}/{durationDays}
                          </span>
                        </div>
                        <div style={{
                          height: 5,
                          background: "var(--app-surface-strong)",
                          borderRadius: 999,
                          overflow: "hidden",
                          width: 120,
                        }}>
                          <div style={{
                            height: "100%",
                            width: `${progressPct}%`,
                            background: p.status === "graduated" ? "var(--app-success)"
                              : p.status === "at_risk" ? "var(--app-warning)" : "var(--app-accent)",
                            borderRadius: 999,
                            transition: "width 0.3s ease",
                          }} />
                        </div>
                      </td>

                      {/* Streak */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <HugeiconsIcon
                            icon={FireIcon}
                            size={14}
                            strokeWidth={1.8}
                            color={highStreak ? "#F97316" : "var(--app-text-quiet)"}
                          />
                          <span style={{
                            fontSize: 13,
                            fontWeight: highStreak ? 700 : 400,
                            color: highStreak ? "#F97316" : "var(--app-text-muted)",
                            fontVariantNumeric: "tabular-nums",
                          }}>{p.streak_days}</span>
                        </div>
                      </td>

                      {/* Points */}
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "var(--app-text)" }}>
                          {p.points.toLocaleString()}
                        </span>
                      </td>

                      {/* Reported $ */}
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          fontSize: 13,
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: p.reported_earnings_cents > 0 ? 700 : 400,
                          color: p.reported_earnings_cents > 0 ? "var(--app-success)" : "var(--app-text-quiet)",
                        }}>
                          {p.reported_earnings_cents > 0 ? fmtUsd(p.reported_earnings_cents) : "—"}
                        </span>
                      </td>

                      {/* Status chip */}
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "3px 9px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          background: sc.bg,
                          color: sc.text,
                          border: `1px solid ${sc.border}`,
                        }}>
                          {statusLabel}
                        </span>
                      </td>

                      {/* Action */}
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <button style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--app-text-quiet)",
                          cursor: "pointer",
                          padding: "4px 6px",
                          borderRadius: 6,
                          display: "inline-flex",
                          alignItems: "center",
                        }}>
                          <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.8} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
