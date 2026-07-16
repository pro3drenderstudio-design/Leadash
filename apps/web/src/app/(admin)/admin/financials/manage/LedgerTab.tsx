"use client";
/**
 * Ledger tab — the categorized transaction ledger (revenue/cogs/opex/tax).
 * Auto rows are trigger-fed from Paystack payments (gross + fee pairs) and
 * are read-only apart from review actions; manual entries (opex, tax records,
 * adjusting entries) are created/edited here.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { TYPES, CATEGORIES, type TxType, type FinanceTransaction } from "@/lib/finance/tax";
import {
  FIN_PRIMARY_BTN, FIN_GHOST_BTN, FIN_TH, FIN_TD, FIN_CHIP, FIN_CARD, FIN_LABEL,
  ngnFull, fmtDate, monthBounds, currentMonth,
} from "./finStyles";
import { useConfirmDialog } from "./ConfirmDialog";

const TYPE_COLORS: Record<TxType, { fg: string; bg: string }> = {
  revenue: { fg: "#6EE7B7", bg: "rgba(52,211,153,0.14)" },
  cogs:    { fg: "#FDA4AF", bg: "rgba(251,113,133,0.14)" },
  opex:    { fg: "#FCD34D", bg: "rgba(251,191,36,0.14)" },
  tax:     { fg: "#C4B5FD", bg: "rgba(167,139,250,0.14)" },
  equity:  { fg: "#67E8F9", bg: "rgba(34,211,238,0.14)" },
};

interface Principal { id: string; name: string; net_contributed_ngn: number }
interface BankAccountOption { id: string; name: string; is_default: boolean }

const REVIEW_COLORS: Record<string, { fg: string; bg: string }> = {
  unreviewed: { fg: "#94A3B8", bg: "rgba(148,163,184,0.14)" },
  reviewed:   { fg: "#6EE7B7", bg: "rgba(52,211,153,0.14)" },
  flagged:    { fg: "#FDA4AF", bg: "rgba(251,113,133,0.18)" },
};

interface TxDraft {
  date: string; type: TxType; category: string; amount: string;
  description: string; reference: string; adjusts_id: string | null;
  principal_id: string | null; bank_account_id: string | null;
}

function blankDraft(defaultAccountId: string | null = null): TxDraft {
  return {
    date: new Date().toISOString().slice(0, 10), type: "opex", category: "opex.other", amount: "",
    description: "", reference: "", adjusts_id: null, principal_id: null, bank_account_id: defaultAccountId,
  };
}

export default function LedgerTab({ onChanged }: { onChanged?: () => void }) {
  const [month, setMonth] = useState<string>(currentMonth());
  const [txs, setTxs] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"all" | TxType>("all");
  const [reviewFilter, setReviewFilter] = useState<"all" | "unreviewed" | "flagged">("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<FinanceTransaction | null>(null);
  const [draft, setDraft] = useState<TxDraft>(blankDraft());
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [newPrincipalName, setNewPrincipalName] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const { confirm, prompt, dialog } = useConfirmDialog();

  const loadPrincipals = useCallback(async () => {
    const r = await fetch("/api/admin/finance/principals");
    const d = await r.json();
    setPrincipals(d.principals ?? []);
  }, []);

  useEffect(() => { loadPrincipals(); }, [loadPrincipals]);

  useEffect(() => {
    fetch("/api/admin/finance/bank-accounts?period=day")
      .then(r => r.json())
      .then(d => setBankAccounts((d.accounts ?? []).map((a: { id: string; name: string; is_default: boolean }) => ({ id: a.id, name: a.name, is_default: a.is_default }))))
      .catch(() => setBankAccounts([]));
  }, []);

  const defaultAccountId = bankAccounts.find(a => a.is_default)?.id ?? null;

  async function addPrincipal() {
    if (!newPrincipalName.trim()) return;
    const r = await fetch("/api/admin/finance/principals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPrincipalName.trim() }),
    });
    const d = await r.json();
    if (r.ok && d.principal) {
      await loadPrincipals();
      setDraft(dr => ({ ...dr, principal_id: d.principal.id }));
      setNewPrincipalName("");
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (month !== "all") {
      const { start, end } = monthBounds(month);
      params.set("start", start); params.set("end", end);
    }
    const r = await fetch(`/api/admin/finance/transactions?${params}`);
    const d = await r.json();
    setTxs(d.transactions ?? []);
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => txs.filter(tx => {
    if (typeFilter !== "all" && tx.type !== typeFilter) return false;
    if (reviewFilter !== "all" && tx.review_status !== reviewFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (tx.description ?? "").toLowerCase().includes(q)
        || (tx.reference ?? "").toLowerCase().includes(q)
        || tx.category.toLowerCase().includes(q);
    }
    return true;
  }), [txs, typeFilter, reviewFilter, search]);

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

  async function retagAccount(tx: FinanceTransaction, bankAccountId: string | null) {
    setActing(tx.id);
    const r = await fetch(`/api/admin/finance/transactions/${tx.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bank_account_id: bankAccountId }),
    });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? "Action failed");
    await load();
    setActing(null);
  }

  function openAdd(adjusts?: FinanceTransaction) {
    setDraft(adjusts
      ? { ...blankDraft(defaultAccountId), adjusts_id: adjusts.id, description: `Adjustment for: ${adjusts.description ?? adjusts.category}` }
      : blankDraft(defaultAccountId));
    setEditing(null); setError(""); setModal("add");
  }

  function openEdit(tx: FinanceTransaction) {
    setDraft({
      date: tx.date, type: tx.type, category: tx.category, amount: String(tx.amount_ngn),
      description: tx.description ?? "", reference: tx.reference ?? "", adjusts_id: tx.adjusts_id,
      principal_id: tx.principal_id, bank_account_id: tx.bank_account_id,
    });
    setEditing(tx); setError(""); setModal("edit");
  }

  async function save() {
    const amount = parseFloat(draft.amount);
    if (!Number.isFinite(amount) || amount < 0) { setError("Enter a valid amount"); return; }
    setSaving(true); setError("");
    const payload = {
      date: draft.date, type: draft.type, category: draft.category, amount_ngn: amount,
      description: draft.description || null, reference: draft.reference || null,
      bank_account_id: draft.bank_account_id || null,
      ...(draft.adjusts_id ? { adjusts_id: draft.adjusts_id } : {}),
      ...(draft.type === "equity" ? { principal_id: draft.principal_id || null } : {}),
    };
    const r = editing
      ? await fetch(`/api/admin/finance/transactions/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch("/api/admin/finance/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!r.ok) {
      setError((await r.json().catch(() => ({}))).error ?? "Save failed");
    } else {
      setModal(null);
      await load(); onChanged?.();
    }
    setSaving(false);
  }

  async function remove() {
    if (!editing) return;
    const ok = await confirm({ title: "Delete this manual entry?", body: "This can't be undone.", destructive: true, confirmLabel: "Delete" });
    if (!ok) return;
    setSaving(true);
    const r = await fetch(`/api/admin/finance/transactions/${editing.id}`, { method: "DELETE" });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? "Delete failed");
    else { setModal(null); await load(); onChanged?.(); }
    setSaving(false);
  }

  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const d = new Date();
    for (let i = 0; i < 18; i++) {
      opts.push(d.toISOString().slice(0, 7));
      d.setMonth(d.getMonth() - 1);
    }
    return opts;
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <select className="fin-input" style={{ width: "auto" }} value={month} onChange={e => setMonth(e.target.value)}>
          <option value="all">All time</option>
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="fin-input" style={{ width: "auto" }} value={typeFilter} onChange={e => setTypeFilter(e.target.value as "all" | TxType)}>
          <option value="all">All types</option>
          {(Object.entries(TYPES) as [TxType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="fin-input" style={{ width: "auto" }} value={reviewFilter} onChange={e => setReviewFilter(e.target.value as typeof reviewFilter)}>
          <option value="all">Any review status</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="flagged">Flagged</option>
        </select>
        <input className="fin-input" style={{ width: 200 }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ flex: 1 }} />
        <button onClick={() => openAdd()} style={FIN_PRIMARY_BTN}>+ Add entry</button>
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--app-out-soft)", border: "1px solid var(--app-out)", color: "var(--app-out)", fontSize: 13 }}>{error}</div>}

      {/* Table */}
      <div style={FIN_CARD}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>
            No transactions match. Paystack payments appear here automatically; use “Add entry” for expenses and adjustments.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="fin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Date", "Type", "Category", "Description", "Amount", "Source", "Bank account", "Review", ""].map(h => <th key={h} style={FIN_TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.map(tx => {
                  const tc = TYPE_COLORS[tx.type];
                  const rc = REVIEW_COLORS[tx.review_status] ?? REVIEW_COLORS.unreviewed;
                  return (
                    <tr key={tx.id} style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <td style={{ ...FIN_TD, whiteSpace: "nowrap", color: "var(--app-text-muted)" }}>{fmtDate(tx.date)}</td>
                      <td style={FIN_TD}><span style={{ ...FIN_CHIP, background: tc.bg, color: tc.fg }}>{TYPES[tx.type]}</span></td>
                      <td style={{ ...FIN_TD, color: "var(--app-text-muted)", whiteSpace: "nowrap" }}>{CATEGORIES[tx.type]?.[tx.category] ?? tx.category}</td>
                      <td style={{ ...FIN_TD, maxWidth: 320 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tx.description ?? ""}>
                          {tx.description ?? "—"}
                        </span>
                        {tx.review_note && <span style={{ fontSize: 11, color: "var(--app-warning)" }}>⚑ {tx.review_note}</span>}
                      </td>
                      <td style={{ ...FIN_TD, fontWeight: 600, whiteSpace: "nowrap", color: tx.type === "revenue" ? "var(--app-in, #6EE7B7)" : "var(--app-text)" }}>
                        {ngnFull(tx.amount_ngn)}
                      </td>
                      <td style={FIN_TD}>
                        <span style={{ ...FIN_CHIP, background: "var(--app-surface-strong)", color: "var(--app-text-quiet)" }}>
                          {tx.is_auto ? (tx.kind === "fee" ? "auto · fee" : "auto") : "manual"}
                        </span>
                      </td>
                      <td style={FIN_TD}>
                        <select
                          value={tx.bank_account_id ?? ""}
                          onChange={e => retagAccount(tx, e.target.value || null)}
                          disabled={acting === tx.id}
                          style={{ background: "transparent", border: "1px solid var(--app-border)", borderRadius: 6, color: "var(--app-text-muted)", fontSize: 11.5, padding: "3px 5px" }}
                        >
                          <option value="">— Unassigned —</option>
                          {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </td>
                      <td style={FIN_TD}><span style={{ ...FIN_CHIP, background: rc.bg, color: rc.fg }}>{tx.review_status}</span></td>
                      <td style={{ ...FIN_TD, whiteSpace: "nowrap", textAlign: "right" }}>
                        {tx.review_status !== "reviewed" && (
                          <button onClick={() => review(tx, "reviewed")} disabled={acting === tx.id} style={FIN_GHOST_BTN} title="Mark reviewed">✓</button>
                        )}
                        {tx.review_status !== "flagged" && (
                          <button onClick={() => review(tx, "flagged")} disabled={acting === tx.id} style={{ ...FIN_GHOST_BTN, marginLeft: 4 }} title="Flag for follow-up">⚑</button>
                        )}
                        {tx.is_auto ? (
                          <button onClick={() => openAdd(tx)} style={{ ...FIN_GHOST_BTN, marginLeft: 4 }} title="Add adjusting entry">Adjust</button>
                        ) : (
                          <button onClick={() => openEdit(tx)} style={{ ...FIN_GHOST_BTN, marginLeft: 4 }}>Edit</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 460, background: "var(--app-bg-elevated)", border: "1px solid var(--app-border-strong)", borderRadius: 16, padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>
              {modal === "edit" ? "Edit entry" : draft.adjusts_id ? "Adjusting entry" : "Add entry"}
            </h3>
            {draft.adjusts_id && (
              <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: -8, marginBottom: 14 }}>
                Linked to the flagged transaction — use this to record corrections (extra bank charge, manual refund, …) without touching the original.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <p style={FIN_LABEL}>Date</p>
                  <input type="date" className="fin-input" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} />
                </div>
                <div>
                  <p style={FIN_LABEL}>Amount (₦)</p>
                  <input type="number" min="0" className="fin-input" value={draft.amount} onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <p style={FIN_LABEL}>Type</p>
                  <select className="fin-input" value={draft.type} onChange={e => {
                    const type = e.target.value as TxType;
                    setDraft(d => ({ ...d, type, category: Object.keys(CATEGORIES[type])[0] }));
                  }}>
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
              {draft.type === "equity" && (
                <div>
                  <p style={FIN_LABEL}>Principal / Investor</p>
                  <select className="fin-input" value={draft.principal_id ?? ""} onChange={e => setDraft(d => ({ ...d, principal_id: e.target.value || null }))}>
                    <option value="">— None —</option>
                    {principals.map(p => <option key={p.id} value={p.id}>{p.name} ({ngnFull(p.net_contributed_ngn)} contributed)</option>)}
                  </select>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <input className="fin-input" placeholder="Add new principal…" value={newPrincipalName} onChange={e => setNewPrincipalName(e.target.value)} />
                    <button type="button" onClick={addPrincipal} style={FIN_GHOST_BTN}>+ Add</button>
                  </div>
                </div>
              )}
              <div>
                <p style={FIN_LABEL}>Description</p>
                <input className="fin-input" value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="e.g. October office internet" />
              </div>
              <div>
                <p style={FIN_LABEL}>Reference (optional)</p>
                <input className="fin-input" value={draft.reference} onChange={e => setDraft(d => ({ ...d, reference: e.target.value }))} placeholder="Bank ref, invoice no…" />
              </div>
              <div>
                <p style={FIN_LABEL}>Bank account</p>
                <select className="fin-input" value={draft.bank_account_id ?? ""} onChange={e => setDraft(d => ({ ...d, bank_account_id: e.target.value || null }))}>
                  <option value="">— Unassigned —</option>
                  {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.is_default ? " (default)" : ""}</option>)}
                </select>
              </div>
              {error && <p style={{ color: "var(--app-out)", fontSize: 12, margin: 0 }}>{error}</p>}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                {modal === "edit" ? (
                  <button onClick={remove} disabled={saving} style={{ ...FIN_GHOST_BTN, color: "var(--app-out)" }}>Delete</button>
                ) : <span />}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setModal(null)} style={FIN_GHOST_BTN}>Cancel</button>
                  <button onClick={save} disabled={saving} style={{ ...FIN_PRIMARY_BTN, opacity: saving ? 0.6 : 1 }}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}
