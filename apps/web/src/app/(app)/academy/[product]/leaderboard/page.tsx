"use client";
import "@/v2-app/v2-app.css";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { wsGet } from "@/lib/workspace/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaderboardRow {
  rank: number;
  enrollment_id: string;
  workspace_name: string;
  current_day: number;
  streak_days: number;
  points: number;
  reported_earnings_cents: number;
  earnings_verified: boolean;
  is_me: boolean;
  graduated: boolean;
}

interface LeaderboardResponse {
  board: string;
  scope: string;
  rows: LeaderboardRow[];
  me: LeaderboardRow | null;
}

type Board = "points" | "earnings";
type Scope = "week" | "all_time";

// ─── Avatar colors ────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["#F97316", "#60A5FA", "#34D399", "#A78BFA", "#F472B6", "#FBBF24"];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 999, background: colorForName(name),
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 700, color: "#07070A", flexShrink: 0,
    }}>
      {initials(name)}
    </div>
  );
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const { product: slug } = useParams<{ product: string }>();

  const [productId, setProductId] = useState<string | null>(null);
  const [board, setBoard] = useState<Board>("points");
  const [scope, setScope] = useState<Scope>("all_time");
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [cohortName, setCohortName] = useState<string>("Current Cohort");

  // Resolve product id from slug
  useEffect(() => {
    wsGet<{ products: Array<{ id: string; slug: string; cohort?: { name: string } | null }> }>("/api/academy/products")
      .then(d => {
        const p = d.products.find(x => x.slug === slug || x.id === slug);
        if (p) {
          setProductId(p.id);
          if (p.cohort?.name) setCohortName(p.cohort.name);
        }
      });
  }, [slug]);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const d = await wsGet<LeaderboardResponse>(`/api/academy/leaderboard?product_id=${productId}&board=${board}&scope=${scope}`);
        if (!cancelled) setData(d);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [productId, board, scope]);

  if (!productId || loading) return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--app-text-muted)", fontSize: 13 }}>Loading…</div>
    </div>
  );
  if (!data) return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--app-text-muted)" }}>Leaderboard unavailable.</div>
    </div>
  );

  const rows = data.rows ?? [];
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  // Podium order: 2nd, 1st, 3rd
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean) as LeaderboardRow[];

  function valueFor(row: LeaderboardRow): string {
    return board === "points" ? row.points.toLocaleString() : formatUsd(row.reported_earnings_cents);
  }

  return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", padding: "24px 22px 90px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Link href={`/academy/${slug}/learn`}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--app-text-muted)", textDecoration: "none", marginBottom: 16 }}>
            ← Back to dashboard
          </Link>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--app-text)", marginBottom: 4 }}>Leaderboard</h1>
              <p style={{ fontSize: 13, color: "var(--app-text-muted)" }}>{cohortName} · {rows.length} challengers</p>
            </div>
            <select
              value={scope}
              onChange={e => setScope(e.target.value as Scope)}
              style={{ background: "var(--app-surface)", border: "1px solid var(--app-border-strong)", borderRadius: "var(--app-radius)", padding: "8px 12px", color: "var(--app-text)", fontSize: 13, cursor: "pointer" }}>
              <option value="week">This week</option>
              <option value="all_time">All-time</option>
            </select>
          </div>
        </div>

        {/* Board tabs */}
        <div style={{ display: "flex", gap: 6, background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius)", padding: 4, marginBottom: 16, width: "fit-content" }}>
          {[
            { key: "points" as Board, label: "Points", icon: "⚡" },
            { key: "earnings" as Board, label: "Earnings", icon: "💵" },
          ].map(tab => (
            <button key={tab.key} onClick={() => setBoard(tab.key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: board === tab.key ? "var(--app-surface-strong)" : "transparent",
                border: board === tab.key ? "1px solid var(--app-border-strong)" : "1px solid transparent",
                borderRadius: 6, padding: "7px 14px", fontSize: 13, fontWeight: 600,
                color: board === tab.key ? "var(--app-text)" : "var(--app-text-muted)",
                cursor: "pointer", transition: "all 0.15s",
              }}>
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>

        {/* Earnings note */}
        {board === "earnings" && (
          <div style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.20)", borderRadius: "var(--app-radius)", padding: "12px 16px", marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>ℹ️</span>
            <p style={{ fontSize: 12.5, color: "#6EE7B7", lineHeight: 1.5 }}>
              Real revenue reported by challengers — verified with proof before counting toward this board.
            </p>
          </div>
        )}

        {/* Podium */}
        {top3.length > 0 && (
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 14, marginBottom: 32, paddingTop: 20 }}>
            {podiumOrder.map((row) => {
              const place = row.rank;
              const isFirst = place === 1;
              const height = isFirst ? 150 : 120;
              const medalColor = place === 1 ? "#FBBF24" : place === 2 ? "#C0C0C0" : "#CD7F32";
              return (
                <div key={row.enrollment_id} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 110 }}>
                  {isFirst && <div style={{ fontSize: 22, marginBottom: 4 }}>👑</div>}
                  <Avatar name={row.workspace_name} size={isFirst ? 52 : 44} />
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text)", marginTop: 8, marginBottom: 2, textAlign: "center", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.workspace_name}{row.is_me ? " (you)" : ""}
                  </p>
                  <p style={{ fontSize: 14, fontWeight: 800, color: medalColor, marginBottom: 10 }}>{valueFor(row)}</p>
                  <div style={{
                    width: "100%", height,
                    background: `linear-gradient(180deg, ${medalColor}33, ${medalColor}11)`,
                    border: `1px solid ${medalColor}55`,
                    borderRadius: "8px 8px 0 0",
                    display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 10,
                  }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: medalColor }}>{place}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Ranked list (4+) */}
        {rest.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 28 }}>
            {rest.map(row => (
              <div key={row.enrollment_id}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: row.is_me ? "rgba(249,115,22,0.08)" : "var(--app-surface)",
                  border: row.is_me ? "1px solid rgba(249,115,22,0.30)" : "1px solid var(--app-border)",
                  borderRadius: "var(--app-radius)",
                  padding: "10px 14px",
                }}>
                <span style={{ width: 22, fontSize: 13, fontWeight: 700, color: "var(--app-text-quiet)", textAlign: "center", flexShrink: 0 }}>{row.rank}</span>
                <Avatar name={row.workspace_name} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.workspace_name}{row.is_me ? " (you)" : ""}{row.graduated ? " 🎓" : ""}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--app-text-muted)" }}>
                    Day {row.current_day}{board === "points" && row.streak_days > 0 ? ` · 🔥 ${row.streak_days}d streak` : ""}
                  </p>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: row.is_me ? "var(--app-accent)" : "var(--app-text)", flexShrink: 0 }}>
                  {valueFor(row)}
                </span>
              </div>
            ))}
          </div>
        )}

        {rows.length === 0 && (
          <div style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius-lg)", padding: "32px 20px", textAlign: "center", marginBottom: 28 }}>
            <p style={{ color: "var(--app-text-muted)", fontSize: 14 }}>No rankings yet — be the first to log progress.</p>
          </div>
        )}

        {/* Prize callout */}
        <div style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.14), rgba(14,14,19,0.5))", border: "1px solid rgba(251,191,36,0.28)", borderRadius: "var(--app-radius-lg)", padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 24, flexShrink: 0 }}>🏆</span>
          <p style={{ fontSize: 13, color: "var(--app-warning)", lineHeight: 1.5 }}>
            <strong>1st place</strong> wins a free Academy Package · ₦250,000 value · awarded at graduation
          </p>
        </div>
      </div>
    </div>
  );
}
