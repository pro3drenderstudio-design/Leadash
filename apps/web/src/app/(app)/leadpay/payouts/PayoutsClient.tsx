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

const PAYOUT_STATUS: Record<string, { label: string; cls: string }> = {
  pending:    { label: "Pending",    cls: "bg-amber-500/15 text-amber-400" },
  processing: { label: "Processing", cls: "bg-blue-500/15 text-blue-400" },
  completed:  { label: "Completed",  cls: "bg-emerald-500/15 text-emerald-400" },
  failed:     { label: "Failed",     cls: "bg-red-500/15 text-red-400" },
};

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
  const fxFeeCents = Math.round(usdCents * 0.015); // 1.5% spread placeholder
  const netUsdCents = usdCents - fxFeeCents;
  const ngnKobo = Math.round(netUsdCents * fxRate * 100);
  const selectedBank = bankAccounts.find(b => b.id === bankId);

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
    const b = await res.json() as LeadPayBankAccount;
    bankAccounts.push(b);
    setBankId(b.id);
    setAddingBank(false);
  }

  async function requestPayout() {
    setRequesting(true); setError(null);
    try {
      const res = await wsFetch("/api/leadpay/payouts", { method: "POST", body: JSON.stringify({ usd_amount_cents: usdCents, bank_account_id: bankId, pin }) });
      if (!res.ok) { const d = await res.json() as { error: string }; setError(d.error); return; }
      const p = await res.json() as LeadPayPayout;
      onRequested(p);
    } catch (e) { setError(String(e)); } finally { setRequesting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111] border border-white/10 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h2 className="text-base font-semibold text-white">Withdraw Funds</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/70">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Balance */}
          <div className="px-4 py-3 bg-white/4 rounded-xl">
            <p className="text-xs text-white/40 mb-1">Available balance</p>
            <p className="text-xl font-bold text-white">{fmt(account.usd_balance_cents)}</p>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Amount (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min={0} step="0.01" placeholder="0.00"
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 font-mono" />
            </div>
            {usdCents > 0 && (
              <div className="mt-2 px-3 py-2 bg-white/4 rounded-lg text-xs text-white/50 space-y-1">
                <div className="flex justify-between"><span>FX fee (1.5%)</span><span className="tabular-nums">-{fmt(fxFeeCents)}</span></div>
                <div className="flex justify-between font-semibold text-white/80"><span>You receive (≈)</span><span className="tabular-nums">{fmtNgn(ngnKobo)}</span></div>
                <div className="flex justify-between text-white/30"><span>Rate</span><span>1 USD ≈ ₦{fxRate.toLocaleString()}</span></div>
              </div>
            )}
          </div>

          {/* Bank account */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Destination bank</label>
            {addingBank ? (
              <div className="space-y-3 p-3 bg-white/4 rounded-xl border border-white/8">
                <select value={newBankCode} onChange={e => { setNewBankCode(e.target.value); setNewBankName(NIGERIAN_BANKS.find(b => b.code === e.target.value)?.name ?? ""); setNewAccName(""); }}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                  <option value="">Select bank</option>
                  {NIGERIAN_BANKS.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                </select>
                <input value={newAccNum} onChange={e => { setNewAccNum(e.target.value.replace(/\D/g, "")); setNewAccName(""); }} onBlur={resolveNewAccount} maxLength={10} placeholder="Account number"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 font-mono focus:outline-none" />
                {resolving && <p className="text-xs text-white/30 animate-pulse">Resolving…</p>}
                {newAccName && <p className="text-sm text-emerald-400 font-medium">{newAccName}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setAddingBank(false)} className="flex-1 py-1.5 text-xs text-white/40 border border-white/10 rounded-lg">Cancel</button>
                  <button onClick={addBank} disabled={!newAccName} className="flex-1 py-1.5 text-xs text-orange-400 border border-orange-500/20 rounded-lg disabled:opacity-40">Add Bank</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {bankAccounts.map(b => (
                  <button key={b.id} onClick={() => setBankId(b.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${bankId === b.id ? "border-orange-500/40 bg-orange-500/8" : "border-white/10 hover:border-white/20"}`}>
                    <div className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">{b.account_name}</p>
                      <p className="text-xs text-white/40">{b.bank_name} · {b.account_number}</p>
                    </div>
                    {b.is_default && <span className="text-[10px] text-orange-400 font-semibold">Default</span>}
                    {bankId === b.id && <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                  </button>
                ))}
                <button onClick={() => setAddingBank(true)} className="w-full py-2.5 text-xs text-white/40 border border-dashed border-white/15 rounded-xl hover:border-white/25 hover:text-white/60 transition-all">
                  + Add bank account
                </button>
              </div>
            )}
          </div>

          {/* PIN */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Transaction PIN</label>
            <input type="password" value={pin} onChange={e => setPin(e.target.value)} maxLength={6} placeholder="••••••"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 tracking-widest font-mono text-center" />
          </div>

          <p className="text-xs text-white/30">Rate locked at time of withdrawal. Processed within 1–2 business days.</p>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-white/8">
          <button onClick={requestPayout} disabled={!amount || !bankId || !pin || requesting || usdCents > account.usd_balance_cents}
            className="px-5 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors">
            {requesting ? "Requesting…" : `Withdraw ${amount ? fmt(usdCents) : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function PayoutsClient() {
  const [account, setAccount]     = useState<LeadPayAccount | null>(null);
  const [payouts, setPayouts]     = useState<LeadPayPayout[]>([]);
  const [bankAccounts, setBankAccounts] = useState<LeadPayBankAccount[]>([]);
  const [fxRate, setFxRate]       = useState(1600);
  const [loading, setLoading]     = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const load = useCallback(async () => {
    const [acct, po, banks, rates] = await Promise.all([
      wsGet<LeadPayAccount>("/api/leadpay/account"),
      wsGet<LeadPayPayout[]>("/api/leadpay/payouts"),
      wsGet<LeadPayBankAccount[]>("/api/leadpay/bank-accounts"),
      wsGet<{ usd_ngn: number }>("/api/leadpay/rates"),
    ]).catch(() => [null, [], [], { usd_ngn: 1600 }]);
    setAccount(acct as LeadPayAccount);
    setPayouts(po as LeadPayPayout[]);
    setBankAccounts(banks as LeadPayBankAccount[]);
    setFxRate((rates as { usd_ngn: number }).usd_ngn ?? 1600);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="max-w-5xl mx-auto px-6 py-8 space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-white/4 rounded-xl animate-pulse" />)}</div>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Payouts</h1>
          <p className="text-white/40 text-sm mt-0.5">Withdraw USD to your NGN bank account</p>
        </div>
        <button onClick={() => setShowWithdraw(true)} disabled={!account || account.usd_balance_cents <= 0}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
          Withdraw
        </button>
      </div>

      {/* Balance */}
      {account && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/4 border border-white/8 rounded-xl p-4">
            <p className="text-xs text-white/40 mb-1">Available USD</p>
            <p className="text-2xl font-bold text-white tabular-nums">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(account.usd_balance_cents / 100)}</p>
          </div>
          <div className="bg-white/4 border border-white/8 rounded-xl p-4">
            <p className="text-xs text-white/40 mb-1">Pending</p>
            <p className="text-2xl font-bold text-amber-400 tabular-nums">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(account.usd_pending_cents / 100)}</p>
          </div>
          <div className="bg-white/4 border border-white/8 rounded-xl p-4">
            <p className="text-xs text-white/40 mb-1">Today&apos;s Rate</p>
            <p className="text-2xl font-bold text-white tabular-nums">₦{fxRate.toLocaleString()}</p>
            <p className="text-xs text-white/30 mt-0.5">per 1 USD</p>
          </div>
        </div>
      )}

      {/* Payout history */}
      <div className="bg-white/4 border border-white/8 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/8">
          <h2 className="text-sm font-semibold text-white">Payout History</h2>
        </div>
        <div className="grid grid-cols-12 gap-4 px-5 py-2.5 border-b border-white/5 text-[10px] text-white/30 uppercase tracking-wider font-semibold">
          <div className="col-span-2">Date</div>
          <div className="col-span-2">USD Amount</div>
          <div className="col-span-2">Rate</div>
          <div className="col-span-3">NGN Amount</div>
          <div className="col-span-2">Bank</div>
          <div className="col-span-1">Status</div>
        </div>
        {payouts.length === 0 ? (
          <div className="py-16 text-center text-white/30 text-sm">No payouts yet.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {payouts.map(p => {
              const st = PAYOUT_STATUS[p.status] ?? PAYOUT_STATUS.pending;
              return (
                <div key={p.id} className="grid grid-cols-12 gap-4 px-5 py-3.5 hover:bg-white/2 transition-colors items-center">
                  <div className="col-span-2 text-sm text-white/60">{fmtDate(p.created_at)}</div>
                  <div className="col-span-2 text-sm font-semibold text-white tabular-nums">{fmt(p.usd_amount_cents)}</div>
                  <div className="col-span-2 text-sm text-white/50 tabular-nums">₦{Number(p.fx_rate).toLocaleString()}</div>
                  <div className="col-span-3 text-sm text-white/70 tabular-nums">{fmtNgn(p.ngn_amount_kobo)}</div>
                  <div className="col-span-2 text-xs text-white/40 truncate">{p.bank_account?.bank_name ?? "—"}</div>
                  <div className="col-span-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${st.cls}`}>{st.label}</span>
                  </div>
                </div>
              );
            })}
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
