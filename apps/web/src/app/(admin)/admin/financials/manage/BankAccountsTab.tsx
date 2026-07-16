"use client";
/**
 * Bank Accounts tab — where the money actually is. Each account has an
 * opening balance/date; current + period balances are computed from
 * finance_transactions tagged to that account via cashSign() (revenue/
 * equity-in = +, everything else = -). Auto-fed transactions default to the
 * "Primary Operating Account"; re-tag individual transactions from the
 * Ledger tab if money actually settles elsewhere.
 *
 * Actions:
 *   Add / Edit account (opening balance + date included on both).
 *   Record deposit / withdrawal — writes a single manual ledger row tagged
 *   to this account.
 *   Transfer between accounts — writes a matched pair sharing a reference
 *   so total cash stays constant while distribution changes.
 */
import { useCallback, useEffect, useState } from "react";
import { FIN_PRIMARY_BTN, FIN_GHOST_BTN, FIN_TD, FIN_CARD, FIN_LABEL, ngnFull } from "./finStyles";

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

type AccountDraft = {
  id?: string;
  name: string;
  bank_name: string;
  account_number_masked: string;
  opening_balance_ngn: string;
  opening_balance_date: string;
  is_default: boolean;
};

function blankAccountDraft(): AccountDraft {
  return { name: "", bank_name: "", account_number_masked: "", opening_balance_ngn: "0", opening_balance_date: new Date().toISOString().slice(0, 10), is_default: false };
}

type MovementDraft = {
  account_id: string;
  direction: "in" | "out";  // in = deposit, out = withdrawal
  amount_ngn: string;
  date: string;
  note: string;
};

type TransferDraft = {
  from_account_id: string;
  to_account_id: string;
  amount_ngn: string;
  date: string;
  note: string;
};

export default function BankAccountsTab() {
  const [period, setPeriod] = useState<Period>("month");
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [totalCash, setTotalCash] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accountModal, setAccountModal] = useState<"add" | "edit" | null>(null);
  const [accountDraft, setAccountDraft] = useState<AccountDraft>(blankAccountDraft());
  const [movementModal, setMovementModal] = useState<MovementDraft | null>(null);
  const [transferModal, setTransferModal] = useState<TransferDraft | null>(null);
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

  function openAdd() {
    setAccountDraft(blankAccountDraft());
    setError("");
    setAccountModal("add");
  }

  function openEdit(a: BankAccount) {
    setAccountDraft({
      id: a.id,
      name: a.name,
      bank_name: a.bank_name ?? "",
      account_number_masked: a.account_number_masked ?? "",
      opening_balance_ngn: String(a.opening_balance_ngn),
      opening_balance_date: a.opening_balance_date,
      is_default: a.is_default,
    });
    setError("");
    setAccountModal("edit");
  }

  async function saveAccount() {
    if (!accountDraft.name.trim()) { setError("Enter an account name"); return; }
    setSaving(true); setError("");
    const payload = {
      name: accountDraft.name.trim(),
      bank_name: accountDraft.bank_name.trim() || null,
      account_number_masked: accountDraft.account_number_masked.trim() || null,
      opening_balance_ngn: parseFloat(accountDraft.opening_balance_ngn) || 0,
      opening_balance_date: accountDraft.opening_balance_date,
      is_default: accountDraft.is_default,
    };
    const isEdit = accountModal === "edit" && accountDraft.id;
    const r = isEdit
      ? await fetch(`/api/admin/finance/bank-accounts/${accountDraft.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        })
      : await fetch("/api/admin/finance/bank-accounts", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? "Save failed");
    else { setAccountModal(null); await load(); }
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

  async function saveMovement() {
    if (!movementModal) return;
    const amt = parseFloat(movementModal.amount_ngn);
    if (!Number.isFinite(amt) || amt <= 0) { setError("Enter a positive amount"); return; }
    setSaving(true); setError("");
    // Deposits go in as revenue.other; withdrawals as opex.other. Both are
    // tagged to the account so its balance updates immediately.
    const isDeposit = movementModal.direction === "in";
    const payload = {
      date: movementModal.date,
      type: isDeposit ? "revenue" : "opex",
      category: isDeposit ? "revenue.other" : "opex.other",
      amount_ngn: amt,
      description: (movementModal.note.trim() || (isDeposit ? "Manual deposit" : "Manual withdrawal")),
      bank_account_id: movementModal.account_id,
    };
    const r = await fetch("/api/admin/finance/transactions", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? "Save failed");
    else { setMovementModal(null); await load(); }
    setSaving(false);
  }

  async function saveTransfer() {
    if (!transferModal) return;
    const amt = parseFloat(transferModal.amount_ngn);
    if (!Number.isFinite(amt) || amt <= 0) { setError("Enter a positive amount"); return; }
    if (!transferModal.from_account_id || !transferModal.to_account_id) { setError("Pick both accounts"); return; }
    if (transferModal.from_account_id === transferModal.to_account_id) { setError("Source and destination must differ"); return; }
    setSaving(true); setError("");
    const r = await fetch("/api/admin/finance/bank-accounts/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from_account_id: transferModal.from_account_id,
        to_account_id:   transferModal.to_account_id,
        amount_ngn:      amt,
        date:            transferModal.date,
        note:            transferModal.note.trim() || null,
      }),
    });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error ?? "Transfer failed");
    else { setTransferModal(null); await load(); }
    setSaving(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Total cash + primary actions */}
      <div style={{ ...FIN_CARD, padding: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <p style={FIN_LABEL}>Total cash on hand (active accounts)</p>
          <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: "var(--app-in, #6EE7B7)" }}>{ngnFull(totalCash)}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {accounts.length >= 2 && (
            <button onClick={() => setTransferModal({
              from_account_id: accounts.find(a => a.is_default)?.id ?? accounts[0].id,
              to_account_id:   accounts.find(a => !a.is_default && a.is_active)?.id ?? accounts[1].id,
              amount_ngn: "", date: new Date().toISOString().slice(0, 10), note: "",
            })} style={FIN_GHOST_BTN}>⇄ Transfer between accounts</button>
          )}
          <button onClick={openAdd} style={FIN_PRIMARY_BTN}>+ Add bank account</button>
        </div>
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
                    <td style={{ ...FIN_TD, padding: "6px 0", color: "var(--app-text-quiet)" }}>Opening ({acct.opening_balance_date})</td>
                    <td style={{ ...FIN_TD, padding: "6px 0", textAlign: "right", fontWeight: 600 }}>{ngnFull(acct.opening_balance_ngn)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...FIN_TD, padding: "6px 0", color: "var(--app-text-quiet)" }}>Period start ({acct.period_start})</td>
                    <td style={{ ...FIN_TD, padding: "6px 0", textAlign: "right", fontWeight: 600 }}>{ngnFull(acct.period_opening)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...FIN_TD, padding: "6px 0", color: "var(--app-text-quiet)" }}>Period end ({acct.period_end})</td>
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

              <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={() => setMovementModal({ account_id: acct.id, direction: "in", amount_ngn: "", date: new Date().toISOString().slice(0, 10), note: "" })} style={FIN_GHOST_BTN}>+ Deposit</button>
                <button onClick={() => setMovementModal({ account_id: acct.id, direction: "out", amount_ngn: "", date: new Date().toISOString().slice(0, 10), note: "" })} style={FIN_GHOST_BTN}>− Withdraw</button>
                <button onClick={() => openEdit(acct)} style={FIN_GHOST_BTN}>Edit</button>
                {!acct.is_default && <button onClick={() => setDefault(acct)} style={FIN_GHOST_BTN}>Set default</button>}
                <button onClick={() => toggleActive(acct)} style={FIN_GHOST_BTN}>{acct.is_active ? "Deactivate" : "Reactivate"}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit account */}
      {accountModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 420, background: "var(--app-bg-elevated)", border: "1px solid var(--app-border-strong)", borderRadius: 16, padding: 24 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>{accountModal === "edit" ? "Edit bank account" : "Add bank account"}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <p style={FIN_LABEL}>Account name</p>
                <input className="fin-input" value={accountDraft.name} onChange={e => setAccountDraft(d => ({ ...d, name: e.target.value }))} placeholder="e.g. Marketing Account" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <p style={FIN_LABEL}>Bank name (optional)</p>
                  <input className="fin-input" value={accountDraft.bank_name} onChange={e => setAccountDraft(d => ({ ...d, bank_name: e.target.value }))} />
                </div>
                <div>
                  <p style={FIN_LABEL}>Account no. (masked)</p>
                  <input className="fin-input" value={accountDraft.account_number_masked} onChange={e => setAccountDraft(d => ({ ...d, account_number_masked: e.target.value }))} placeholder="•••• 4821" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <p style={FIN_LABEL}>Opening balance (₦)</p>
                  <input type="number" className="fin-input" value={accountDraft.opening_balance_ngn} onChange={e => setAccountDraft(d => ({ ...d, opening_balance_ngn: e.target.value }))} />
                </div>
                <div>
                  <p style={FIN_LABEL}>As of date</p>
                  <input type="date" className="fin-input" value={accountDraft.opening_balance_date} onChange={e => setAccountDraft(d => ({ ...d, opening_balance_date: e.target.value }))} />
                </div>
              </div>
              <p style={{ fontSize: 11, color: "var(--app-text-quiet)", margin: 0 }}>
                {accountModal === "edit"
                  ? "Changing the opening balance retroactively shifts every period balance for this account. Use it to true-up against real bank statements."
                  : "Set the balance in the account on the as-of date. Every transaction dated after this contributes to the current balance."}
              </p>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--app-text-muted)", cursor: "pointer" }}>
                <input type="checkbox" checked={accountDraft.is_default} onChange={e => setAccountDraft(d => ({ ...d, is_default: e.target.checked }))} />
                Default account for new auto-recorded revenue
              </label>
              {error && <p style={{ color: "var(--app-out)", fontSize: 12, margin: 0 }}>{error}</p>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                <button onClick={() => setAccountModal(null)} style={FIN_GHOST_BTN}>Cancel</button>
                <button onClick={saveAccount} disabled={saving} style={{ ...FIN_PRIMARY_BTN, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deposit / Withdraw */}
      {movementModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 420, background: "var(--app-bg-elevated)", border: "1px solid var(--app-border-strong)", borderRadius: 16, padding: 24 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700 }}>
              {movementModal.direction === "in" ? "Record deposit" : "Record withdrawal"}
            </h3>
            <p style={{ fontSize: 12, color: "var(--app-text-quiet)", margin: "0 0 14px" }}>
              {accounts.find(a => a.id === movementModal.account_id)?.name}
              {movementModal.direction === "in"
                ? " · will book as revenue.other on this account"
                : " · will book as opex.other on this account"}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <p style={FIN_LABEL}>Amount (₦)</p>
                  <input type="number" min="0" className="fin-input" value={movementModal.amount_ngn} onChange={e => setMovementModal(m => m ? { ...m, amount_ngn: e.target.value } : m)} />
                </div>
                <div>
                  <p style={FIN_LABEL}>Date</p>
                  <input type="date" className="fin-input" value={movementModal.date} onChange={e => setMovementModal(m => m ? { ...m, date: e.target.value } : m)} />
                </div>
              </div>
              <div>
                <p style={FIN_LABEL}>Note (optional)</p>
                <input className="fin-input" value={movementModal.note} onChange={e => setMovementModal(m => m ? { ...m, note: e.target.value } : m)} placeholder={movementModal.direction === "in" ? "e.g. Cash injection" : "e.g. Owner draw"} />
              </div>
              {error && <p style={{ color: "var(--app-out)", fontSize: 12, margin: 0 }}>{error}</p>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                <button onClick={() => setMovementModal(null)} style={FIN_GHOST_BTN}>Cancel</button>
                <button onClick={saveMovement} disabled={saving} style={{ ...FIN_PRIMARY_BTN, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transfer */}
      {transferModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 460, background: "var(--app-bg-elevated)", border: "1px solid var(--app-border-strong)", borderRadius: 16, padding: 24 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700 }}>Transfer between accounts</h3>
            <p style={{ fontSize: 12, color: "var(--app-text-quiet)", margin: "0 0 14px" }}>Creates a paired opex/revenue entry on each account so total cash stays constant.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <p style={FIN_LABEL}>From</p>
                  <select className="fin-input" value={transferModal.from_account_id} onChange={e => setTransferModal(m => m ? { ...m, from_account_id: e.target.value } : m)}>
                    {accounts.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <p style={FIN_LABEL}>To</p>
                  <select className="fin-input" value={transferModal.to_account_id} onChange={e => setTransferModal(m => m ? { ...m, to_account_id: e.target.value } : m)}>
                    {accounts.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <p style={FIN_LABEL}>Amount (₦)</p>
                  <input type="number" min="0" className="fin-input" value={transferModal.amount_ngn} onChange={e => setTransferModal(m => m ? { ...m, amount_ngn: e.target.value } : m)} />
                </div>
                <div>
                  <p style={FIN_LABEL}>Date</p>
                  <input type="date" className="fin-input" value={transferModal.date} onChange={e => setTransferModal(m => m ? { ...m, date: e.target.value } : m)} />
                </div>
              </div>
              <div>
                <p style={FIN_LABEL}>Note (optional)</p>
                <input className="fin-input" value={transferModal.note} onChange={e => setTransferModal(m => m ? { ...m, note: e.target.value } : m)} placeholder="e.g. Move marketing budget" />
              </div>
              {error && <p style={{ color: "var(--app-out)", fontSize: 12, margin: 0 }}>{error}</p>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                <button onClick={() => setTransferModal(null)} style={FIN_GHOST_BTN}>Cancel</button>
                <button onClick={saveTransfer} disabled={saving} style={{ ...FIN_PRIMARY_BTN, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Transfer"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
