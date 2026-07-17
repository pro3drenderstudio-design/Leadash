"use client";
import { useCallback, useEffect, useState } from "react";

interface Row {
  rank: number;
  enrollment_id: string;
  user_id: string;
  name: string;
  points: number;
  streak_days: number;
  reported_earnings_cents: number;
  graduated: boolean;
}
interface Cohort {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  is_default: boolean;
  participant_count: number;
  winner_enrollment_id: string | null;
  winner_awarded_at: string | null;
  cash_prize_status: string | null;
  rows: Row[];
}

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
function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });
}

export default function AdminCohortsPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/academy/cohort-leaderboard?product_slug=challenge-7day");
      const d = await res.json();
      const list = (d.cohorts ?? []) as Cohort[];
      setCohorts(list);
      setActiveId(prev => prev ?? list.find(c => c.is_default)?.id ?? list[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const active = cohorts.find(c => c.id === activeId) ?? null;

  async function confirmWinner(enrollmentId: string) {
    if (!active) return;
    if (!window.confirm("Confirm this challenger as the cohort winner? This grants them the $10k Academy and flags the ₦50,000 cash for manual payout.")) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/academy/cohort-winner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohort_id: active.id, enrollment_id: enrollmentId }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg(d.error ?? "Failed to confirm winner"); return; }
      setMsg("Winner confirmed — $10k Academy granted, cash prize marked pending.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function markCashPaid() {
    if (!active) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/academy/cohort-winner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohort_id: active.id, enrollment_id: active.winner_enrollment_id, cash_prize_status: "paid" }),
      });
      if (res.ok) { setMsg("Cash prize marked paid."); await load(); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "24px 22px 90px", maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--app-text)", marginBottom: 4 }}>Challenge cohorts & leaderboard</h1>
      <p style={{ fontSize: 13, color: "var(--app-text-quiet)", marginBottom: 20 }}>
        Screenshot a cohort&apos;s leaderboard for the group, and confirm the winner when a cohort ends.
      </p>

      {loading ? (
        <p style={{ color: "var(--app-text-muted)", fontSize: 13 }}>Loading…</p>
      ) : cohorts.length === 0 ? (
        <p style={{ color: "var(--app-text-muted)", fontSize: 13 }}>No cohorts yet.</p>
      ) : (
        <>
          {/* Cohort selector */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {cohorts.map(c => (
              <button key={c.id} onClick={() => setActiveId(c.id)}
                style={{
                  padding: "7px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  background: c.id === activeId ? "var(--app-accent)" : "var(--app-surface)",
                  color: c.id === activeId ? "#fff" : "var(--app-text-muted)",
                  border: `1px solid ${c.id === activeId ? "var(--app-accent)" : "var(--app-border)"}`,
                }}>
                {c.name} · <span style={{ opacity: 0.8 }}>{c.status}</span>
              </button>
            ))}
          </div>

          {msg && (
            <div style={{ background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12.5, color: "#6EE7B7" }}>{msg}</div>
          )}

          {active && (
            <>
              {/* Screenshot card */}
              <div style={{ background: "linear-gradient(180deg, #12121A, #0B0B10)", border: "1px solid var(--app-border)", borderRadius: 16, padding: "24px 24px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>🏆 {active.name} — Leaderboard</h2>
                  <span style={{ fontSize: 11.5, color: "#9A9AA8" }}>{active.participant_count} challengers · Day 1 {fmtDate(active.starts_at)} WAT</span>
                </div>
                <p style={{ fontSize: 11.5, color: "#F59E0B", marginBottom: 18 }}>Winner takes the $10k Academy + ₦50,000 cash</p>

                {active.rows.length === 0 ? (
                  <p style={{ color: "#9A9AA8", fontSize: 13 }}>No points logged yet.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {active.rows.slice(0, 20).map(r => {
                      const isWinner = active.winner_enrollment_id === r.enrollment_id;
                      const medal = r.rank === 1 ? "#FBBF24" : r.rank === 2 ? "#C0C0C0" : r.rank === 3 ? "#CD7F32" : null;
                      return (
                        <div key={r.enrollment_id}
                          style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 10,
                            background: isWinner ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.03)",
                            border: `1px solid ${isWinner ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.06)"}`,
                          }}>
                          <span style={{ width: 24, textAlign: "center", fontSize: 14, fontWeight: 800, color: medal ?? "#6B6B78" }}>{r.rank}</span>
                          <div style={{ width: 32, height: 32, borderRadius: 999, background: colorForName(r.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#07070A", flexShrink: 0 }}>
                            {initials(r.name)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {r.name}{r.graduated ? " 🎓" : ""}{isWinner ? " 👑" : ""}
                            </p>
                            {r.streak_days > 0 && <p style={{ fontSize: 11, color: "#9A9AA8" }}>🔥 {r.streak_days}d streak</p>}
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#A78BFA" }}>{r.points.toLocaleString()} pts</span>
                          {active.status === "ended" && !active.winner_enrollment_id && (
                            <button disabled={busy} onClick={() => confirmWinner(r.enrollment_id)}
                              style={{ fontSize: 11, fontWeight: 700, background: "var(--app-accent)", color: "#fff", border: "none", borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>
                              Make winner
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Winner / prize status */}
              {active.winner_enrollment_id && (
                <div style={{ marginTop: 16, background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12, padding: "16px 18px" }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--app-text)", marginBottom: 6 }}>Winner confirmed</p>
                  <p style={{ fontSize: 12.5, color: "var(--app-text-muted)" }}>
                    $10k Academy granted. Cash prize (₦50,000): <strong style={{ color: active.cash_prize_status === "paid" ? "#34D399" : "#F59E0B" }}>{active.cash_prize_status ?? "pending"}</strong>
                    {active.winner_awarded_at ? ` · confirmed ${fmtDate(active.winner_awarded_at)} WAT` : ""}
                  </p>
                  {active.cash_prize_status !== "paid" && (
                    <button disabled={busy} onClick={markCashPaid}
                      style={{ marginTop: 12, fontSize: 12, fontWeight: 700, background: "rgba(52,211,153,0.14)", border: "1px solid rgba(52,211,153,0.3)", color: "#34D399", borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>
                      Mark cash prize paid
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
