"use client";
/**
 * Audit tab — the accountant's workflow home:
 *  - Review queue: unreviewed/flagged auto transactions, worked at any cadence
 *  - Month close: sign-off that locks the month (blocked while items remain
 *    unreviewed/flagged unless overridden with a note); closed months sync to
 *    mizark-partners for investor reporting (pending approval there)
 *  - Paystack fee backfill for historical transactions
 *  - Append-only audit log of every finance action
 */
import { useCallback, useEffect, useState } from "react";
import { CATEGORIES, type FinanceTransaction, type TxType } from "@/lib/finance/tax";
import { FIN_PRIMARY_BTN, FIN_GHOST_BTN, FIN_TH, FIN_TD, FIN_CHIP, FIN_CARD, FIN_LABEL, ngnFull, fmtDate } from "./finStyles";

interface PeriodRow {
  period_month: string;
  status: "open" | "closed";
  unreviewed: number;
  flagged: number;
  closed_by?: string | null;
  closed_at?: string | null;
  close_note?: string | null;
  sync_status?: string | null;
}

interface AuditEntry {
  id: string;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export default function AuditTab({ onChanged }: { onChanged?: () => void }) {
  const [queue, setQueue] = useState<FinanceTransaction[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [log, setLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [backfill, setBackfill] = useState<{ running: boolean; processed: number; remaining: number | null }>({ running: false, processed: 0, remaining: null });

  const load = useCallback(async () => {
    setLoading(true);
    const [unrev, flagged, periodsRes, logRes] = await Promise.all([
      fetch("/api/admin/finance/transactions?review_status=unreviewed&limit=200").then(r => r.json()),
      fetch("/api/admin/finance/transactions?review_status=flagged&limit=200").then(r => r.json()),
      fetch("/api/admin/finance/periods").then(r => r.json()),
      fetch("/api/admin/finance/audit-log?limit=60").then(r => r.json()),
    ]);
    setQueue([...(flagged.transactions ?? []), ...(unrev.transactions ?? [])]);
    setPeriods(periodsRes.periods ?? []);
    setLog(logRes.entries ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function review(tx: FinanceTransaction, status: "reviewed" | "flagged") {
    let note: string | null = null;
    if (status === "flagged") {
      note = window.prompt("Flag note — what needs attention?");
      if (note === null) return;
    }
    setActing(tx.id);
    const r = await fetch(`/api/admin/finance/transactions/${tx.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_status: status, ...(note !== null ? { review_note: note } : {}) }),
    });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? "Action failed");
    await load(); onChanged?.();
    setActing(null);
  }

  async function periodAction(month: string, action: "close" | "reopen" | "retry_sync", override = false) {
    let note: string | undefined;
    if (action === "close") {
      const n = window.prompt(override
        ? "Override note (required) — why close with unreviewed/flagged items?"
        : "Sign-off note (optional):");
      if (n === null) return;
      if (override && !n.trim()) { alert("An override note is required."); return; }
      note = n || undefined;
    }
    if (action === "reopen" && !window.confirm(`Reopen ${month.slice(0, 7)}? Its figures become editable again and the investor sync is marked stale.`)) return;

    setActing(month);
    setError("");
    const r = await fetch("/api/admin/finance/periods", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period_month: month, action, note, override }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 409 && d.requires_override) {
      setActing(null);
      if (window.confirm(`${d.error}\n\nClose anyway with an override note?`)) {
        await periodAction(month, "close", true);
      }
      return;
    }
    if (!r.ok) setError(d.error ?? "Action failed");
    await load(); onChanged?.();
    setActing(null);
  }

  async function runBackfill() {
    setBackfill({ running: true, processed: 0, remaining: null });
    let total = 0;
    try {
      for (let i = 0; i < 200; i++) {
        const r = await fetch("/api/admin/finance/backfill-fees", { method: "POST" });
        const d = await r.json();
        if (!r.ok) { setError(d.error ?? "Backfill failed"); break; }
        total += d.processed ?? 0;
        setBackfill({ running: true, processed: total, remaining: d.remaining ?? 0 });
        if (!d.remaining) break;
      }
    } finally {
      setBackfill(b => ({ ...b, running: false }));
      await load(); onChanged?.();
    }
  }

  const SYNC_LABELS: Record<string, string> = {
    synced: "synced → pending approval", failed: "sync failed", retracted: "sync retracted",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--app-out-soft)", border: "1px solid var(--app-out)", color: "var(--app-out)", fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {/* Review queue */}
          <div style={FIN_CARD}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--app-border)", display: "flex", alignItems: "center", gap: 10 }}>
              <p style={{ ...FIN_LABEL, margin: 0 }}>Review queue</p>
              <span style={{ ...FIN_CHIP, background: queue.length ? "var(--app-warning-soft)" : "var(--app-surface-strong)", color: queue.length ? "var(--app-warning)" : "var(--app-text-quiet)" }}>
                {queue.length} pending
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: "var(--app-text-quiet)" }}>Work through these daily/weekly — months can't be signed off while items remain.</span>
            </div>
            {queue.length === 0 ? (
              <p style={{ padding: 20, margin: 0, fontSize: 13, color: "var(--app-text-quiet)" }}>All caught up — every transaction is reviewed.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="fin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr>{["Date", "Category", "Description", "Amount", "Status", ""].map(h => <th key={h} style={FIN_TH}>{h}</th>)}</tr></thead>
                  <tbody>
                    {queue.slice(0, 50).map(tx => (
                      <tr key={tx.id} style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <td style={{ ...FIN_TD, whiteSpace: "nowrap", color: "var(--app-text-muted)" }}>{fmtDate(tx.date)}</td>
                        <td style={{ ...FIN_TD, whiteSpace: "nowrap", color: "var(--app-text-muted)" }}>{CATEGORIES[tx.type as TxType]?.[tx.category] ?? tx.category}</td>
                        <td style={{ ...FIN_TD, maxWidth: 300 }}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.description ?? "—"}</span>
                          {tx.review_note && <span style={{ fontSize: 11, color: "var(--app-warning)" }}>⚑ {tx.review_note}</span>}
                        </td>
                        <td style={{ ...FIN_TD, fontWeight: 600, whiteSpace: "nowrap" }}>{ngnFull(tx.amount_ngn)}</td>
                        <td style={FIN_TD}>
                          <span style={{ ...FIN_CHIP, background: tx.review_status === "flagged" ? "rgba(251,113,133,0.18)" : "rgba(148,163,184,0.14)", color: tx.review_status === "flagged" ? "#FDA4AF" : "#94A3B8" }}>
                            {tx.review_status}
                          </span>
                        </td>
                        <td style={{ ...FIN_TD, whiteSpace: "nowrap", textAlign: "right" }}>
                          <button onClick={() => review(tx, "reviewed")} disabled={acting === tx.id} style={FIN_GHOST_BTN}>✓ Reviewed</button>
                          {tx.review_status !== "flagged" && (
                            <button onClick={() => review(tx, "flagged")} disabled={acting === tx.id} style={{ ...FIN_GHOST_BTN, marginLeft: 4 }}>⚑ Flag</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Month close grid */}
          <div style={FIN_CARD}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--app-border)" }}>
              <p style={{ ...FIN_LABEL, margin: 0 }}>Month sign-off</p>
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--app-text-quiet)" }}>
                Closing a month locks its books (corrections then go in as adjusting entries in the open month) and sends the summary to Mizark Partners, where it waits for approval before investors see it.
              </p>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="fin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr>{["Month", "Status", "Unreviewed", "Flagged", "Investor sync", ""].map(h => <th key={h} style={FIN_TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {periods.map(p => (
                    <tr key={p.period_month} style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <td style={{ ...FIN_TD, fontWeight: 600, whiteSpace: "nowrap" }}>{p.period_month.slice(0, 7)}</td>
                      <td style={FIN_TD}>
                        <span style={{ ...FIN_CHIP, background: p.status === "closed" ? "rgba(52,211,153,0.14)" : "rgba(148,163,184,0.14)", color: p.status === "closed" ? "#6EE7B7" : "#94A3B8" }}>
                          {p.status}
                        </span>
                        {p.close_note && <p style={{ margin: "3px 0 0", fontSize: 10.5, color: "var(--app-text-quiet)" }}>{p.close_note}</p>}
                      </td>
                      <td style={{ ...FIN_TD, color: p.unreviewed ? "var(--app-warning)" : "var(--app-text-quiet)" }}>{p.unreviewed}</td>
                      <td style={{ ...FIN_TD, color: p.flagged ? "var(--app-out)" : "var(--app-text-quiet)" }}>{p.flagged}</td>
                      <td style={{ ...FIN_TD, fontSize: 12, color: p.sync_status === "failed" ? "var(--app-out)" : "var(--app-text-muted)" }}>
                        {p.status === "closed" ? (SYNC_LABELS[p.sync_status ?? ""] ?? "not synced") : "—"}
                      </td>
                      <td style={{ ...FIN_TD, whiteSpace: "nowrap", textAlign: "right" }}>
                        {p.status === "open" ? (
                          <button onClick={() => periodAction(p.period_month, "close")} disabled={acting === p.period_month} style={FIN_PRIMARY_BTN}>
                            {acting === p.period_month ? "…" : "Close & sign off"}
                          </button>
                        ) : (
                          <>
                            {(p.sync_status === "failed" || !p.sync_status) && (
                              <button onClick={() => periodAction(p.period_month, "retry_sync")} disabled={acting === p.period_month} style={FIN_GHOST_BTN}>Retry sync</button>
                            )}
                            <button onClick={() => periodAction(p.period_month, "reopen")} disabled={acting === p.period_month} style={{ ...FIN_GHOST_BTN, marginLeft: 4 }}>Reopen</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Data quality: fee backfill */}
          <div style={{ ...FIN_CARD, padding: 18, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <p style={{ ...FIN_LABEL, margin: 0 }}>Paystack fee backfill</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--app-text-quiet)" }}>
                Fills in transaction fees for historical payments that predate fee capture, by re-checking each reference with Paystack. Safe to re-run.
                {backfill.remaining !== null && (
                  <span style={{ color: "var(--app-text-muted)" }}> · processed {backfill.processed}, remaining {backfill.remaining}</span>
                )}
              </p>
            </div>
            <button onClick={runBackfill} disabled={backfill.running} style={{ ...FIN_PRIMARY_BTN, opacity: backfill.running ? 0.6 : 1 }}>
              {backfill.running ? "Backfilling…" : "Run backfill"}
            </button>
          </div>

          {/* Audit log */}
          <div style={FIN_CARD}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--app-border)" }}>
              <p style={{ ...FIN_LABEL, margin: 0 }}>Audit log</p>
            </div>
            {log.length === 0 ? (
              <p style={{ padding: 20, margin: 0, fontSize: 13, color: "var(--app-text-quiet)" }}>No finance actions recorded yet.</p>
            ) : (
              <div style={{ maxHeight: 340, overflowY: "auto" }}>
                {log.map(e => (
                  <div key={e.id} style={{ display: "flex", gap: 10, padding: "10px 20px", borderBottom: "1px solid var(--app-border)", fontSize: 12.5, alignItems: "baseline" }}>
                    <span style={{ color: "var(--app-text-quiet)", whiteSpace: "nowrap", fontSize: 11 }}>
                      {new Date(e.created_at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span style={{ ...FIN_CHIP, background: "var(--app-surface-strong)", color: "var(--app-text-muted)" }}>{e.action}</span>
                    <span style={{ color: "var(--app-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.actor_email ?? "system"}
                      {e.entity_type === "finance_periods" && e.entity_id ? ` · ${e.entity_id.slice(0, 7)}` : ""}
                      {e.detail && typeof e.detail.amount_ngn === "number" ? ` · ${ngnFull(e.detail.amount_ngn)}` : ""}
                      {e.detail && typeof e.detail.note === "string" && e.detail.note ? ` · “${e.detail.note}”` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
