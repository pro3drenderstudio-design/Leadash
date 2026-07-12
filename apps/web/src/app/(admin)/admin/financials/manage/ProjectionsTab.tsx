"use client";
/**
 * Projections tab — budgets and long-range forecasting share one underlying
 * table (finance_projections): a recurrence='monthly' row IS a budget; rows
 * spread across years ARE a 5-year model. Two views over the same data:
 *  - Budget: current month/quarter, category-by-category Projected vs Actual
 *  - Long-range: multi-year projected-vs-actual chart + full projection list
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TYPES, CATEGORIES, type TxType, type FinanceTransaction } from "@/lib/finance/tax";
import { FIN_PRIMARY_BTN, FIN_GHOST_BTN, FIN_TH, FIN_TD, FIN_CARD, FIN_LABEL, ngnFull, monthBounds } from "./finStyles";

interface Projection {
  id: string; type: TxType; category: string; amount_ngn: number; label: string | null;
  recurrence: "once" | "monthly" | "quarterly" | "yearly"; start_date: string; end_date: string | null;
}
interface Instance { projection_id: string; date: string; type: TxType; category: string; amount_ngn: number }

function ngnShort(n: number) {
  const abs = Math.abs(n);
  const s = abs >= 1_000_000 ? "₦" + (abs / 1_000_000).toFixed(1) + "M" : abs >= 1_000 ? "₦" + Math.round(abs / 1_000) + "k" : "₦" + Math.round(abs);
  return (n < 0 ? "−" : "") + s;
}

function monthsAgo(n: number): string { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 7); }
function monthsAhead(n: number): string { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 7); }
function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-NG", { month: "short", year: "2-digit" });
}

const RECURRENCE_LABEL: Record<Projection["recurrence"], string> = { once: "One-off", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };

function blankDraft() {
  return { type: "opex" as TxType, category: "opex.other", amount: "", label: "", recurrence: "monthly" as Projection["recurrence"], start_date: new Date().toISOString().slice(0, 10), end_date: "" };
}

export default function ProjectionsTab() {
  const [view, setView] = useState<"budget" | "longrange">("budget");
  const [projections, setProjections] = useState<Projection[]>([]);
  const [budgetMonth, setBudgetMonth] = useState(new Date().toISOString().slice(0, 7));
  const [budgetActuals, setBudgetActuals] = useState<FinanceTransaction[]>([]);
  const [budgetInstances, setBudgetInstances] = useState<Instance[]>([]);
  const [horizon, setHorizon] = useState<3 | 12 | 36 | 60>(12);
  const [horizonActuals, setHorizonActuals] = useState<FinanceTransaction[]>([]);
  const [horizonInstances, setHorizonInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(blankDraft());
  const [saving, setSaving] = useState(false);

  const loadProjections = useCallback(async () => {
    const r = await fetch("/api/admin/finance/projections");
    const d = await r.json();
    setProjections(d.projections ?? []);
  }, []);

  const loadBudget = useCallback(async () => {
    setLoading(true);
    const { start, end } = monthBounds(budgetMonth);
    const [txRes, projRes] = await Promise.all([
      fetch(`/api/admin/finance/transactions?start=${start}&end=${end}&limit=2000`).then(r => r.json()),
      fetch(`/api/admin/finance/projections?expand_start=${start}&expand_end=${end}`).then(r => r.json()),
    ]);
    setBudgetActuals(txRes.transactions ?? []);
    setBudgetInstances(projRes.instances ?? []);
    setProjections(projRes.projections ?? []);
    setLoading(false);
  }, [budgetMonth]);

  const loadLongRange = useCallback(async () => {
    setLoading(true);
    const start = monthsAgo(1) + "-01"; // include last month for context
    const end = monthsAhead(horizon) + "-28";
    const [txRes, projRes] = await Promise.all([
      fetch(`/api/admin/finance/transactions?start=${start}&end=${end}&limit=5000`).then(r => r.json()),
      fetch(`/api/admin/finance/projections?expand_start=${start}&expand_end=${end}`).then(r => r.json()),
    ]);
    setHorizonActuals(txRes.transactions ?? []);
    setHorizonInstances(projRes.instances ?? []);
    setProjections(projRes.projections ?? []);
    setLoading(false);
  }, [horizon]);

  useEffect(() => { loadProjections(); }, [loadProjections]);
  useEffect(() => { if (view === "budget") loadBudget(); }, [view, loadBudget]);
  useEffect(() => { if (view === "longrange") loadLongRange(); }, [view, loadLongRange]);

  // Budget view: category -> {budgeted, actual}
  const budgetRows = useMemo(() => {
    const rows = new Map<string, { type: TxType; category: string; budgeted: number; actual: number }>();
    for (const inst of budgetInstances) {
      const key = `${inst.type}:${inst.category}`;
      const row = rows.get(key) ?? { type: inst.type, category: inst.category, budgeted: 0, actual: 0 };
      row.budgeted += inst.amount_ngn;
      rows.set(key, row);
    }
    for (const tx of budgetActuals) {
      const key = `${tx.type}:${tx.category}`;
      const row = rows.get(key) ?? { type: tx.type, category: tx.category, budgeted: 0, actual: 0 };
      row.actual += tx.amount_ngn;
      rows.set(key, row);
    }
    return Array.from(rows.values()).filter(r => r.budgeted !== 0 || r.actual !== 0).sort((a, b) => b.budgeted - a.budgeted);
  }, [budgetInstances, budgetActuals]);

  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    for (let i = -6; i <= 6; i++) opts.push(i <= 0 ? monthsAgo(-i) : monthsAhead(i));
    return opts;
  }, []);

  // Long-range view: bucket by month
  const chartData = useMemo(() => {
    const buckets = new Map<string, { actualRev: number; actualExp: number; projRev: number; projExp: number }>();
    const bucketOf = (iso: string) => iso.slice(0, 7);
    const ensure = (m: string) => buckets.get(m) ?? { actualRev: 0, actualExp: 0, projRev: 0, projExp: 0 };

    for (const tx of horizonActuals) {
      const m = bucketOf(tx.date);
      const b = ensure(m);
      if (tx.type === "revenue") b.actualRev += tx.amount_ngn;
      else if (tx.type === "cogs" || tx.type === "opex") b.actualExp += tx.amount_ngn;
      buckets.set(m, b);
    }
    for (const inst of horizonInstances) {
      const m = bucketOf(inst.date);
      const b = ensure(m);
      if (inst.type === "revenue") b.projRev += inst.amount_ngn;
      else if (inst.type === "cogs" || inst.type === "opex") b.projExp += inst.amount_ngn;
      buckets.set(m, b);
    }

    const months: string[] = [];
    for (let i = -1; i <= horizon; i++) months.push(i <= 0 ? monthsAgo(-i) : monthsAhead(i));
    const dedup = Array.from(new Set(months)).sort();

    return dedup.map(m => {
      const b = ensure(m);
      return { m: monthLabel(m), "Actual revenue": b.actualRev, "Projected revenue": b.projRev, "Actual expenses": b.actualExp, "Projected expenses": b.projExp };
    });
  }, [horizonActuals, horizonInstances, horizon]);

  async function saveProjection() {
    const amount = parseFloat(draft.amount);
    if (!Number.isFinite(amount) || amount < 0) { setError("Enter a valid amount"); return; }
    setSaving(true); setError("");
    const r = await fetch("/api/admin/finance/projections", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, amount_ngn: amount, end_date: draft.end_date || null }),
    });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? "Save failed");
    else {
      setModalOpen(false); setDraft(blankDraft());
      await loadProjections();
      if (view === "budget") await loadBudget(); else await loadLongRange();
    }
    setSaving(false);
  }

  async function deleteProjection(id: string) {
    if (!window.confirm("Delete this projection?")) return;
    await fetch(`/api/admin/finance/projections/${id}`, { method: "DELETE" });
    await loadProjections();
    if (view === "budget") await loadBudget(); else await loadLongRange();
  }

  function openBudgetFor(type: TxType, category: string) {
    setDraft({ ...blankDraft(), type, category, recurrence: "monthly", start_date: `${budgetMonth}-01` });
    setModalOpen(true);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 4, background: "var(--app-surface-strong)", borderRadius: 10, padding: 3, width: "fit-content" }}>
          {(["budget", "longrange"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
              background: view === v ? "var(--app-accent)" : "transparent",
              color: view === v ? "#0A0A0A" : "var(--app-text-muted)",
            }}>
              {v === "budget" ? "Budget" : "Long-range"}
            </button>
          ))}
        </div>
        <button onClick={() => { setDraft(blankDraft()); setModalOpen(true); }} style={FIN_PRIMARY_BTN}>+ Add projection</button>
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--app-out-soft)", border: "1px solid var(--app-out)", color: "var(--app-out)", fontSize: 13 }}>{error}</div>}

      {view === "budget" ? (
        <>
          <select className="fin-input" style={{ width: "auto" }} value={budgetMonth} onChange={e => setBudgetMonth(e.target.value)}>
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>Loading…</div>
          ) : (
            <div style={FIN_CARD}>
              <div style={{ overflowX: "auto" }}>
                <table className="fin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>{["Category", "Budgeted", "Actual", "Variance", "%"].map(h => <th key={h} style={FIN_TH}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {budgetRows.length === 0 ? (
                      <tr><td colSpan={5} style={{ ...FIN_TD, textAlign: "center", color: "var(--app-text-quiet)", padding: 30 }}>
                        No budget set for {budgetMonth} yet — click a category below or "+ Add projection".
                      </td></tr>
                    ) : budgetRows.map(row => {
                      const variance = row.budgeted - row.actual;
                      const pct = row.budgeted > 0 ? (row.actual / row.budgeted) * 100 : null;
                      return (
                        <tr key={`${row.type}:${row.category}`} style={{ borderBottom: "1px solid var(--app-border)" }}>
                          <td style={{ ...FIN_TD, cursor: "pointer" }} onClick={() => openBudgetFor(row.type, row.category)} title="Click to add/edit budget">
                            {CATEGORIES[row.type]?.[row.category] ?? row.category}
                          </td>
                          <td style={FIN_TD}>{ngnFull(row.budgeted)}</td>
                          <td style={FIN_TD}>{ngnFull(row.actual)}</td>
                          <td style={{ ...FIN_TD, color: variance >= 0 ? "var(--app-in, #6EE7B7)" : "var(--app-out)", fontWeight: 600 }}>
                            {variance >= 0 ? "+" : ""}{ngnFull(variance)}
                          </td>
                          <td style={FIN_TD}>{pct !== null ? `${pct.toFixed(0)}%` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 4, background: "var(--app-surface-strong)", borderRadius: 10, padding: 3, width: "fit-content" }}>
            {[{ v: 3, l: "3 mo" }, { v: 12, l: "1 yr" }, { v: 36, l: "3 yr" }, { v: 60, l: "5 yr" }].map(o => (
              <button key={o.v} onClick={() => setHorizon(o.v as 3 | 12 | 36 | 60)} style={{
                padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
                background: horizon === o.v ? "var(--app-accent)" : "transparent",
                color: horizon === o.v ? "#0A0A0A" : "var(--app-text-muted)",
              }}>{o.l}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              <div style={{ ...FIN_CARD, padding: 20 }}>
                <div style={{ width: "100%", height: 300 }}>
                  <ResponsiveContainer>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="m" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => ngnShort(Number(v))} />
                      <Tooltip
                        contentStyle={{ background: "var(--app-bg-elevated)", border: "1px solid var(--app-border-strong)", borderRadius: 8, fontSize: 12, color: "var(--app-text)" }}
                        formatter={((v: unknown, name: unknown) => [ngnFull(Number(v)), name]) as unknown as never}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Actual revenue" fill="var(--app-in)" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Projected revenue" fill="rgba(52,211,153,0.35)" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Actual expenses" fill="var(--app-out)" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Projected expenses" fill="rgba(251,113,133,0.35)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={FIN_CARD}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--app-border)" }}>
                  <p style={{ ...FIN_LABEL, margin: 0 }}>All projections</p>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="fin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr>{["Label", "Type", "Category", "Amount", "Recurrence", "Starts", "Ends", ""].map(h => <th key={h} style={FIN_TH}>{h}</th>)}</tr></thead>
                    <tbody>
                      {projections.length === 0 ? (
                        <tr><td colSpan={8} style={{ ...FIN_TD, textAlign: "center", color: "var(--app-text-quiet)", padding: 30 }}>No projections yet.</td></tr>
                      ) : projections.map(p => (
                        <tr key={p.id} style={{ borderBottom: "1px solid var(--app-border)" }}>
                          <td style={FIN_TD}>{p.label ?? "—"}</td>
                          <td style={FIN_TD}>{TYPES[p.type]}</td>
                          <td style={{ ...FIN_TD, color: "var(--app-text-muted)" }}>{CATEGORIES[p.type]?.[p.category] ?? p.category}</td>
                          <td style={{ ...FIN_TD, fontWeight: 600 }}>{ngnFull(p.amount_ngn)}</td>
                          <td style={FIN_TD}>{RECURRENCE_LABEL[p.recurrence]}</td>
                          <td style={{ ...FIN_TD, whiteSpace: "nowrap" }}>{p.start_date}</td>
                          <td style={{ ...FIN_TD, whiteSpace: "nowrap" }}>{p.end_date ?? "—"}</td>
                          <td style={FIN_TD}><button onClick={() => deleteProjection(p.id)} style={{ ...FIN_GHOST_BTN, color: "var(--app-out)" }}>Delete</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {modalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 440, background: "var(--app-bg-elevated)", border: "1px solid var(--app-border-strong)", borderRadius: 16, padding: 24 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Add projection</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <p style={FIN_LABEL}>Label (optional)</p>
                <input className="fin-input" value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="e.g. Marketing budget, Series A" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <p style={FIN_LABEL}>Type</p>
                  <select className="fin-input" value={draft.type} onChange={e => { const t = e.target.value as TxType; setDraft(d => ({ ...d, type: t, category: Object.keys(CATEGORIES[t])[0] })); }}>
                    {(Object.entries(TYPES) as [TxType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <p style={FIN_LABEL}>Category</p>
                  <select className="fin-input" value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}>
                    {Object.entries(CATEGORIES[draft.type]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <p style={FIN_LABEL}>Amount (₦)</p>
                  <input type="number" min="0" className="fin-input" value={draft.amount} onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))} />
                </div>
                <div>
                  <p style={FIN_LABEL}>Recurrence</p>
                  <select className="fin-input" value={draft.recurrence} onChange={e => setDraft(d => ({ ...d, recurrence: e.target.value as Projection["recurrence"] }))}>
                    {Object.entries(RECURRENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <p style={FIN_LABEL}>Start date</p>
                  <input type="date" className="fin-input" value={draft.start_date} onChange={e => setDraft(d => ({ ...d, start_date: e.target.value }))} />
                </div>
                <div>
                  <p style={FIN_LABEL}>End date (optional)</p>
                  <input type="date" className="fin-input" value={draft.end_date} onChange={e => setDraft(d => ({ ...d, end_date: e.target.value }))} />
                </div>
              </div>
              {error && <p style={{ color: "var(--app-out)", fontSize: 12, margin: 0 }}>{error}</p>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                <button onClick={() => setModalOpen(false)} style={FIN_GHOST_BTN}>Cancel</button>
                <button onClick={saveProjection} disabled={saving} style={{ ...FIN_PRIMARY_BTN, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
