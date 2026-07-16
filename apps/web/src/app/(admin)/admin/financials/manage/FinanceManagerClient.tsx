"use client";

/**
 * Finance Manager UI — full client. Talks to /api/admin/finance/* endpoints.
 *
 * Layout mirrors the design in docs/design/Leadash Finance.html:
 *   ── Header: Back → Financials, page title, range chips, contextual primary
 *   ── Test-exclusion banner (only when income has test rows)
 *   ── Tabs: Overview / Expenses / Income / Reports
 *   ── Overview: 4 hero KPI cards + In-vs-Out chart + income/expense splits
 *      + Looking-ahead projection. Charts + splits hide until data exists.
 *   ── Expenses: Recurring + One-off tables with edit/pause/delete
 *   ── Income: List with per-row test toggle + Add income button
 *   ── Reports: P&L table + CSV export + print
 *   ── Add/Edit modal: shared for expense (recurring or one-off) and income
 *
 * All computation is client-side (small dataset — expected < few hundred
 * rows). Amount changes on recurring expenses walk finance_expense_history
 * so historical totals reflect the original amount.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { CATEGORIES as LEDGER_CATEGORIES } from "@/lib/finance/tax";
import LedgerTab from "./LedgerTab";
import { useConfirmDialog } from "./ConfirmDialog";
import TaxTab from "./TaxTab";
import AuditTab from "./AuditTab";
import BankAccountsTab from "./BankAccountsTab";
import ProjectionsTab from "./ProjectionsTab";

// ─── Types ───────────────────────────────────────────────────────────────────

type Kind = "recurring" | "oneoff";
type Category = "infra" | "salaries" | "fees" | "marketing" | "software" | "oneoff" | "refunds";
type IncomeType = "plan" | "academy" | "offer" | "credits" | "addon" | "external" | "partner" | "consulting" | "grant";
type Range = "month" | "quarter" | "year";
type Tab = "overview" | "expenses" | "income" | "ledger" | "bank" | "tax" | "projections" | "audit" | "reports";

interface Expense {
  id: string;
  kind: Kind;
  name: string;
  category: Category;
  amount_ngn: number;
  since: string;
  status: "active" | "paused";
  history?: { effective_from: string; amount_ngn: number }[];
}

interface Income {
  id: string;
  source_label: string;
  type: IncomeType;
  amount_ngn: number;
  date: string;
  is_test: boolean;
  is_manual: boolean;
}

interface Settings {
  reserves_ngn: number;
}

// ─── Category + income-type metadata ────────────────────────────────────────

const CATS: Record<Category, { label: string; color: string; bg: string; fg: string }> = {
  infra:     { label: "Infrastructure",   color: "var(--app-info)",    bg: "var(--app-info-soft)",    fg: "var(--app-info)"    },
  salaries:  { label: "Salaries",         color: "var(--app-accent)",  bg: "var(--app-accent-soft)",  fg: "var(--app-accent)"  },
  fees:      { label: "Payment fees",     color: "var(--app-cyan)",    bg: "var(--app-cyan-soft)",    fg: "var(--app-cyan)"    },
  marketing: { label: "Marketing",        color: "var(--app-violet)",  bg: "var(--app-violet-soft)",  fg: "var(--app-violet)"  },
  software:  { label: "Software & tools", color: "var(--app-warning)", bg: "var(--app-warning-soft)", fg: "var(--app-warning)" },
  oneoff:    { label: "Other",            color: "#94A3B8",            bg: "rgba(148,163,184,0.14)",  fg: "#CBD5E1"            },
  refunds:   { label: "Refunds",          color: "var(--app-out)",     bg: "var(--app-out-soft)",     fg: "var(--app-out)"     },
};

const INCOME_TYPES: Record<IncomeType, { label: string; bg: string; fg: string }> = {
  plan:       { label: "Plan",              bg: "rgba(96,165,250,0.14)",  fg: "#93C5FD" },
  academy:    { label: "Academy",           bg: "rgba(52,211,153,0.14)",  fg: "#6EE7B7" },
  offer:      { label: "Offer",             bg: "rgba(167,139,250,0.14)", fg: "#C4B5FD" },
  credits:    { label: "Credits",           bg: "rgba(251,191,36,0.14)",  fg: "#FCD34D" },
  addon:      { label: "Add-on",            bg: "rgba(34,211,238,0.14)",  fg: "#67E8F9" },
  external:   { label: "External campaign", bg: "rgba(249,115,22,0.14)",  fg: "#FDBA74" },
  partner:    { label: "Partnership",       bg: "rgba(52,211,153,0.14)",  fg: "#6EE7B7" },
  consulting: { label: "Consulting",        bg: "rgba(96,165,250,0.14)",  fg: "#93C5FD" },
  grant:      { label: "Grant / other",     bg: "rgba(148,163,184,0.14)", fg: "#CBD5E1" },
};

const EXPENSE_CATS: Category[] = ["infra", "salaries", "fees", "marketing", "software", "oneoff", "refunds"];
const MANUAL_INCOME_TYPES: IncomeType[] = ["external", "partner", "consulting", "grant"];

// ─── Formatters ─────────────────────────────────────────────────────────────

function ngn(n: number) {
  const neg = n < 0;
  const abs = Math.abs(Math.round(n));
  let s: string;
  if (abs >= 1_000_000)      s = "₦" + (abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2) + "M";
  else if (abs >= 1_000)     s = "₦" + Math.round(abs / 1_000) + "k";
  else                       s = "₦" + abs;
  return (neg ? "−" : "") + s;
}
function ngnFull(n: number) { return "₦" + Math.round(Math.abs(n)).toLocaleString("en-NG"); }
function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "2-digit" });
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

// ─── Range helpers ──────────────────────────────────────────────────────────

function rangeMonths(r: Range) { return r === "month" ? 1 : r === "quarter" ? 3 : 12; }
function rangeLabel(r: Range)  { return r === "month" ? "This month" : r === "quarter" ? "Last 3 months" : "Last 12 months"; }

/** Maps a finance_expenses.category to the finance_transactions.category it
 *  mirrors to via mig 20260716120000. Keeps recurring cost splits consistent
 *  with the ledger's taxonomy on Overview. */
function expenseCategoryToTxCategory(cat: Category): string {
  switch (cat) {
    case "infra":     return "cogs.infrastructure";
    case "salaries":  return "opex.salary";
    case "fees":      return "cogs.payment_fees";
    case "marketing": return "cogs.ad_spend";
    case "software":  return "opex.tools";
    case "oneoff":    return "opex.other";
    case "refunds":   return "cogs.refunds";
    default:          return "opex.other";
  }
}

/** Effective amount for a recurring expense N months ago. Walks history. */
function recAmountAtMonthsAgo(rec: Expense, monthsAgo: number): number {
  const d = new Date(); d.setMonth(d.getMonth() - monthsAgo); d.setDate(1);
  const history = rec.history ?? [];
  let amt = rec.amount_ngn;
  for (const h of history) {
    if (new Date(h.effective_from + "T00:00:00") <= d) amt = h.amount_ngn;
  }
  return amt;
}

// ─── Draft type for the modal ───────────────────────────────────────────────

type DraftKind = "recurring" | "oneoff" | "income";
interface Draft {
  kind: DraftKind;
  name: string;      // "name" for expense, "source_label" for income
  amount: string;    // string for input; parsed on save
  category: string;  // Category or IncomeType
  date: string;
}

// ─── Toast ──────────────────────────────────────────────────────────────────

function useToast() {
  const [msg, setMsg] = useState<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(""), 2500);
  };
  return { msg, show };
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function FinanceManagerClient() {
  const [recurring,  setRecurring]  = useState<Expense[]>([]);
  const [oneoff,     setOneoff]     = useState<Expense[]>([]);
  const [income,     setIncome]     = useState<Income[]>([]);
  const [settings,   setSettings]   = useState<Settings>({ reserves_ngn: 0 });
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  const [tab,        setTab]        = useState<Tab>("overview");
  const [range,      setRange]      = useState<Range>("month");
  const [showTest,   setShowTest]   = useState(false);
  const [growth,     setGrowth]     = useState(6);

  const [modalOpen,  setModalOpen]  = useState(false);
  const [modalMode,  setModalMode]  = useState<"expense" | "income">("expense");
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [draft,      setDraft]      = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string>("");
  const [saving,     setSaving]     = useState(false);


  // Ledger transactions for the selected range window — the single source of
  // truth for Overview totals + chart. finance_income and one-off finance_expenses
  // are mirrored into finance_transactions by DB triggers, so reading ledger
  // captures manual entries + Paystack auto rows + refund inverses in one query.
  // Recurring expenses stay in finance_expenses (walked by history) and are
  // layered on top of the ledger cost total below.
  type LedgerRow = { id: string; date: string; type: "revenue" | "cogs" | "opex" | "tax" | "equity"; category: string; amount_ngn: number; is_test: boolean; kind: string | null };
  const [ledgerTxs, setLedgerTxs] = useState<LedgerRow[]>([]);
  const [ledger12mo, setLedger12mo] = useState<LedgerRow[]>([]);

  useEffect(() => {
    const start = new Date();
    start.setMonth(start.getMonth() - (rangeMonths(range) - 1));
    start.setDate(1);
    fetch(`/api/admin/finance/transactions?start=${start.toISOString().slice(0, 10)}&limit=5000`)
      .then(r => r.json())
      .then((d: { transactions?: LedgerRow[] }) => setLedgerTxs((d.transactions ?? []).filter(t => !t.is_test)))
      .catch(() => setLedgerTxs([]));
  }, [range]);

  // 12-month ledger for the In-vs-Out chart (independent of the range chip).
  useEffect(() => {
    const start = new Date();
    start.setMonth(start.getMonth() - 11);
    start.setDate(1);
    fetch(`/api/admin/finance/transactions?start=${start.toISOString().slice(0, 10)}&limit=10000`)
      .then(r => r.json())
      .then((d: { transactions?: LedgerRow[] }) => setLedger12mo((d.transactions ?? []).filter(t => !t.is_test)))
      .catch(() => setLedger12mo([]));
  }, []);

  const feesNgn = useMemo(
    () => ledgerTxs.filter(t => t.category === "cogs.payment_fees").reduce((s, t) => s + t.amount_ngn, 0),
    [ledgerTxs],
  );

  const [totalCashNgn, setTotalCashNgn] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/admin/finance/bank-accounts?period=day")
      .then(r => r.json())
      .then((d: { total_current_balance?: number }) => setTotalCashNgn(d.total_current_balance ?? null))
      .catch(() => setTotalCashNgn(null));
  }, []);

  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  // ── Load all data ────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ex, inc, set] = await Promise.all([
        fetch("/api/admin/finance/expenses").then(r => r.json()),
        fetch("/api/admin/finance/income").then(r => r.json()),
        fetch("/api/admin/finance/settings").then(r => r.json()),
      ]);
      if (ex.error)  throw new Error(ex.error);
      if (inc.error) throw new Error(inc.error);
      if (set.error) throw new Error(set.error);
      setRecurring(ex.recurring ?? []);
      setOneoff(ex.oneoff ?? []);
      setIncome(inc.income ?? []);
      setSettings(set.settings ?? { reserves_ngn: 0 });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load finance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Computed totals ──────────────────────────────────────────────────────

  const totals = useMemo(() => {
    const months = rangeMonths(range);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const winStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    // Test-flagged rows: still shown in income tab, but excluded from ledger
    // by the fetch filter above. Show the callout from finance_income directly.
    let testSum = 0, testCount = 0;
    for (const t of income) if (t.is_test) { testSum += t.amount_ngn; testCount++; }

    // Ledger drives money in and (most of) money out. Refund inverses live
    // as cogs.refunds rows, so they naturally subtract from profit.
    let moneyIn = 0, ledgerOut = 0;
    const incomeBy: Record<string, number> = {};
    const expBy: Record<string, number> = {};
    let monthlyIn = 0;
    for (const tx of ledgerTxs) {
      const d = new Date(tx.date + "T00:00:00");
      if (d < winStart) continue;
      if (tx.type === "revenue") {
        moneyIn += tx.amount_ngn;
        incomeBy[tx.category] = (incomeBy[tx.category] ?? 0) + tx.amount_ngn;
        if (d >= monthStart) monthlyIn += tx.amount_ngn;
      } else if (tx.type === "cogs" || tx.type === "opex" || tx.type === "tax") {
        ledgerOut += tx.amount_ngn;
        expBy[tx.category] = (expBy[tx.category] ?? 0) + tx.amount_ngn;
      }
      // equity is capital in/out; excluded from operating money-in/out totals.
    }

    // Recurring expenses layer on top of the ledger (they're not mirrored —
    // finance_expense_history is required for correct per-month accrual).
    let recMonthly = 0, recSum = 0;
    for (const r of recurring) {
      if (r.status !== "active") continue;
      recMonthly += recAmountAtMonthsAgo(r, 0);
      for (let m = 0; m < months; m++) {
        const amt = recAmountAtMonthsAgo(r, m);
        recSum += amt;
        // Bucket recurring into the ledger's cost taxonomy for a unified split.
        const tCat = expenseCategoryToTxCategory(r.category);
        expBy[tCat] = (expBy[tCat] ?? 0) + amt;
      }
    }

    const moneyOut = ledgerOut + recSum;
    const profit   = moneyIn - moneyOut;

    // Payment count this month — count of ledger revenue rows dated this month.
    const payCount = ledgerTxs.filter(t => t.type === "revenue" && new Date(t.date + "T00:00:00") >= monthStart).length;

    // Runway: months of cash left at the current burn rate. The cushion is
    // the live total across active bank accounts (fetched separately) — not
    // a manually-maintained reserves figure. Withdrawals shrink cash, which
    // shrinks runway automatically.
    const cushion = totalCashNgn ?? 0;
    const runwayMonths = profit >= 0
      ? null
      : (cushion > 0 ? Math.floor(cushion / (-profit / months)) : 0);

    return { months, moneyIn, moneyOut, profit, testSum, testCount, incomeBy, expBy, recMonthly, oneoffSum: 0, monthlyIn, payCount, runwayMonths };
  }, [ledgerTxs, income, recurring, range, totalCashNgn]);

  const hasAnyData = totals.moneyIn > 0 || totals.moneyOut > 0;

  // ── 12-month in/out chart data ───────────────────────────────────────────

  const chartData = useMemo(() => {
    if (!hasAnyData) return [];
    const now = new Date();
    const points: { m: string; in: number; out: number }[] = [];

    // Real per-month sums from the ledger (which already includes mirrored
    // one-off + manual income + auto Paystack + refund inverses) plus the
    // recurring baseline layered on top per month.
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const key = d.toLocaleDateString("en-NG", { month: "short" });

      let inSum = 0, outSum = 0;
      for (const tx of ledger12mo) {
        const td = new Date(tx.date + "T00:00:00");
        if (td < d || td >= nextMonth) continue;
        if (tx.type === "revenue") inSum += tx.amount_ngn;
        else if (tx.type === "cogs" || tx.type === "opex" || tx.type === "tax") outSum += tx.amount_ngn;
      }
      for (const r of recurring) {
        if (r.status !== "active") continue;
        outSum += recAmountAtMonthsAgo(r, i);
      }
      points.push({ m: key, in: inSum, out: outSum });
    }
    return points;
  }, [ledger12mo, recurring, hasAnyData]);

  // ── Looking-ahead projection ────────────────────────────────────────────

  const projection = useMemo(() => {
    if (!hasAnyData) return { nextIn: 0, nextOut: 0, nextProfit: 0 };
    const g = growth / 100;
    const nextIn  = totals.monthlyIn * (1 + g);
    const nextOut = totals.recMonthly;
    return { nextIn, nextOut, nextProfit: nextIn - nextOut };
  }, [growth, totals.monthlyIn, totals.recMonthly, hasAnyData]);

  // ── Modal helpers ────────────────────────────────────────────────────────

  function openAddExpense() {
    setModalMode("expense");
    setEditingId(null);
    setDraftError("");
    setDraft({ kind: "recurring", name: "", amount: "", category: "infra", date: todayISO() });
    setModalOpen(true);
  }

  function openAddIncome() {
    setModalMode("income");
    setEditingId(null);
    setDraftError("");
    setDraft({ kind: "income", name: "", amount: "", category: "external", date: todayISO() });
    setModalOpen(true);
  }

  function openEditExpense(e: Expense) {
    setModalMode("expense");
    setEditingId(e.id);
    setDraftError("");
    setDraft({
      kind: e.kind,
      name: e.name,
      amount: String(e.amount_ngn),
      category: e.category,
      date: e.since,
    });
    setModalOpen(true);
  }

  function openEditIncome(i: Income) {
    setModalMode("income");
    setEditingId(i.id);
    setDraftError("");
    setDraft({
      kind: "income",
      name: i.source_label,
      amount: String(i.amount_ngn),
      category: i.type,
      date: i.date,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setDraft(null);
    setDraftError("");
  }

  async function saveDraft() {
    if (!draft) return;
    const amt = parseInt(String(draft.amount).replace(/[^0-9]/g, ""), 10);
    if (!draft.name.trim()) { setDraftError("Give it a name."); return; }
    if (!amt || amt <= 0)   { setDraftError("Enter an amount greater than zero."); return; }
    if (!draft.date)        { setDraftError("Pick a date."); return; }

    setSaving(true);
    try {
      if (modalMode === "income") {
        if (editingId) {
          const res = await fetch("/api/admin/finance/income", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: editingId, source_label: draft.name.trim(), type: draft.category,
              amount_ngn: amt, date: draft.date,
            }),
          }).then(r => r.json());
          if (res.error) throw new Error(res.error);
          setIncome(prev => prev.map(x => x.id === editingId ? res.income : x));
          toast.show("Income updated");
        } else {
          const res = await fetch("/api/admin/finance/income", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source_label: draft.name.trim(), type: draft.category,
              amount_ngn: amt, date: draft.date,
            }),
          }).then(r => r.json());
          if (res.error) throw new Error(res.error);
          setIncome(prev => [res.income, ...prev]);
          toast.show("Income added");
        }
      } else {
        // expense
        if (editingId) {
          const res = await fetch("/api/admin/finance/expenses", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: editingId, name: draft.name.trim(), category: draft.category,
              amount_ngn: amt, since: draft.date,
            }),
          }).then(r => r.json());
          if (res.error) throw new Error(res.error);
          // Reload to pick up new history row on amount change.
          await load();
          toast.show("Expense updated");
        } else {
          const kind: Kind = draft.kind === "oneoff" ? "oneoff" : "recurring";
          const res = await fetch("/api/admin/finance/expenses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind, name: draft.name.trim(), category: draft.category,
              amount_ngn: amt, since: draft.date,
            }),
          }).then(r => r.json());
          if (res.error) throw new Error(res.error);
          if (kind === "recurring") setRecurring(prev => [{ ...res.expense, history: [{ effective_from: draft.date, amount_ngn: amt }] }, ...prev]);
          else                       setOneoff(prev => [res.expense, ...prev]);
          toast.show("Expense added");
        }
      }
      closeModal();
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEditing() {
    if (!editingId) return;
    const ok = await confirm({
      title: modalMode === "income" ? "Delete this income row?" : "Delete this expense?",
      body: "This can't be undone.",
      destructive: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      if (modalMode === "income") {
        const res = await fetch(`/api/admin/finance/income?id=${editingId}`, { method: "DELETE" }).then(r => r.json());
        if (res.error) throw new Error(res.error);
        setIncome(prev => prev.filter(i => i.id !== editingId));
        toast.show("Income removed");
      } else {
        const res = await fetch(`/api/admin/finance/expenses?id=${editingId}`, { method: "DELETE" }).then(r => r.json());
        if (res.error) throw new Error(res.error);
        setRecurring(prev => prev.filter(r => r.id !== editingId));
        setOneoff(prev => prev.filter(r => r.id !== editingId));
        toast.show("Expense removed");
      }
      closeModal();
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function togglePause(e: Expense) {
    try {
      const res = await fetch(`/api/admin/finance/expenses/${e.id}/pause`, { method: "POST" }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      setRecurring(prev => prev.map(x => x.id === e.id ? { ...res.expense, history: x.history } : x));
      toast.show(res.expense.status === "paused" ? "Expense paused" : "Expense resumed");
    } catch (err: unknown) {
      toast.show(err instanceof Error ? err.message : "Failed");
    }
  }

  async function toggleTest(i: Income) {
    try {
      const res = await fetch(`/api/admin/finance/income/${i.id}/test`, { method: "POST" }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      setIncome(prev => prev.map(x => x.id === i.id ? res.income : x));
      toast.show(res.income.is_test ? "Marked as test" : "Restored to totals");
    } catch (err: unknown) {
      toast.show(err instanceof Error ? err.message : "Failed");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const nonTestIncome = income.filter(i => !i.is_test);
  const visibleIncome = showTest ? income : nonTestIncome;

  return (
    <div className="v2-app finance-mgr" style={{ minHeight: "100%", background: "var(--app-bg)", color: "var(--app-text)" }}>
      <style>{FIN_CSS}</style>

      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, maxWidth: 1400, margin: "0 auto" }} className="finance-shell">

        {/* Header */}
        <header>
          <Link href="/admin/financials" style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 12, color: "var(--app-text-muted)", textDecoration: "none", marginBottom: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to Financials
          </Link>

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.2 }}>Finance</h1>
              <p style={{ fontSize: 13, color: "var(--app-text-quiet)", marginTop: 4 }}>
                Manage expenses, income, profit and reports for Leadash.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* Range chips */}
              <div style={{ display: "flex", gap: 4, padding: 3, border: "1px solid var(--app-border)", borderRadius: 8, background: "var(--app-surface)" }}>
                {(["month", "quarter", "year"] as const).map(r => (
                  <button key={r} onClick={() => setRange(r)} style={{
                    height: 26, padding: "0 11px", borderRadius: 5, border: "none", cursor: "pointer",
                    fontSize: 12, fontWeight: 500,
                    background: range === r ? "var(--app-surface-strong)" : "transparent",
                    color:      range === r ? "var(--app-text)"           : "var(--app-text-muted)",
                  }}>
                    {r === "month" ? "This month" : r === "quarter" ? "Quarter" : "Year"}
                  </button>
                ))}
              </div>

              {/* Contextual primary action */}
              {(tab === "expenses" || tab === "overview") && (
                <button onClick={openAddExpense} style={FIN_PRIMARY_BTN}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Add expense
                </button>
              )}
              {tab === "income" && (
                <button onClick={openAddIncome} style={FIN_PRIMARY_BTN}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Add income
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Test-exclusion banner */}
        {totals.testCount > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
            borderRadius: 12, border: "1px solid var(--app-border-strong)", background: "var(--app-surface)",
            flexWrap: "wrap",
          }}>
            <span style={{
              width: 26, height: 26, borderRadius: 7, background: "var(--app-surface-strong)",
              display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--app-warning)", flexShrink: 0,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 180 }}>
              <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>
                {totals.testCount} {totals.testCount === 1 ? "payment" : "payments"} hidden from all totals
              </p>
              <p style={{ fontSize: 11.5, color: "var(--app-text-quiet)", marginTop: 2 }}>
                These are flagged as test payments. Numbers below reflect the real business. Worth {ngnFull(totals.testSum)}.
              </p>
            </div>
            <button onClick={() => setTab("income")} style={FIN_GHOST_BTN}>Review flagged</button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, borderBottom: "1px solid var(--app-border)", overflowX: "auto" }}>
          {(["overview", "expenses", "income", "ledger", "bank", "tax", "projections", "audit", "reports"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              position: "relative", height: 40, padding: "0 14px", border: "none", background: "transparent",
              cursor: "pointer", fontSize: 13, whiteSpace: "nowrap",
              color: tab === t ? "var(--app-text)" : "var(--app-text-muted)",
              fontWeight: tab === t ? 600 : 500,
            }}>
              {t === "tax" ? "Tax" : t === "audit" ? "Audit & Close" : t === "bank" ? "Bank Accounts" : t === "projections" ? "Projections" : t.charAt(0).toUpperCase() + t.slice(1)}
              {tab === t && <span style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 2, background: "var(--app-accent)", borderRadius: 2 }} />}
            </button>
          ))}
        </div>

        {/* Loading + error */}
        {loading && <div style={{ padding: 40, textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>Loading…</div>}
        {error && !loading && <div style={{ padding: 16, background: "var(--app-out-soft)", border: "1px solid var(--app-out)", borderRadius: 10, color: "var(--app-out)", fontSize: 13 }}>{error}</div>}

        {/* Tab: OVERVIEW */}
        {!loading && !error && tab === "overview" && (
          <OverviewTab
            totals={totals}
            range={range}
            hasAnyData={hasAnyData}
            chartData={chartData}
            projection={projection}
            growth={growth}
            onGrowth={setGrowth}
            feesNgn={feesNgn}
            totalCashNgn={totalCashNgn}
          />
        )}

        {/* Tab: EXPENSES */}
        {!loading && !error && tab === "expenses" && (
          <ExpensesTab
            recurring={recurring}
            oneoff={oneoff}
            onEdit={openEditExpense}
            onTogglePause={togglePause}
            onAdd={openAddExpense}
          />
        )}

        {/* Tab: INCOME */}
        {!loading && !error && tab === "income" && (
          <IncomeTab onAdd={openAddIncome} />
        )}

        {/* Tab: LEDGER */}
        {!loading && !error && tab === "ledger" && <LedgerTab />}

        {/* Tab: BANK ACCOUNTS */}
        {!loading && !error && tab === "bank" && <BankAccountsTab />}

        {/* Tab: TAX */}
        {!loading && !error && tab === "tax" && <TaxTab />}

        {/* Tab: PROJECTIONS */}
        {!loading && !error && tab === "projections" && <ProjectionsTab />}

        {/* Tab: AUDIT & CLOSE */}
        {!loading && !error && tab === "audit" && <AuditTab />}

        {/* Tab: REPORTS */}
        {!loading && !error && tab === "reports" && (
          <ReportsTab totals={totals} range={range} recurring={recurring} oneoff={oneoff} />
        )}
      </div>

      {/* Modal */}
      {modalOpen && draft && (
        <Modal
          mode={modalMode}
          editing={!!editingId}
          draft={draft}
          setDraft={setDraft}
          error={draftError}
          saving={saving}
          onCancel={closeModal}
          onSave={saveDraft}
          onDelete={editingId ? deleteEditing : undefined}
        />
      )}

      {/* Toast */}
      {toast.msg && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          padding: "10px 18px", borderRadius: 999, background: "var(--app-bg-elevated)",
          border: "1px solid var(--app-border-strong)", color: "var(--app-text)",
          fontSize: 13, boxShadow: "0 12px 32px rgba(0,0,0,0.4)", zIndex: 200,
        }}>
          {toast.msg}
        </div>
      )}

      {confirmDialog}
    </div>
  );
}

// ─── Overview tab ───────────────────────────────────────────────────────────

interface OverviewProps {
  totals: {
    moneyIn: number; moneyOut: number; profit: number; runwayMonths: number | null;
    monthlyIn: number; recMonthly: number; oneoffSum: number;
    incomeBy: Record<string, number>; expBy: Record<string, number>;
  };
  range: Range;
  hasAnyData: boolean;
  chartData: { m: string; in: number; out: number }[];
  projection: { nextIn: number; nextOut: number; nextProfit: number };
  growth: number;
  onGrowth: (g: number) => void;
  feesNgn: number;
  totalCashNgn: number | null;
}

function OverviewTab({ totals, range, hasAnyData, chartData, projection, growth, onGrowth, feesNgn, totalCashNgn }: OverviewProps) {
  const marginPct = totals.moneyIn > 0 ? Math.round((totals.profit / totals.moneyIn) * 100) : 0;
  const rLabel = rangeLabel(range);

  const HERO = [
    {
      label: "Money in",   value: ngn(totals.moneyIn),
      sub: feesNgn > 0
        ? `${rLabel} · net ${ngn(totals.moneyIn - feesNgn)} after ${ngn(feesNgn)} Paystack fees`
        : `${rLabel} · after test cleanup`,
      valColor: "var(--app-in)", iconBg: "var(--app-in-soft)", iconFg: "var(--app-in)",
      icon: <><path d="M12 5v14" /><path d="M5 12l7 7 7-7" /></>,
    },
    {
      label: "Money out",  value: ngn(totals.moneyOut), sub: `${rLabel} · all expenses`,
      valColor: "var(--app-out)", iconBg: "var(--app-out-soft)", iconFg: "var(--app-out)",
      icon: <><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></>,
    },
    {
      label: totals.profit >= 0 ? "Profit (what's left)" : "Loss",
      value: ngn(totals.profit), sub: `${marginPct}% profit margin`,
      valColor: totals.profit >= 0 ? "var(--app-in)" : "var(--app-out)",
      iconBg: "var(--app-accent-soft)", iconFg: "var(--app-accent)",
      icon: <><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></>,
      border: "var(--app-accent-line)",
    },
    {
      label: "Runway",
      value: totals.runwayMonths === null ? "Healthy" : `${totals.runwayMonths} mo`,
      sub: totals.runwayMonths === null
        ? "Making money — cash growing"
        : `Months of cash left at this burn · uses total bank cash`,
      valColor: totals.runwayMonths === null ? "var(--app-text)" : "var(--app-warning)",
      iconBg: "var(--app-info-soft)", iconFg: "var(--app-info)",
      icon: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
    },
    ...(totalCashNgn !== null ? [{
      label: "Total cash on hand",
      value: ngn(totalCashNgn), sub: "Across all active bank accounts",
      valColor: totalCashNgn >= 0 ? "var(--app-in)" : "var(--app-out)",
      iconBg: "var(--app-cyan-soft)", iconFg: "var(--app-cyan)",
      icon: <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" /></>,
    }] : []),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Hero cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }} className="finance-hero">
        {HERO.map(h => (
          <div key={h.label} style={{
            background: "var(--app-bg-elevated)", border: `1px solid ${h.border ?? "var(--app-border)"}`,
            borderRadius: 14, padding: "16px 17px", display: "flex", flexDirection: "column", gap: 9, minWidth: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--app-text-quiet)", letterSpacing: "0.03em", textTransform: "uppercase" }}>
                {h.label}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 26, height: 26, borderRadius: 7, background: h.iconBg,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", color: h.iconFg, flexShrink: 0,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                    {h.icon}
                  </svg>
                </span>
              </div>
            </div>
            <p style={{
              fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", margin: 0,
              fontVariantNumeric: "tabular-nums", color: h.valColor,
            }}>
              {h.value}
            </p>
            <p style={{ fontSize: 11.5, color: "var(--app-text-quiet)", margin: 0 }}>{h.sub}</p>
          </div>
        ))}
      </div>

      {/* Empty state — hides charts + breakdowns */}
      {!hasAnyData && (
        <div style={{
          padding: "48px 24px", borderRadius: 14, border: "1px dashed var(--app-border-strong)",
          background: "var(--app-bg-elevated)", textAlign: "center",
        }}>
          <div style={{ display: "inline-flex", width: 44, height: 44, borderRadius: 10, background: "var(--app-surface)", alignItems: "center", justifyContent: "center", color: "var(--app-text-muted)", marginBottom: 12 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" />
            </svg>
          </div>
          <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>No finance data yet</p>
          <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)", margin: "6px auto 0", maxWidth: 380 }}>
            Add your first expense or income row and Overview will start showing charts, breakdowns and projections.
          </p>
        </div>
      )}

      {/* Charts + breakdowns (data-dependent) */}
      {hasAnyData && (
        <>
          {/* In vs Out chart */}
          <div style={{ background: "var(--app-bg-elevated)", border: "1px solid var(--app-border)", borderRadius: 14, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Money in vs money out</h2>
                <p style={{ fontSize: 12, color: "var(--app-text-quiet)", margin: "3px 0 0" }}>Last 12 months · NGN</p>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 11, color: "var(--app-text-quiet)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--app-in)" }} /> Money in
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--app-out)" }} /> Money out
                </span>
              </div>
            </div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="m" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => ngn(v)} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    contentStyle={{ background: "var(--app-bg-elevated)", border: "1px solid var(--app-border-strong)", borderRadius: 8, fontSize: 12, color: "var(--app-text)" }}
                    formatter={((v: unknown, name: unknown) => [ngnFull(Number(v)), name === "in" ? "Money in" : "Money out"]) as unknown as never}
                  />
                  <Legend content={() => null} />
                  <Bar dataKey="in"  fill="var(--app-in)"  radius={[4, 4, 0, 0]} />
                  <Bar dataKey="out" fill="var(--app-out)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Splits: where money comes from + where it goes */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }} className="finance-splits">
            <SplitCard
              title="Where money comes from"
              rows={Object.entries(totals.incomeBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
                label: LEDGER_CATEGORIES.revenue[k] ?? k,
                color: "var(--app-info)",
                value: v,
                total: Object.values(totals.incomeBy).reduce((s, x) => s + x, 0) || 1,
              }))}
            />
            <SplitCard
              title="Where money goes"
              rows={Object.entries(totals.expBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
                label: LEDGER_CATEGORIES.cogs[k] ?? LEDGER_CATEGORIES.opex[k] ?? LEDGER_CATEGORIES.tax[k] ?? k,
                color: k.startsWith("cogs.") ? "var(--app-warning)" : k.startsWith("tax.") ? "var(--app-violet)" : "var(--app-accent)",
                value: v,
                total: Object.values(totals.expBy).reduce((s, x) => s + x, 0) || 1,
              }))}
            />
          </div>

          {/* Looking ahead */}
          <div style={{ background: "var(--app-bg-elevated)", border: "1px solid var(--app-border)", borderRadius: 14, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>Looking ahead</h3>
                <p style={{ fontSize: 12, color: "var(--app-text-quiet)", margin: "3px 0 0" }}>
                  If income grows {growth}% month-over-month and recurring costs stay put.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--app-text-muted)" }}>
                <label htmlFor="growth-slider">Growth: {growth}%</label>
                <input
                  id="growth-slider" type="range" min={-20} max={40} value={growth}
                  onChange={e => onGrowth(parseInt(e.target.value, 10))}
                  style={{ width: 140 }}
                />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }} className="finance-projection">
              <ProjectionCard label="Next month · Money in"   value={ngn(projection.nextIn)}  color="var(--app-in)" />
              <ProjectionCard label="Next month · Money out"  value={ngn(projection.nextOut)} color="var(--app-out)" />
              <ProjectionCard label="Next month · Profit"     value={ngn(projection.nextProfit)} color={projection.nextProfit >= 0 ? "var(--app-in)" : "var(--app-out)"} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SplitCard({ title, rows }: { title: string; rows: { label: string; color: string; value: number; total: number }[] }) {
  return (
    <div style={{ background: "var(--app-bg-elevated)", border: "1px solid var(--app-border)", borderRadius: 14, padding: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 500, margin: "0 0 3px" }}>{title}</h3>
      <p style={{ fontSize: 12, color: "var(--app-text-quiet)", margin: 0 }}>{rows.length} {rows.length === 1 ? "category" : "categories"}</p>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.length === 0 && <p style={{ fontSize: 12, color: "var(--app-text-quiet)" }}>No entries in this range.</p>}
        {rows.map(r => (
          <div key={r.label}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12, marginBottom: 5 }}>
              <span style={{ color: "var(--app-text)" }}>{r.label}</span>
              <span style={{ color: "var(--app-text-muted)", fontVariantNumeric: "tabular-nums" }}>{ngnFull(r.value)}</span>
            </div>
            <div style={{ height: 6, background: "var(--app-surface)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${Math.max(4, Math.round((r.value / r.total) * 100))}%`, height: "100%", background: r.color, borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectionCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 10, padding: "13px 15px" }}>
      <p style={{ fontSize: 11, color: "var(--app-text-quiet)", letterSpacing: "0.03em", textTransform: "uppercase", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: "6px 0 0", color, fontVariantNumeric: "tabular-nums" }}>{value}</p>
    </div>
  );
}

// ─── Expenses tab ───────────────────────────────────────────────────────────

function ExpensesTab({ recurring, oneoff, onEdit, onTogglePause, onAdd }: {
  recurring: Expense[]; oneoff: Expense[];
  onEdit: (e: Expense) => void;
  onTogglePause: (e: Expense) => void;
  onAdd: () => void;
}) {
  if (recurring.length === 0 && oneoff.length === 0) {
    return (
      <EmptyState
        title="No expenses yet"
        body="Add recurring costs (servers, salaries, ads) and one-off spends. Overview + Reports pick them up automatically."
        cta="Add expense" onCta={onAdd}
      />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Recurring */}
      <div style={{ background: "var(--app-bg-elevated)", border: "1px solid var(--app-border)", borderRadius: 14 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--app-border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Recurring expenses</h2>
            <p style={{ fontSize: 12, color: "var(--app-text-quiet)", margin: "3px 0 0" }}>Charges that repeat monthly. Pause an item to exclude it from totals without deleting.</p>
          </div>
          <p style={{ fontSize: 12, color: "var(--app-text-quiet)" }}>{recurring.length} item{recurring.length === 1 ? "" : "s"}</p>
        </div>
        {recurring.length === 0
          ? <p style={{ padding: 24, textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>No recurring expenses yet.</p>
          : (
            <table className="fin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={FIN_TH}>Name</th>
                  <th style={FIN_TH}>Category</th>
                  <th style={{ ...FIN_TH, textAlign: "right" }}>Monthly</th>
                  <th style={FIN_TH}>Since</th>
                  <th style={FIN_TH}>Status</th>
                  <th style={{ ...FIN_TH, width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {recurring.map(r => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--app-border)" }}>
                    <td style={FIN_TD}>{r.name}</td>
                    <td style={FIN_TD}>
                      <span style={{ ...FIN_CHIP, background: CATS[r.category].bg, color: CATS[r.category].fg }}>
                        {CATS[r.category].label}
                      </span>
                    </td>
                    <td style={{ ...FIN_TD, textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.status === "paused" ? "var(--app-text-quiet)" : "var(--app-text)" }}>
                      {ngnFull(r.amount_ngn)}
                    </td>
                    <td style={{ ...FIN_TD, color: "var(--app-text-muted)" }}>{fmtDate(r.since)}</td>
                    <td style={FIN_TD}>
                      <span style={{
                        ...FIN_CHIP,
                        background: r.status === "active" ? "var(--app-in-soft)" : "var(--app-surface)",
                        color:      r.status === "active" ? "var(--app-in)"      : "var(--app-text-quiet)",
                      }}>{r.status === "active" ? "Active" : "Paused"}</span>
                    </td>
                    <td style={{ ...FIN_TD, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => onEdit(r)} title="Edit" style={FIN_ICON_BTN}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                        </svg>
                      </button>
                      <button onClick={() => onTogglePause(r)} title={r.status === "active" ? "Pause" : "Resume"} style={FIN_ICON_BTN}>
                        {r.status === "active" ? (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                            <line x1="6" y1="4" x2="6" y2="20" /><line x1="18" y1="4" x2="18" y2="20" />
                          </svg>
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {/* One-off */}
      <div style={{ background: "var(--app-bg-elevated)", border: "1px solid var(--app-border)", borderRadius: 14 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--app-border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>One-off expenses</h2>
            <p style={{ fontSize: 12, color: "var(--app-text-quiet)", margin: "3px 0 0" }}>Spends dated to a single day (equipment, legal, contractors).</p>
          </div>
          <p style={{ fontSize: 12, color: "var(--app-text-quiet)" }}>{oneoff.length} item{oneoff.length === 1 ? "" : "s"}</p>
        </div>
        {oneoff.length === 0
          ? <p style={{ padding: 24, textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>No one-off expenses yet.</p>
          : (
            <table className="fin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={FIN_TH}>Name</th>
                  <th style={FIN_TH}>Category</th>
                  <th style={{ ...FIN_TH, textAlign: "right" }}>Amount</th>
                  <th style={FIN_TH}>Date</th>
                  <th style={{ ...FIN_TH, width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {oneoff.map(o => (
                  <tr key={o.id} style={{ borderTop: "1px solid var(--app-border)" }}>
                    <td style={FIN_TD}>{o.name}</td>
                    <td style={FIN_TD}>
                      <span style={{ ...FIN_CHIP, background: CATS[o.category].bg, color: CATS[o.category].fg }}>
                        {CATS[o.category].label}
                      </span>
                    </td>
                    <td style={{ ...FIN_TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{ngnFull(o.amount_ngn)}</td>
                    <td style={{ ...FIN_TD, color: "var(--app-text-muted)" }}>{fmtDate(o.since)}</td>
                    <td style={{ ...FIN_TD, textAlign: "right" }}>
                      <button onClick={() => onEdit(o)} title="Edit" style={FIN_ICON_BTN}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}

// ─── Income tab ─────────────────────────────────────────────────────────────

interface LedgerIncomeRow {
  id: string; date: string; category: string; amount_ngn: number;
  description: string | null; source_type: string | null; kind: string | null;
  is_auto: boolean; is_test: boolean; review_status: string;
}

/**
 * IncomeTab — every row here is a revenue entry in the ledger. Paystack /
 * challenge auto-syncs land as `unreviewed` and only appear once an admin
 * marks them reviewed on the Ledger tab. Manual rows land already reviewed.
 * Grouped by day with a daily total header so it lines up with the accountant's
 * bank-statement reconciliation.
 */
function IncomeTab({ onAdd }: { onAdd: () => void }) {
  const [rows, setRows] = useState<LedgerIncomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTest, setShowTest] = useState(false);
  const [showUnreviewed, setShowUnreviewed] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Last 12 months of revenue rows; enough for the tab, more than enough for
    // the daily-grouped view. Bumped from the 500 default cap.
    const start = new Date(); start.setMonth(start.getMonth() - 11); start.setDate(1);
    const r = await fetch(`/api/admin/finance/transactions?type=revenue&start=${start.toISOString().slice(0, 10)}&limit=5000`);
    const d = await r.json();
    setRows((d.transactions ?? []) as LedgerIncomeRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleTest(row: LedgerIncomeRow) {
    setActing(row.id);
    const r = await fetch(`/api/admin/finance/transactions/${row.id}/test`, { method: "POST" });
    if (r.ok) {
      const d = await r.json();
      setRows(prev => prev.map(x => x.id === row.id ? { ...x, is_test: d.transaction.is_test } : x));
    }
    setActing(null);
  }

  const filtered = useMemo(() =>
    rows.filter(r => (showTest || !r.is_test) && (showUnreviewed || r.review_status === "reviewed")),
    [rows, showTest, showUnreviewed],
  );

  // Group by day (newest first). Each bucket carries a total that excludes
  // is_test rows regardless of the show-test toggle above.
  const grouped = useMemo(() => {
    const buckets = new Map<string, { total: number; items: LedgerIncomeRow[] }>();
    for (const r of filtered) {
      const b = buckets.get(r.date) ?? { total: 0, items: [] };
      b.items.push(r);
      if (!r.is_test) b.total += r.amount_ngn;
      buckets.set(r.date, b);
    }
    return [...buckets.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1);
  }, [filtered]);

  const testCount = rows.filter(r => r.is_test).length;
  const unreviewedCount = rows.filter(r => r.review_status !== "reviewed" && !r.is_test).length;

  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        title="No income yet"
        body="Auto-synced from Paystack (plans, credits, academy, offers, 7-Day Challenge) plus manual rows. New auto rows appear here once you review them on the Ledger tab."
        cta="Add income" onCta={onAdd}
      />
    );
  }

  return (
    <div style={{ background: "var(--app-bg-elevated)", border: "1px solid var(--app-border)", borderRadius: 14 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--app-border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Payments &amp; income</h2>
          <p style={{ fontSize: 12, color: "var(--app-text-quiet)", margin: "3px 0 0" }}>
            Every reviewed revenue entry, grouped by day. Auto-synced rows show up once you review them on the Ledger tab.
            {unreviewedCount > 0 && !showUnreviewed && <> · <span style={{ color: "var(--app-warning)" }}>{unreviewedCount} unreviewed hidden</span></>}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: "var(--app-text-muted)", flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={showUnreviewed} onChange={e => setShowUnreviewed(e.target.checked)} />
            Show unreviewed
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={showTest} onChange={e => setShowTest(e.target.checked)} />
            Show test {testCount > 0 && <span style={{ color: "var(--app-text-quiet)" }}>({testCount})</span>}
          </label>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>Loading…</div>
      ) : grouped.length === 0 ? (
        <p style={{ padding: 24, textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13, margin: 0 }}>
          No rows match the current filters.
        </p>
      ) : (
        <div>
          {grouped.map(([day, bucket]) => (
            <div key={day}>
              <div style={{
                padding: "10px 20px", background: "var(--app-surface)",
                borderTop: "1px solid var(--app-border)", borderBottom: "1px solid var(--app-border)",
                display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text)" }}>{fmtDate(day)}</span>
                <span style={{ fontSize: 12, color: "var(--app-text-muted)" }}>
                  {bucket.items.length} {bucket.items.length === 1 ? "row" : "rows"} · daily total{" "}
                  <span style={{ color: "var(--app-in, #6EE7B7)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{ngnFull(bucket.total)}</span>
                </span>
              </div>
              <table className="fin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {bucket.items.map(r => {
                    const catLabel = LEDGER_CATEGORIES.revenue[r.category] ?? r.category;
                    const sourceLabel = r.source_type === "billing_invoices" ? "Paystack"
                      : r.source_type === "offer_purchases" ? "Offer"
                      : r.source_type === "challenge_signups" ? "Challenge"
                      : r.source_type === "finance_income" ? "Manual"
                      : r.source_type === "bank_transfer" ? "Transfer in"
                      : r.is_auto ? "Auto" : "Manual";
                    return (
                      <tr key={r.id} style={{ borderTop: "1px solid var(--app-border)", opacity: r.is_test ? 0.5 : 1 }}>
                        <td style={{ ...FIN_TD, maxWidth: 340 }}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.description ?? ""}>
                            {r.description ?? "—"}
                          </span>
                          <span style={{ display: "inline-flex", gap: 6, marginTop: 3, fontSize: 10.5, color: "var(--app-text-quiet)" }}>
                            <span style={{ ...FIN_CHIP, background: "var(--app-info-soft)", color: "var(--app-info)", padding: "1px 6px", fontSize: 9 }}>{sourceLabel}</span>
                            {r.review_status !== "reviewed" && <span style={{ ...FIN_CHIP, background: "rgba(251,113,133,0.14)", color: "#FDA4AF", padding: "1px 6px", fontSize: 9 }}>{r.review_status}</span>}
                          </span>
                        </td>
                        <td style={{ ...FIN_TD, whiteSpace: "nowrap", color: "var(--app-text-muted)" }}>{catLabel}</td>
                        <td style={{ ...FIN_TD, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{ngnFull(r.amount_ngn)}</td>
                        <td style={{ ...FIN_TD, textAlign: "right", whiteSpace: "nowrap" }}>
                          <button onClick={() => toggleTest(r)} disabled={acting === r.id} style={{
                            height: 26, padding: "0 10px", borderRadius: 6, cursor: acting === r.id ? "not-allowed" : "pointer",
                            fontSize: 11, fontWeight: 500, fontFamily: "inherit", whiteSpace: "nowrap",
                            background: "transparent",
                            border: `1px solid ${r.is_test ? "var(--app-in-soft)" : "var(--app-border-strong)"}`,
                            color: r.is_test ? "var(--app-in)" : "var(--app-text-muted)",
                          }}>
                            {r.is_test ? "Restore to totals" : "Mark as test"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reports tab ────────────────────────────────────────────────────────────

function ReportsTab({ totals, range, recurring, oneoff }: {
  totals: { moneyIn: number; moneyOut: number; profit: number; incomeBy: Record<string, number>; expBy: Record<string, number> };
  range: Range;
  recurring: Expense[];
  oneoff: Expense[];
}) {
  const hasData = totals.moneyIn > 0 || totals.moneyOut > 0;
  function exportCsv() {
    window.open("/api/admin/finance/export", "_blank");
  }
  function printPnl() { setTimeout(() => window.print(), 100); }

  const activeRec = recurring.filter(r => r.status === "active");
  if (!hasData && activeRec.length === 0 && oneoff.length === 0) {
    return <EmptyState title="Nothing to report yet" body="Add expenses and income first; the P&L will populate automatically." />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={exportCsv} style={FIN_SECONDARY_BTN}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Export CSV
        </button>
        <button onClick={printPnl} style={FIN_SECONDARY_BTN}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
          </svg>
          Print P&amp;L
        </button>
        <span style={{ fontSize: 12, color: "var(--app-text-quiet)", marginLeft: "auto" }}>Range: {rangeLabel(range)}</span>
      </div>

      <div style={{ background: "var(--app-bg-elevated)", border: "1px solid var(--app-border)", borderRadius: 14, padding: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Profit &amp; Loss</h2>
        <p style={{ fontSize: 12, color: "var(--app-text-quiet)", margin: "4px 0 24px" }}>{rangeLabel(range)} · Leadash</p>

        <PnlSection title="Income" total={totals.moneyIn} rows={
          Object.entries(totals.incomeBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
            label: INCOME_TYPES[k as IncomeType]?.label ?? k, value: v,
          }))
        } tone="in" />

        <PnlSection title="Expenses" total={totals.moneyOut} rows={
          Object.entries(totals.expBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
            label: CATS[k as Category]?.label ?? k, value: v,
          }))
        } tone="out" />

        <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 0", borderTop: "1px solid var(--app-border-strong)", marginTop: 12 }}>
          <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{totals.profit >= 0 ? "Net profit" : "Net loss"}</p>
          <p style={{
            fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em",
            color: totals.profit >= 0 ? "var(--app-in)" : "var(--app-out)",
            fontVariantNumeric: "tabular-nums",
          }}>
            {ngnFull(totals.profit)}
          </p>
        </div>
      </div>
    </div>
  );
}

function PnlSection({ title, total, rows, tone }: {
  title: string; total: number; rows: { label: string; value: number }[]; tone: "in" | "out";
}) {
  const color = tone === "in" ? "var(--app-in)" : "var(--app-out)";
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 8, borderBottom: "1px solid var(--app-border)" }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: "var(--app-text)" }}>{title}</p>
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color, fontVariantNumeric: "tabular-nums" }}>{ngnFull(total)}</p>
      </div>
      {rows.length === 0
        ? <p style={{ fontSize: 12, color: "var(--app-text-quiet)", padding: "8px 0" }}>No entries.</p>
        : rows.map(r => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--app-text-muted)", padding: "6px 0" }}>
            <span>{r.label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{ngnFull(r.value)}</span>
          </div>
        ))}
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────

function EmptyState({ title, body, cta, onCta }: { title: string; body: string; cta?: string; onCta?: () => void }) {
  return (
    <div style={{
      padding: "56px 24px", borderRadius: 14, border: "1px dashed var(--app-border-strong)",
      background: "var(--app-bg-elevated)", textAlign: "center",
    }}>
      <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{title}</p>
      <p style={{ fontSize: 12.5, color: "var(--app-text-quiet)", margin: "6px auto 0", maxWidth: 420, lineHeight: 1.5 }}>{body}</p>
      {cta && onCta && (
        <button onClick={onCta} style={{ ...FIN_PRIMARY_BTN, marginTop: 20 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {cta}
        </button>
      )}
    </div>
  );
}

// ─── Modal (shared for expense + income) ────────────────────────────────────

function Modal({ mode, editing, draft, setDraft, error, saving, onCancel, onSave, onDelete }: {
  mode: "expense" | "income";
  editing: boolean;
  draft: Draft;
  setDraft: (d: Draft) => void;
  error: string;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const isIncome  = mode === "income";
  const showKind  = !isIncome && !editing;
  const title     = isIncome ? (editing ? "Edit income" : "Add income") : (editing ? "Edit expense" : "Add expense");
  const saveLabel = isIncome ? (editing ? "Save changes" : "Add income") : (editing ? "Save changes" : "Add expense");
  const catOptions: [string, string][] = isIncome
    ? MANUAL_INCOME_TYPES.map(t => [t, INCOME_TYPES[t].label])
    : EXPENSE_CATS.map(c => [c, CATS[c].label]);

  return (
    <div onClick={onCancel} style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(3,3,5,0.72)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 440, background: "var(--app-bg-elevated)",
        border: "1px solid var(--app-border-strong)", borderRadius: 16,
        boxShadow: "0 30px 80px rgba(0,0,0,0.6)", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--app-border)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{title}</h3>
          <button onClick={onCancel} style={{
            width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent",
            color: "var(--app-text-muted)", cursor: "pointer",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" style={{ display: "block", margin: "auto" }}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {showKind && (
            <div>
              <p style={FIN_LABEL}>Frequency</p>
              <div style={{ display: "flex", gap: 6 }}>
                {(["recurring", "oneoff"] as const).map(k => (
                  <button key={k} onClick={() => setDraft({ ...draft, kind: k })} style={{
                    flex: 1, height: 32, borderRadius: 6, border: "none", cursor: "pointer",
                    fontSize: 12.5, fontWeight: 500, fontFamily: "inherit",
                    background: draft.kind === k ? "var(--app-surface-strong)" : "var(--app-surface)",
                    color:      draft.kind === k ? "var(--app-text)"          : "var(--app-text-muted)",
                  }}>
                    {k === "recurring" ? "Repeats monthly" : "One-off"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p style={FIN_LABEL}>{isIncome ? "Source" : "Name"}</p>
            <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="fin-input" placeholder={isIncome ? "e.g. Partnership with Acme" : "e.g. Cloud servers (VPS)"} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <p style={FIN_LABEL}>Amount (NGN)</p>
              <input value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value.replace(/[^0-9]/g, "") })} className="fin-input" placeholder="0" inputMode="numeric" />
            </div>
            <div>
              <p style={FIN_LABEL}>Category</p>
              <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} className="fin-input">
                {catOptions.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <p style={FIN_LABEL}>{isIncome ? "Payment date" : draft.kind === "recurring" ? "Effective from" : "Spend date"}</p>
            <input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} className="fin-input" />
          </div>

          {error && <p style={{ fontSize: 12, color: "var(--app-out)", margin: 0 }}>{error}</p>}
        </div>

        <div style={{ padding: 16, borderTop: "1px solid var(--app-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div>
            {editing && onDelete && (
              <button onClick={onDelete} style={{
                height: 36, padding: "0 12px", borderRadius: 8,
                border: "1px solid var(--app-out-soft)", background: "transparent",
                color: "var(--app-out)", fontSize: 12.5, fontWeight: 500, cursor: "pointer",
              }}>Delete</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onCancel} style={FIN_GHOST_BTN}>Cancel</button>
            <button onClick={onSave} disabled={saving} style={{ ...FIN_PRIMARY_BTN, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Reserves modal ─────────────────────────────────────────────────────────

function ReservesModal({ value, setValue, onCancel, onSave }: {
  value: string; setValue: (s: string) => void; onCancel: () => void; onSave: () => void;
}) {
  return (
    <div onClick={onCancel} style={{
      position: "fixed", inset: 0, zIndex: 110,
      background: "rgba(3,3,5,0.72)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 380, background: "var(--app-bg-elevated)",
        border: "1px solid var(--app-border-strong)", borderRadius: 16,
        boxShadow: "0 30px 80px rgba(0,0,0,0.6)", overflow: "hidden",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--app-border)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Update reserves</h3>
          <p style={{ fontSize: 12, color: "var(--app-text-quiet)", margin: "4px 0 0" }}>Cash on hand across all bank accounts. Drives the runway calc.</p>
        </div>
        <div style={{ padding: 20 }}>
          <p style={FIN_LABEL}>Reserves (NGN)</p>
          <input value={value} onChange={e => setValue(e.target.value.replace(/[^0-9]/g, ""))} className="fin-input" placeholder="0" inputMode="numeric" autoFocus />
        </div>
        <div style={{ padding: 16, borderTop: "1px solid var(--app-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={FIN_GHOST_BTN}>Cancel</button>
          <button onClick={onSave} style={FIN_PRIMARY_BTN}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Style constants ────────────────────────────────────────────────────────

const FIN_PRIMARY_BTN: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 13px",
  borderRadius: 8, border: "none", background: "var(--app-accent)", color: "#0A0A0A",
  fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
};

const FIN_SECONDARY_BTN: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 14px",
  borderRadius: 8, border: "1px solid var(--app-border-strong)", background: "var(--app-surface)",
  color: "var(--app-text)", fontSize: 12.5, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
};

const FIN_GHOST_BTN: React.CSSProperties = {
  height: 30, padding: "0 12px", borderRadius: 7,
  border: "1px solid var(--app-border-strong)", background: "transparent",
  color: "var(--app-text-muted)", fontSize: 12, fontWeight: 500, fontFamily: "inherit",
  cursor: "pointer", whiteSpace: "nowrap",
};

const FIN_ICON_BTN: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, border: "1px solid var(--app-border-strong)",
  background: "transparent", color: "var(--app-text-muted)", cursor: "pointer", marginLeft: 4,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};

const FIN_TH: React.CSSProperties = {
  padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 600,
  color: "var(--app-text-quiet)", textTransform: "uppercase", letterSpacing: "0.06em",
  borderBottom: "1px solid var(--app-border)",
};

const FIN_TD: React.CSSProperties = { padding: "12px 16px" };

const FIN_CHIP: React.CSSProperties = {
  display: "inline-flex", alignItems: "center",
  padding: "2px 8px", borderRadius: 999,
  fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
};

const FIN_LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: "var(--app-text-quiet)",
  textTransform: "uppercase", letterSpacing: "0.08em",
  marginBottom: 6, marginTop: 0,
};

const FIN_CSS = `
.finance-mgr .fin-input {
  width: 100%;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 6px;
  padding: 9px 12px;
  font-size: 13px;
  color: var(--app-text);
  outline: none;
  transition: border-color 160ms;
  font-family: inherit;
}
.finance-mgr .fin-input:focus { border-color: var(--app-accent); }
.finance-mgr .fin-table th:first-child, .finance-mgr .fin-table td:first-child { padding-left: 20px; }
.finance-mgr .fin-table th:last-child,  .finance-mgr .fin-table td:last-child  { padding-right: 20px; }

@media (max-width: 1024px) {
  .finance-shell { padding: 16px !important; }
  .finance-hero  { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  .finance-splits { grid-template-columns: minmax(0, 1fr) !important; }
  .finance-projection { grid-template-columns: minmax(0, 1fr) !important; }
}
@media (max-width: 640px) {
  .finance-mgr .fin-table { font-size: 12px; }
  .finance-mgr .fin-table th, .finance-mgr .fin-table td { padding: 10px 12px; }
  .finance-mgr .fin-table th:first-child, .finance-mgr .fin-table td:first-child { padding-left: 14px; }
  .finance-mgr .fin-table th:last-child,  .finance-mgr .fin-table td:last-child  { padding-right: 14px; }
}
`;
