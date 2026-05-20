"use client";
import { useEffect, useState, useCallback } from "react";
import { wsGet, wsFetch } from "@/lib/workspace/client";
import type { LeadPayPayout, LeadPayBankAccount, LeadPayAccount } from "@/types/leadpay";

const NIGERIAN_BANKS = [
  { name: "Access Bank", code: "044" }, { name: "Fidelity Bank", code: "070" },
  { name: "First Bank Nigeria", code: "011" }, { name: "Guarantee Trust Bank", code: "058" },
  { name: "Kuda Bank", code: "50211" }, { name: "OPay", code: "999992" },
  { name: "Palmpay", code: "999991" }, { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Union Bank", code: "032" }, { name: "United Bank for Africa", code: "033" },
  { name: "Wema Bank", code: "035" }, { name: "Zenith Bank", code: "057" },
];

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function fmtNgn(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(kobo / 100);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const PAYOUT_STATUS: Record<string, { label: string; dot: string; text: string }> = {
  pending:    { label: "Pending",    dot: "bg-amber-400",   text: "text-amber-400" },
  processing: { label: "Processing", dot: "bg-blue-400",    text: "text-blue-400" },
  completed:  { label: "Completed",  dot: "bg-emerald-400", text: "text-emerald-400" },
  failed:     { label: "Failed",     dot: "bg-red-400",     text: "text-red-400" },
};

function StatusDot({ status }: { status: string }) {
  const cfg = PAYOUT_STATUS[status] ?? PAYOUT_STATUS.pending;
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span className={`text-[11px] font-medium ${cfg.text}`}>{cfg.label}</span>
    </span>
  );
}

// ── Withdraw modal ────────────────────────────────────────────────────────────
function WithdrawModal({ account, bankAccounts, fxRate, onClose, onRequested }: {
  account: LeadPayAccount;
  bankAccounts: LeadPayBankAccount[];
  fxRate: number;
  onClose: () => void;
  onRequested: (p: LeadPayPayout) => void;
}) {
  const [amount, setAmount]     = useState("");
  const [bankId, setBankId]     = useState(bankAccounts.find(b => b.is_default)?.id ?? bankAccounts[0]?.id ?? "");
  const [pin, setPin]           = useState("");
  const [step, setStep]         = useState<"amount" | "confirm" | "pin">("amount");
  const [requesting, setRequesting] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Add bank inline
  const [addingBank, setAddingBank]   = useState(false);
  const [newBankCode, setNewBankCode] = useState("");
  const [newBankName, setNewBankName] = useState("");
  const [newAccNum, setNewAccNum]     = useState("");
  const [newAccName, setNewAccName]   = useState("");
  const [resolving, setResolving]     = useState(false);

  const usdCents = Math.round(parseFloat(amount || "0") * 100);
  const fxFeeCents = Math.round(usdCents * 0.015);
  const netUsdCents = usdCents - fxFeeCents;
  const ngnKobo = Math.round(netUsdCents * fxRate * 100);
  const selectedBank = bankAccounts.find(b => b.id === bankId);
  const isInsufficient = usdCents > account.usd_balance_cents;

  async function resolveNewAccount() {
    if (newAccNum.length !== 10 || !newBankCode) return;
    setResolving(true);
    try {
      const res = await wsFetch("/api/leadpay/bank-accounts/resolve", { method: "POST", body: JSON.stringify({ account_number: newAccNum, bank_code: newBankCode }) });
      const d = await res.json() as { account_name?: string };
      if (d.account_name) setNewAccName(d.account_name);
    } finally { setResolving(false); }
  }

  async function addBank() {
    const res = await wsFetch("/api/leadpay/bank-accounts", { method: "POST", body: JSON.stringify({ account_number: newAccNum, account_name: newAccName, bank_name: newBankName, bank_code: newBankCode, is_default: bankAccounts.length === 0 }) });
    const { bank_account: b } = await res.json() as { bank_account: LeadPayBankAccount };
    bankAccounts.push(b);
    setBankId(b.id);
    setAddingBank(false);
  }

  async function requestPayout() {
    setRequesting(true); setError(null);
    try {
      const res = await wsFetch("/api/leadpay/payouts", { method: "POST", body: JSON.stringify({ usd_amount_cents: usdCents, bank_account_id: bankId, pin }) });
      if (!res.ok) { const d = await res.json() as { error: string }; setError(d.error); return; }
      const { payout: p } = await res.json() as { payout: LeadPayPayout };
      onRequested(p);
    } catch (e) { setError(String(e)); } finally { setRequesting(false); }
  }

  const INPUT = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-orange-500/40 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0e0e12] border border-white/[0.08] rounded-2xl w-full max-w-md shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-semibold text-white">Withdraw Funds</h2>
            <p className="text-xs text-white/35 mt-0.5">Transfer USD to your NGN bank account</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Balance card */}
          <div className="relative overflow-hidden px-5 py-4 bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/[0.08] rounded-2xl">
            <p className="text-[10px] uppercase tracking-widest text-white/35 font-semibold mb-2">Available Balance</p>
            <p className="text-3xl font-bold text-white tabular-nums">{fmt(account.usd_balance_cents)}</p>
            {account.usd_pending_cents > 0 && (
              <p className="text-xs text-amber-400/70 mt-1.5">+ {fmt(account.usd_pending_cents)} pending</p>
            )}
            <div className="absolute top-3 right-4 opacity-10">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Withdrawal amount (USD)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-sm font-medium">$</span>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min={0} step="0.01" placeholder="0.00"
                className={`${INPUT} pl-8 font-mono text-lg ${isInsufficient && usdCents > 0 ? "border-red-500/40" : ""}`} />
            </div>
            {isInsufficient && usdCents > 0 && (
              <p className="text-xs text-red-400 mt-1.5">Amount exceeds available balance</p>
            )}
            {usdCents > 0 && !isInsufficient && (
              <div className="mt-2.5 px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/40">FX fee (1.5%)</span>
                  <span className="text-white/50 tabular-nums">- {fmt(fxFeeCents)}</span>
                </div>
                <div className="flex items-center justify-between text-xs border-t border-white/[0.06] pt-2">
                  <span className="text-white/40">Exchange rate</span>
                  <span className="text-white/50">1 USD ≈ ₦{fxRate.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-white/70">You receive (approx)</span>
                  <span className="text-emerald-400 tabular-nums">{fmtNgn(ngnKobo)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Destination bank */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Destination bank account</label>
            {addingBank ? (
              <div className="space-y-3 p-4 bg-white/[0.03] rounded-xl border border-white/[0.08]">
                <p className="text-xs font-semibold text-white/50 uppercase tracking-widest">Add Bank Account</p>
                <select value={newBankCode}
                  onChange={e => { setNewBankCode(e.target.value); setNewBankName(NIGERIAN_BANKS.find(b => b.code === e.target.value)?.name ?? ""); setNewAccName(""); }}
                  className={INPUT} style={{ colorScheme: "dark" }}>
                  <option value="">Select bank…</option>
                  {NIGERIAN_BANKS.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                </select>
                <input value={newAccNum}
                  onChange={e => { setNewAccNum(e.target.value.replace(/\D/g, "")); setNewAccName(""); }}
                  onBlur={resolveNewAccount} maxLength={10} placeholder="10-digit account number"
                  className={INPUT + " font-mono tracking-widest"} />
                {resolving && (
                  <div className="flex items-center gap-2 text-xs text-white/30">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Resolving account…
                  </div>
                )}
                {newAccName && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    <span className="text-sm font-semibold text-emerald-400">{newAccName}</span>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setAddingBank(false)} className="flex-1 py-2 text-xs text-white/40 border border-white/[0.1] rounded-xl hover:text-white/60 hover:border-white/20 transition-all">
                    Cancel
                  </button>
                  <button onClick={addBank} disabled={!newAccName}
                    className="flex-1 py-2 text-xs text-orange-400 border border-orange-500/25 rounded-xl disabled:opacity-40 hover:bg-orange-500/10 transition-all font-semibold">
                    Save Bank
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {bankAccounts.map(b => (
                  <button key={b.id} onClick={() => setBankId(b.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left ${
                      bankId === b.id
                        ? "border-orange-500/40 bg-orange-500/[0.06] shadow-sm shadow-orange-500/10"
                        : "border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.02]"
                    }`}>
                    <div className="w-9 h-9 rounded-xl bg-white/[0.07] flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{b.account_name}</p>
                      <p className="text-xs text-white/35 mt-0.5">{b.bank_name} · ···{b.account_number.slice(-4)}</p>
                    </div>
                    {b.is_default && (
                      <span className="text-[10px] text-orange-400 font-semibold uppercase tracking-wide bg-orange-500/10 px-2 py-0.5 rounded-md">Default</span>
                    )}
                    {bankId === b.id && (
                      <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    )}
                  </button>
                ))}
                <button onClick={() => setAddingBank(true)}
                  className="w-full py-3 text-xs text-white/35 border border-dashed border-white/[0.1] rounded-xl hover:border-white/[0.2] hover:text-white/55 transition-all flex items-center justify-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Add bank account
                </button>
              </div>
            )}
          </div>

          {/* PIN */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Transaction PIN</label>
            <input type="password" value={pin} onChange={e => setPin(e.target.value)} maxLength={6} placeholder="••••••"
              className={INPUT + " tracking-[0.5em] font-mono text-center text-lg"} />
          </div>

          <p className="text-xs text-white/25 leading-relaxed">
            Rate is locked at time of withdrawal. Payouts are typically processed within 1–2 business days.
          </p>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06] bg-white/[0.01]">
          <button onClick={onClose} className="text-sm text-white/35 hover:text-white/60 transition-colors">Cancel</button>
          <button
            onClick={requestPayout}
            disabled={!amount || !bankId || !pin || requesting || isInsufficient || usdCents <= 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-orange-500/20">
            {requesting ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Requesting…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                Withdraw {amount ? fmt(usdCents) : ""}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function PayoutsClient() {
  const [account, setAccount]           = useState<LeadPayAccount | null>(null);
  const [payouts, setPayouts]           = useState<LeadPayPayout[]>([]);
  const [bankAccounts, setBankAccounts] = useState<LeadPayBankAccount[]>([]);
  const [fxRate, setFxRate]             = useState(1600);
  const [loading, setLoading]           = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const load = useCallback(async () => {
    const [acctRes, poRes, banksRes, ratesRes] = await Promise.all([
      wsGet<{ account: LeadPayAccount | null }>("/api/leadpay/account"),
      wsGet<{ payouts: LeadPayPayout[]; total: number }>("/api/leadpay/payouts"),
      wsGet<{ bank_accounts: LeadPayBankAccount[] }>("/api/leadpay/bank-accounts"),
      wsGet<{ client_rate: number }>("/api/leadpay/rates"),
    ]).catch(() => [{ account: null }, { payouts: [], total: 0 }, { bank_accounts: [] }, { client_rate: 1600 }]);
    setAccount((acctRes as { account: LeadPayAccount | null }).account ?? null);
    setPayouts((poRes as { payouts: LeadPayPayout[] }).payouts ?? []);
    setBankAccounts((banksRes as { bank_accounts: LeadPayBankAccount[] }).bank_accounts ?? []);
    setFxRate((ratesRes as { client_rate: number }).client_rate ?? 1600);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-24 bg-white/[0.04] rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Payouts</h1>
          <p className="text-white/40 text-sm mt-1">Withdraw your earnings to a Nigerian bank account</p>
        </div>
        <button onClick={() => setShowWithdraw(true)} disabled={!account || account.usd_balance_cents <= 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
          Withdraw
        </button>
      </div>

      {/* Balance cards */}
      {account && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Available balance – hero card */}
          <div className="md:col-span-1 relative overflow-hidden bg-gradient-to-br from-orange-500/[0.12] via-orange-500/[0.06] to-transparent border border-orange-500/[0.15] rounded-2xl p-5">
            <p className="text-[10px] uppercase tracking-widest text-white/40 font-semibold mb-3">Available Balance</p>
            <p className="text-4xl font-bold text-white tabular-nums leading-none">
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(account.usd_balance_cents / 100)}
            </p>
            <p className="text-xs text-white/30 mt-2">Ready to withdraw</p>
            <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-orange-500/[0.06] blur-xl" />
          </div>

          {/* Pending */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
            <p className="text-[10px] uppercase tracking-widest text-white/35 font-semibold mb-3">Pending</p>
            <p className="text-3xl font-bold text-amber-400 tabular-nums leading-none">
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(account.usd_pending_cents / 100)}
            </p>
            <p className="text-xs text-white/25 mt-2">Processing / in-flight</p>
          </div>

          {/* FX rate */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
            <p className="text-[10px] uppercase tracking-widest text-white/35 font-semibold mb-3">Today&apos;s Rate</p>
            <div className="flex items-baseline gap-1">
              <span className="text-white/40 text-lg font-bold">₦</span>
              <p className="text-3xl font-bold text-white tabular-nums leading-none">{fxRate.toLocaleString()}</p>
            </div>
            <p className="text-xs text-white/25 mt-2">per 1 USD · incl. 1.5% spread</p>
          </div>
        </div>
      )}

      {/* Payout history */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
          <h2 className="text-sm font-semibold text-white">Payout History</h2>
          <span className="text-xs text-white/30">{payouts.length} total</span>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/[0.04] bg-white/[0.015]">
          <div className="col-span-2 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Date</div>
          <div className="col-span-2 text-[10px] uppercase tracking-widest text-white/30 font-semibold">USD Amount</div>
          <div className="col-span-2 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Rate</div>
          <div className="col-span-3 text-[10px] uppercase tracking-widest text-white/30 font-semibold">NGN Received</div>
          <div className="col-span-2 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Bank</div>
          <div className="col-span-1 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Status</div>
        </div>

        {payouts.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
            </div>
            <p className="text-sm font-medium text-white/40">No payouts yet</p>
            <p className="text-xs text-white/25 mt-1">Your withdrawal history will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {payouts.map(p => (
              <div key={p.id} className="grid grid-cols-12 gap-4 px-5 py-4 hover:bg-white/[0.025] transition-colors items-center">
                <div className="col-span-2">
                  <p className="text-sm text-white/60">{fmtDate(p.created_at)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm font-bold text-white tabular-nums">{fmt(p.usd_amount_cents)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-white/45 tabular-nums">₦{Number(p.fx_rate).toLocaleString()}</p>
                </div>
                <div className="col-span-3">
                  <p className="text-sm text-white/65 tabular-nums font-medium">{fmtNgn(p.ngn_amount_kobo)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-white/35 truncate">{p.bank_account?.bank_name ?? "—"}</p>
                  {p.bank_account && (
                    <p className="text-[10px] text-white/20 mt-0.5">···{p.bank_account.account_number?.slice(-4)}</p>
                  )}
                </div>
                <div className="col-span-1">
                  <StatusDot status={p.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showWithdraw && account && (
        <WithdrawModal
          account={account}
          bankAccounts={bankAccounts}
          fxRate={fxRate}
          onClose={() => setShowWithdraw(false)}
          onRequested={p => { setPayouts(prev => [p, ...prev]); setShowWithdraw(false); load(); }}
        />
      )}
    </div>
  );
}
