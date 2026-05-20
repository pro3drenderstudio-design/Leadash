"use client";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { wsGet, wsFetch } from "@/lib/workspace/client";
import type { LeadPayCard, LeadPayCardTransaction, LeadPayAccount } from "@/types/leadpay";

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Visual card component ─────────────────────────────────────────────────────
function VirtualCard({ card, onAction }: { card: LeadPayCard; onAction: (a: "freeze" | "unfreeze" | "fund" | "terminate") => void }) {
  const isFrozen = card.status === "frozen";
  const isTerminated = card.status === "terminated";
  return (
    <div className={`relative rounded-2xl p-5 overflow-hidden ${isTerminated ? "opacity-50 grayscale" : ""}`}
      style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", minHeight: 180 }}>
      {/* Card shine */}
      <div className="absolute inset-0 opacity-10" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 60%)" }} />
      {/* Frozen overlay */}
      {isFrozen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl">
          <div className="flex flex-col items-center gap-1.5">
            <svg className="w-8 h-8 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1M3 12h1m16 0h1M5.636 5.636l.707.707M17.657 17.657l.707.707M5.636 18.364l.707-.707M17.657 6.343l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
            <span className="text-xs text-blue-300 font-semibold uppercase tracking-widest">Frozen</span>
          </div>
        </div>
      )}
      {/* LeadPay wordmark */}
      <div className="flex items-center justify-between mb-8">
        <span className="text-white font-bold text-sm tracking-tight opacity-90">LeadPay</span>
        <div className="w-10 h-7 rounded bg-white/10 flex items-center justify-center">
          <div className="w-6 h-4 rounded-sm bg-amber-400 opacity-80" />
        </div>
      </div>
      {/* PAN */}
      <div className="mb-4">
        <p className="text-white/40 text-[10px] mb-1 font-mono tracking-widest">CARD NUMBER</p>
        <p className="text-white font-mono text-sm tracking-[0.25em]">
          {card.masked_pan ? card.masked_pan : `•••• •••• •••• ${card.last_four ?? "••••"}`}
        </p>
      </div>
      {/* Bottom row */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-white/40 text-[9px] mb-0.5 uppercase tracking-widest">Balance</p>
          <p className="text-white font-bold text-base tabular-nums">{fmt(card.balance_cents)}</p>
        </div>
        <div className="text-right">
          <p className="text-white/40 text-[9px] mb-0.5 uppercase tracking-widest">Expires</p>
          <p className="text-white/80 font-mono text-xs">
            {card.expiry_month ?? "••"}/{card.expiry_year?.slice(-2) ?? "••"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Create card modal ─────────────────────────────────────────────────────────
function CreateCardModal({ account, onClose, onCreated }: { account: LeadPayAccount; onClose: () => void; onCreated: (c: LeadPayCard) => void }) {
  const [label, setLabel]         = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const [creating, setCreating]   = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const creationFeeCents = 500; // $5 — will come from admin settings later
  const fundCents = Math.round(parseFloat(fundAmount || "0") * 100);
  const totalCost = creationFeeCents + fundCents;

  async function create() {
    setCreating(true); setError(null);
    try {
      const res = await wsFetch("/api/leadpay/cards", {
        method: "POST",
        body: JSON.stringify({ label, initial_fund_cents: fundCents, monthly_limit_cents: monthlyLimit ? Math.round(parseFloat(monthlyLimit) * 100) : null }),
      });
      if (!res.ok) { const d = await res.json() as { error: string }; setError(d.error); return; }
      const { card: created } = await res.json() as { card: LeadPayCard };
      onCreated(created);
    } catch (e) { setError(String(e)); } finally { setCreating(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111] border border-white/10 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h2 className="text-base font-semibold text-white">Create Virtual Card</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/70">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Card label / nickname</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Canva Subscription, Google Ads"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Initial funding (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
              <input type="number" value={fundAmount} onChange={e => setFundAmount(e.target.value)} min={5} step="0.01" placeholder="5.00"
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Monthly spending limit <span className="text-white/20">(optional)</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
              <input type="number" value={monthlyLimit} onChange={e => setMonthlyLimit(e.target.value)} min={0} step="1" placeholder="No limit"
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 font-mono" />
            </div>
          </div>
          {/* Fee breakdown */}
          <div className="px-3 py-3 bg-white/4 rounded-xl text-xs text-white/50 space-y-1.5">
            <div className="flex justify-between"><span>Card creation fee</span><span>{fmt(creationFeeCents)}</span></div>
            {fundCents > 0 && <div className="flex justify-between"><span>Initial funding</span><span>{fmt(fundCents)}</span></div>}
            <div className="flex justify-between font-semibold text-white/80 border-t border-white/10 pt-1.5"><span>Total charged</span><span>{fmt(totalCost)}</span></div>
            <p className="text-white/30">Available balance: {fmt(account.usd_balance_cents)}</p>
          </div>
          {totalCost > account.usd_balance_cents && (
            <p className="text-sm text-red-400">Insufficient balance. Top up your account first.</p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-white/8">
          <button onClick={create} disabled={creating || !label || totalCost > account.usd_balance_cents}
            className="px-5 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors">
            {creating ? "Creating…" : "Create Card"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Fund card modal ───────────────────────────────────────────────────────────
function FundModal({ card, account, onClose, onFunded }: { card: LeadPayCard; account: LeadPayAccount; onClose: () => void; onFunded: (c: LeadPayCard) => void }) {
  const [amount, setAmount] = useState("");
  const [funding, setFunding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cents = Math.round(parseFloat(amount || "0") * 100);

  async function fund() {
    setFunding(true);
    try {
      const res = await wsFetch(`/api/leadpay/cards/${card.id}/fund`, { method: "POST", body: JSON.stringify({ amount_cents: cents }) });
      if (!res.ok) { const d = await res.json() as { error: string }; setError(d.error); return; }
      const { card: funded } = await res.json() as { card: LeadPayCard };
      onFunded(funded);
    } catch (e) { setError(String(e)); } finally { setFunding(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111] border border-white/10 rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h2 className="text-base font-semibold text-white">Fund Card — {card.label}</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/70">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Card balance</span><span className="text-white font-semibold">{fmt(card.balance_cents)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Available USD</span><span className="text-white/70">{fmt(account.usd_balance_cents)}</span>
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Amount to add (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min={1} step="0.01" placeholder="0.00"
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 font-mono" />
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-white/8">
          <button onClick={fund} disabled={funding || !cents || cents > account.usd_balance_cents}
            className="px-5 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors">
            {funding ? "Funding…" : "Add Funds"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function CardsClient() {
  const params = useSearchParams();
  const [account, setAccount]   = useState<LeadPayAccount | null>(null);
  const [cards, setCards]       = useState<LeadPayCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<LeadPayCard | null>(null);
  const [txns, setTxns]         = useState<LeadPayCardTransaction[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(params.get("new") === "1");
  const [showFund, setShowFund] = useState(false);
  const [actioning, setActioning] = useState(false);

  const load = useCallback(async () => {
    const [acctRes, csRes] = await Promise.all([
      wsGet<{ account: LeadPayAccount | null }>("/api/leadpay/account"),
      wsGet<{ cards: LeadPayCard[] }>("/api/leadpay/cards"),
    ]).catch(() => [{ account: null }, { cards: [] }]);
    const csArr = (csRes as { cards: LeadPayCard[] }).cards ?? [];
    setAccount((acctRes as { account: LeadPayAccount | null }).account ?? null);
    setCards(csArr);
    if (csArr.length > 0 && !selectedCard) setSelectedCard(csArr[0]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedCard) return;
    wsGet<{ transactions: LeadPayCardTransaction[]; total: number }>(`/api/leadpay/cards/${selectedCard.id}/transactions`)
      .then(d => setTxns(d.transactions ?? []))
      .catch(() => setTxns([]));
  }, [selectedCard]);

  async function toggleFreeze(card: LeadPayCard) {
    setActioning(true);
    try {
      const res = await wsFetch(`/api/leadpay/cards/${card.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: card.status === "frozen" ? "unfreeze" : "freeze" }),
      });
      const { card: updated } = await res.json() as { card: LeadPayCard };
      setCards(prev => prev.map(c => c.id === updated.id ? updated : c));
      if (selectedCard?.id === updated.id) setSelectedCard(updated);
    } finally { setActioning(false); }
  }

  if (loading) return <div className="max-w-5xl mx-auto px-6 py-8 space-y-4">{[1,2,3].map(i => <div key={i} className="h-36 bg-white/4 rounded-xl animate-pulse" />)}</div>;

  // ── Empty state ──────────────────────────────────────────────────────────
  if (cards.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Virtual Cards</h2>
        <p className="text-white/40 text-sm mb-6">Pay for online subscriptions and tools using USD virtual cards funded from your LeadPay balance.</p>
        <button onClick={() => setShowCreate(true)}
          className="px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-xl transition-colors">
          Create Your First Card
        </button>
        {showCreate && account && (
          <CreateCardModal account={account} onClose={() => setShowCreate(false)}
            onCreated={c => { setCards([c]); setSelectedCard(c); setShowCreate(false); }} />
        )}
      </div>
    );
  }

  const TX_STATUS_CLS: Record<string, string> = {
    approved: "text-emerald-400",
    declined: "text-red-400",
    reversed: "text-white/40",
    refunded: "text-blue-400",
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Virtual Cards</h1>
          <p className="text-white/40 text-sm mt-0.5">{cards.filter(c => c.status !== "terminated").length} active</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          New Card
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Card list */}
        <div className="lg:col-span-2 space-y-3">
          {cards.map(card => (
            <button key={card.id} onClick={() => setSelectedCard(card)}
              className={`w-full text-left transition-all ${selectedCard?.id === card.id ? "ring-2 ring-orange-500/50" : "hover:opacity-90"} rounded-2xl`}>
              <VirtualCard card={card} onAction={() => {}} />
              <div className="mt-1 px-1 flex items-center justify-between">
                <span className="text-xs text-white/50">{card.label}</span>
                <span className={`text-[10px] font-semibold uppercase ${card.status === "active" ? "text-emerald-400" : card.status === "frozen" ? "text-blue-400" : "text-white/30"}`}>{card.status}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Card detail */}
        {selectedCard && (
          <div className="lg:col-span-3 space-y-4">
            {/* Actions */}
            <div className="bg-white/4 border border-white/8 rounded-xl p-4">
              <p className="text-sm font-semibold text-white mb-3">{selectedCard.label}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setShowFund(true)} disabled={selectedCard.status === "terminated"}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/10 text-white/60 hover:text-white hover:border-white/20 rounded-lg disabled:opacity-30 transition-all">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Fund Card
                </button>
                <button onClick={() => toggleFreeze(selectedCard)} disabled={actioning || selectedCard.status === "terminated"}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all disabled:opacity-30 ${selectedCard.status === "frozen" ? "border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" : "border border-blue-500/30 text-blue-400 hover:bg-blue-500/10"}`}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={selectedCard.status === "frozen" ? "M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" : "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"} /></svg>
                  {selectedCard.status === "frozen" ? "Unfreeze" : "Freeze"}
                </button>
                {selectedCard.status !== "terminated" && (
                  <button onClick={async () => {
                    if (!confirm("Terminate this card? This cannot be undone.")) return;
                    setActioning(true);
                    const res = await wsFetch(`/api/leadpay/cards/${selectedCard.id}`, { method: "PATCH", body: JSON.stringify({ action: "terminate" }) });
                    const { card: updated } = await res.json() as { card: LeadPayCard };
                    setCards(prev => prev.map(c => c.id === updated.id ? updated : c));
                    setSelectedCard(updated);
                    setActioning(false);
                  }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                    Terminate
                  </button>
                )}
              </div>
            </div>

            {/* Transactions */}
            <div className="bg-white/4 border border-white/8 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-white/8">
                <h3 className="text-sm font-semibold text-white">Card Transactions</h3>
              </div>
              {txns.length === 0 ? (
                <div className="py-10 text-center text-white/30 text-sm">No transactions on this card yet</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {txns.map(tx => (
                    <div key={tx.id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/80 truncate">{tx.merchant ?? "Unknown merchant"}</p>
                        <p className="text-xs text-white/30 mt-0.5">{fmtDate(tx.created_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold tabular-nums ${TX_STATUS_CLS[tx.status] ?? "text-white/50"}`}>
                          {tx.status === "declined" ? "Declined" : `-${fmt(tx.amount_cents)}`}
                        </p>
                        {tx.decline_reason && <p className="text-[10px] text-red-400/70">{tx.decline_reason}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showCreate && account && (
        <CreateCardModal account={account} onClose={() => setShowCreate(false)}
          onCreated={c => { setCards(prev => [c, ...prev]); setSelectedCard(c); setShowCreate(false); }} />
      )}
      {showFund && selectedCard && account && (
        <FundModal card={selectedCard} account={account} onClose={() => setShowFund(false)}
          onFunded={c => { setCards(prev => prev.map(x => x.id === c.id ? c : x)); setSelectedCard(c); setShowFund(false); load(); }} />
      )}
    </div>
  );
}
