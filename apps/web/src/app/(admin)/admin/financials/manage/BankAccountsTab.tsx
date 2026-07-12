"use client";
/**
 * Bank Accounts tab — where the money actually is. Each account has an
 * opening balance/date; current + period balances are computed from
 * finance_transactions tagged to that account via cashSign() (revenue/
 * equity-in = +, everything else = -). Auto-fed transactions default to the
 * "Primary Operating Account"; re-tag individual transactions from the
 * Ledger tab if money actually settles elsewhere.
 */
import { useCallback, useEffect, useState } from "react";
import { FIN_PRIMARY_BTN, FIN_GHOST_BTN, FIN_TH, FIN_TD, FIN_CARD, FIN_LABEL, ngnFull } from "./finStyles";

type Period = "day" | "week" | "month" | "quarter" | "year";

interface BankAccount {
  id: string;
  name: string;
  bank_name: string | null;
  account_number_masked: string | null;
  is_default: boolean;
  is_active: boolean;
  opening_balance_ngn: number;
  opening_balance_date: string;
  period_start: string;
  period_end: string;
  period_opening: number;
  period_closing: number;
  current_balance: number;
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" }, { value: "year", label: "Year" },
];

function blankNewAccount() {
  return { name: "", bank_name: "", account_number_masked: "", opening_balance_ngn: "0", opening_balance_date: new Date().toISOString().slice(0, 10), is_default: false };
}

export default function BankAccountsTab() {
  const [period, setPeriod] = useState<Period>("month");
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [totalCash, setTotalCash] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(blankNewAccount());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/admin/finance/bank-accounts?period=${period}`);
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? "Failed to load"); setLoading(false); return; }
    setAccounts(d.accounts ?? []);
    setTotalCash(d.total_current_balance ?? 0);
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  async function saveAccount() {
    if (!draft.name.trim()) { setError("Enter an account name"); return; }
    setSaving(true); setError("");
    const r = await fetch("/api/admin/finance/bank-accounts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, opening_balance_ngn: parseFloat(draft.opening_balance_ngn) || 0 }),
    });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? "Save failed");
    else { setModalOpen(false); setDraft(blankNewAccount()); await load(); }
    setSaving(false);
  }

  async function toggleActive(acct: BankAccount) {
    await fetch(`/api/admin/finance/bank-accounts/${acct.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !acct.is_active }),
    });
    await load();
  }

  async function setDefault(acct: BankAccount) {
    await fetch(`/api/admin/finance/bank-accounts/${acct.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_default: true }),
    });
    await load();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Total cash */}
      <div style={{ ...FIN_CARD, padding: 18, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={FIN_LABEL}>Total cash on hand (active accounts)</p>
          <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: "var(--app-in, #6EE7B7)" }}>{ngnFull(totalCash)}</p>
        </div>
        <button onClick={() => setModalOpen(true)} style={FIN_PRIMARY_BTN}>+ Add bank account</button>
      </div>

      {/* Period selector */}
      <div style={{ display: "flex", gap: 4, background: "var(--app-surface-strong)", borderRadius: 10, padding: 3, width: "fit-content" }}>
        {PERIODS.map(p => (
          <button key={p.value} onClick={() => setPeriod(p.value)} style={{
            padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
            background: period === p.value ? "var(--app-accent)" : "transparent",
            color: period === p.value ? "#0A0A0A" : "var(--app-text-muted)",
          }}>
            {p.label}
          </button>
        ))}
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--app-out-soft)", border: "1px solid var(--app-out)", color: "var(--app-out)", fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>Loading…</div>
      ) : accounts.length === 0 ? (
        <div style={{ ...FIN_CARD, padding: 40, textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>No bank accounts yet.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
          {accounts.map(acct => (
            <div key={acct.id} style={{ ...FIN_CARD, padding: 18, opacity: acct.is_active ? 1 : 0.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    {acct.name}
                    {acct.is_default && <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: "var(--app-accent-soft)", color: "var(--app-accent)" }}>DEFAULT</span>}
                  </p>
                  {acct.bank_name && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--app-text-quiet)" }}>{acct.bank_name}{acct.account_number_masked ? ` · ${acct.account_number_masked}` : ""}</p>}
                </div>
                {!acct.is_active && <span style={{ fontSize: 11, color: "var(--app-text-quiet)" }}>Inactive</span>}
              </div>

              <p style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 700, color: acct.current_balance >= 0 ? "var(--app-text)" : "var(--app-out)" }}>
                {ngnFull(acct.current_balance)}
              </p>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <tbody>
                  <tr>
                    <td style={{ ...FIN_TD, padding: "6px 0", color: "var(--app-text-quiet)" }}>Opening ({acct.period_start})</td>
                    <td style={{ ...FIN_TD, padding: "6px 0", textAlign: "right", fontWeight: 600 }}>{ngnFull(acct.period_opening)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...FIN_TD, padding: "6px 0", color: "var(--app-text-quiet)" }}>Closing ({acct.period_end})</td>
                    <td style={{ ...FIN_TD, padding: "6px 0", textAlign: "right", fontWeight: 600 }}>{ngnFull(acct.period_closing)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...FIN_TD, padding: "6px 0", color: "var(--app-text-quiet)" }}>Net movement</td>
                    <td style={{ ...FIN_TD, padding: "6px 0", textAlign: "right", fontWeight: 600, color: acct.period_closing - acct.period_opening >= 0 ? "var(--app-in, #6EE7B7)" : "var(--app-out)" }}>
                      {acct.period_closing - acct.period_opening >= 0 ? "+" : ""}{ngnFull(acct.period_closing - acct.period_opening)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                {!acct.is_default && <button onClick={() => setDefault(acct)} style={FIN_GHOST_BTN}>Set default</button>}
                <button onClick={() => toggleActive(acct)} style={FIN_GHOST_BTN}>{acct.is_active ? "Deactivate" : "Reactivate"}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 420, background: "var(--app-bg-elevated)", border: "1px solid var(--app-border-strong)", borderRadius: 16, padding: 24 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Add bank account</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <p style={FIN_LABEL}>Account name</p>
                <input className="fin-input" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="e.g. Marketing Account" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <p style={FIN_LABEL}>Bank name (optional)</p>
                  <input className="fin-input" value={draft.bank_name} onChange={e => setDraft(d => ({ ...d, bank_name: e.target.value }))} />
                </div>
                <div>
                  <p style={FIN_LABEL}>Account no. (masked)</p>
                  <input className="fin-input" value={draft.account_number_masked} onChange={e => setDraft(d => ({ ...d, account_number_masked: e.target.value }))} placeholder="•••• 4821" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <p style={FIN_LABEL}>Opening balance (₦)</p>
                  <input type="number" className="fin-input" value={draft.opening_balance_ngn} onChange={e => setDraft(d => ({ ...d, opening_balance_ngn: e.target.value }))} />
                </div>
                <div>
                  <p style={FIN_LABEL}>As of date</p>
                  <input type="date" className="fin-input" value={draft.opening_balance_date} onChange={e => setDraft(d => ({ ...d, opening_balance_date: e.target.value }))} />
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--app-text-muted)", cursor: "pointer" }}>
                <input type="checkbox" checked={draft.is_default} onChange={e => setDraft(d => ({ ...d, is_default: e.target.checked }))} />
                Make this the default account for new auto-recorded revenue
              </label>
              {error && <p style={{ color: "var(--app-out)", fontSize: 12, margin: 0 }}>{error}</p>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                <button onClick={() => setModalOpen(false)} style={FIN_GHOST_BTN}>Cancel</button>
                <button onClick={saveAccount} disabled={saving} style={{ ...FIN_PRIMARY_BTN, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
