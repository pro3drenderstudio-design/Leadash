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
import { useConfirmDialog } from "./ConfirmDialog";

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

interface DailyRow {
  day: string;
  revenue: number; cost: number; net: number;
  count: number; unreviewed: number; flagged: number;
  closed: boolean; closed_at?: string; close_note?: string | null;
}

export default function AuditTab({ onChanged }: { onChanged?: () => void }) {
  const [queue, setQueue] = useState<FinanceTransaction[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [log, setLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [backfill, setBackfill] = useState<{ running: boolean; processed: number; remaining: number | null }>({ running: false, processed: 0, remaining: null });
  const [dailyRows, setDailyRows] = useState<DailyRow[]>([]);
  const [dailyActing, setDailyActing] = useState<string | null>(null);
  const { confirm, prompt, dialog } = useConfirmDialog();

  const load = useCallback(async () => {
    setLoading(true);
    const [unrev, flagged, periodsRes, logRes, dailyRes] = await Promise.all([
      fetch("/api/admin/finance/transactions?review_status=unreviewed&limit=200").then(r => r.json()),
      fetch("/api/admin/finance/transactions?review_status=flagged&limit=200").then(r => r.json()),
      fetch("/api/admin/finance/periods").then(r => r.json()),
      fetch("/api/admin/finance/audit-log?limit=60").then(r => r.json()),
      fetch("/api/admin/finance/daily-close?days=45").then(r => r.json()),
    ]);
    setQueue([...(flagged.transactions ?? []), ...(unrev.transactions ?? [])]);
    setPeriods(periodsRes.periods ?? []);
    setLog(logRes.entries ?? []);
    setDailyRows(dailyRes.days ?? []);
    setLoading(false);
  }, []);

  async function dailyAction(day: string, action: "close" | "reopen") {
    if (action === "close") {
      const note = await prompt({ title: `Close ${day}?`, body: "Ticks the day as reconciled. Doesn't lock the ledger — the monthly close still does that.", placeholder: "Sign-off note (optional)", confirmLabel: "Close day" });
      if (note === null) return;
      setDailyActing(day);
      const r = await fetch("/api/admin/finance/daily-close", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, action: "close", note: note || undefined }),
      });
      if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? "Close failed");
    } else {
      const ok = await confirm({ title: `Reopen ${day}?`, body: "Removes the daily sign-off. Ledger is unchanged.", confirmLabel: "Reopen", destructive: true });
      if (!ok) return;
      setDailyActing(day);
      const r = await fetch("/api/admin/finance/daily-close", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, action: "reopen" }),
      });
      if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? "Reopen failed");
    }
    setDailyActing(null);
    await load(); onChanged?.();
  }

  useEffect(() => { load(); }, [load]);

  async function review(tx: FinanceTransaction, status: "reviewed" | "flagged") {
    let note: string | null = null;
    if (status === "flagged") {
      note = await prompt({ title: "Flag note", body: "What needs the accountant's attention?", placeholder: "e.g. Duplicate of INV-2934", confirmLabel: "Flag" });
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
      const n = await prompt({
        title: override ? "Override note" : "Sign-off note",
        body: override ? "Why close with unreviewed/flagged items?" : "Optional note recorded in the audit log.",
        placeholder: override ? "e.g. Accepted risk — quarter-end deadline" : "",
        required: override,
        confirmLabel: "Close month",
      });
      if (n === null) return;
      note = n || undefined;
    }
    if (action === "reopen") {
      const ok = await confirm({
        title: `Reopen ${month.slice(0, 7)}?`,
        body: "Its figures become editable again and the investor sync is marked stale.",
        confirmLabel: "Reopen",
        destructive: true,
      });
      if (!ok) return;
    }

    setActing(month);
    setError("");
    const r = await fetch("/api/admin/finance/periods", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period_month: month, action, note, override }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 409 && d.requires_override) {
      setActing(null);
      const ok = await confirm({
        title: "Cannot close cleanly",
        body: `${d.error}\n\nClose anyway with an override note?`,
        confirmLabel: "Continue with override",
        destructive: true,
      });
      if (ok) await periodAction(month, "close", true);
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

          {/* Daily reviews */}
          <div style={FIN_CARD}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--app-border)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <p style={{ ...FIN_LABEL, margin: 0 }}>Daily reviews</p>
              <span style={{ ...FIN_CHIP, background: "var(--app-surface-strong)", color: "var(--app-text-quiet)" }}>
                {dailyRows.filter(d => d.closed).length} / {dailyRows.length} days closed
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: "var(--app-text-quiet)" }}>Tick each day off as the books reconcile against the bank. Doesn't lock the ledger.</span>
            </div>
            <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
              <table className="fin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead style={{ position: "sticky", top: 0, background: "var(--app-bg-elevated)", zIndex: 1 }}>
                  <tr>{["Day", "Revenue", "Cost", "Net", "Rows", "Unreviewed", "Status", ""].map(h => <th key={h} style={FIN_TH}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {dailyRows.map(d => (
                    <tr key={d.day} style={{ borderBottom: "1px solid var(--app-border)", opacity: d.count === 0 && !d.closed ? 0.4 : 1 }}>
                      <td style={{ ...FIN_TD, whiteSpace: "nowrap", fontWeight: 600 }}>{fmtDate(d.day)}</td>
                      <td style={{ ...FIN_TD, whiteSpace: "nowrap", color: "var(--app-in, #6EE7B7)" }}>{ngnFull(d.revenue)}</td>
                      <td style={{ ...FIN_TD, whiteSpace: "nowrap", color: "var(--app-out)" }}>{ngnFull(d.cost)}</td>
                      <td style={{ ...FIN_TD, whiteSpace: "nowrap", fontWeight: 600, color: d.net >= 0 ? "var(--app-in, #6EE7B7)" : "var(--app-out)" }}>{d.net >= 0 ? "+" : ""}{ngnFull(d.net)}</td>
                      <td style={{ ...FIN_TD, color: "var(--app-text-muted)" }}>{d.count}</td>
                      <td style={FIN_TD}>
                        {d.unreviewed > 0 || d.flagged > 0
                          ? <span style={{ ...FIN_CHIP, background: "var(--app-warning-soft)", color: "var(--app-warning)" }}>{d.unreviewed + d.flagged} pending</span>
                          : <span style={{ fontSize: 11.5, color: "var(--app-text-quiet)" }}>—</span>}
                      </td>
                      <td style={FIN_TD}>
                        {d.closed
                          ? <span style={{ ...FIN_CHIP, background: "rgba(52,211,153,0.14)", color: "#6EE7B7" }}>closed</span>
                          : <span style={{ ...FIN_CHIP, background: "var(--app-surface-strong)", color: "var(--app-text-quiet)" }}>open</span>}
                        {d.close_note && <span style={{ display: "block", fontSize: 10.5, color: "var(--app-text-quiet)", marginTop: 3, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.close_note}>“{d.close_note}”</span>}
                      </td>
                      <td style={{ ...FIN_TD, textAlign: "right", whiteSpace: "nowrap" }}>
                        {d.closed
                          ? <button onClick={() => dailyAction(d.day, "reopen")} disabled={dailyActing === d.day} style={FIN_GHOST_BTN}>Reopen</button>
                          : <button onClick={() => dailyAction(d.day, "close")} disabled={dailyActing === d.day || d.count === 0} style={FIN_GHOST_BTN}>Close day</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
      {dialog}
    </div>
  );
}
