"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { wsGet } from "@/lib/workspace/client";
import type { LeadPayAccount, LeadPayDashboardStats, LeadPayInvoice, LeadPayTransaction } from "@/types/leadpay";
import "@/v2-app/v2-app.css";

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(cents / 100);
}
function fmtShort(cents: number) {
  if (cents >= 100000) return "$" + (cents / 100000).toFixed(1) + "k";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(cents / 100);
}
function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

const TX_CFG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  invoice_payment: { label: "Invoice Payment", icon: "↓", color: "text-emerald-400", bg: "bg-emerald-500/12 border-emerald-500/20" },
  payout:          { label: "Payout",          icon: "↑", color: "text-blue-400",    bg: "bg-blue-500/12 border-blue-500/20" },
  fee:             { label: "Fee",             icon: "−", color: "text-white/40",   bg: "bg-white/5 border-white/10" },
  refund:          { label: "Refund",          icon: "↩", color: "text-violet-400", bg: "bg-violet-500/12 border-violet-500/20" },
  adjustment:      { label: "Adjustment",      icon: "≈", color: "text-amber-400",  bg: "bg-amber-500/12 border-amber-500/20" },
};

const INV_STATUS: Record<string, { label: string; dot: string; text: string }> = {
  draft:     { label: "Draft",    dot: "bg-white/20",     text: "text-white/40" },
  sent:      { label: "Sent",     dot: "bg-blue-400",     text: "text-blue-400" },
  viewed:    { label: "Viewed",   dot: "bg-violet-400",   text: "text-violet-400" },
  paid:      { label: "Paid",     dot: "bg-emerald-400",  text: "text-emerald-400" },
  overdue:   { label: "Overdue",  dot: "bg-red-400",      text: "text-red-400" },
  cancelled: { label: "Cancelled",dot: "bg-white/20",     text: "text-white/30" },
};

function KycBanner({ status }: { status: string }) {
  if (status === "verified") return null;
  const cfg: Record<string, { msg: string; color: string; bg: string; icon: string }> = {
    unverified:     { msg: "Complete identity verification to unlock receiving payments.", color: "text-amber-300", bg: "bg-amber-500/8 border-amber-500/20", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" },
    pending:        { msg: "Identity verification under review — usually takes 24 hours.", color: "text-blue-300", bg: "bg-blue-500/8 border-blue-500/20", icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
    needs_more_info:{ msg: "Additional information required to verify your identity.", color: "text-orange-300", bg: "bg-orange-500/8 border-orange-500/20", icon: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" },
    rejected:       { msg: "Identity verification rejected. Please contact support.", color: "text-red-300", bg: "bg-red-500/8 border-red-500/20", icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" },
  };
  const c = cfg[status] ?? cfg.unverified;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border mb-6 ${c.bg}`}>
      <svg className={`w-4 h-4 flex-shrink-0 ${c.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={c.icon} />
      </svg>
      <p className={`text-sm flex-1 ${c.color}`}>{c.msg}</p>
      {status === "unverified" && (
        <Link href="/leadpay/onboarding" className={`text-xs font-semibold underline underline-offset-2 hover:no-underline ${c.color}`}>
          Verify now →
        </Link>
      )}
    </div>
  );
}

export default function LeadPayDashboardClient() {
  const router = useRouter();
  const [account, setAccount] = useState<LeadPayAccount | null>(null);
  const [stats,   setStats]   = useState<LeadPayDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [noAccount, setNoAccount] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [acctRes, statsData] = await Promise.all([
          wsGet<{ account: LeadPayAccount | null }>("/api/leadpay/account"),
          wsGet<LeadPayDashboardStats>("/api/leadpay/dashboard"),
        ]);
        if (!acctRes.account) { setNoAccount(true); return; }
        setAccount(acctRes.account);
        setStats(statsData);
      } catch {
        setNoAccount(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <div className="h-48 bg-white/4 rounded-3xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-28 bg-white/4 rounded-2xl animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-72 bg-white/4 rounded-2xl animate-pulse" />
          <div className="h-72 bg-white/4 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (noAccount || !account) {
    return (
      <div className="v2-app" style={{ minHeight: "100%", background: "var(--app-bg)" }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-24">
        {/* Hero onboarding */}
        <div className="text-center mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            New feature
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
            Get paid in USD.<br />
            <span className="text-emerald-400">Receive in Naira.</span>
          </h1>
          <p className="text-white/50 text-sm sm:text-base leading-relaxed">
            Invoice your international clients, collect payments securely, and withdraw straight to your Nigerian bank account.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          {[
            { num: "01", label: "Invoice clients",   desc: "Send professional USD invoices to anyone, worldwide." },
            { num: "02", label: "Collect payments",  desc: "Clients pay via card — funds settle to your balance." },
            { num: "03", label: "Withdraw to NGN",   desc: "Request payouts direct to any Nigerian bank account." },
          ].map(s => (
            <div key={s.num} className="bg-white/4 border border-white/8 rounded-2xl p-4">
              <div className="text-[10px] font-bold text-white/20 mb-2 font-mono">{s.num}</div>
              <p className="text-sm font-semibold text-white mb-1">{s.label}</p>
              <p className="text-xs text-white/40 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => router.push("/leadpay/onboarding")}
            className="app-btn app-btn-primary app-btn-lg"
          >
            Set up Leadash Pay →
          </button>
        </div>
      </div>
      </div>
    );
  }

  const s = stats!;

  return (
    <div className="v2-app" style={{ minHeight: "100%", background: "var(--app-bg)" }}>
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-white">Leadash Pay</h1>
          </div>
          <p className="text-white/40 text-sm">
            {account.display_name ?? account.legal_first_name ?? "Your account"} · {account.kyc_status === "verified" ? "Verified" : "Pending verification"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/leadpay/payouts"
            className="flex items-center gap-1.5 px-3.5 py-2 border border-white/10 text-white/70 hover:text-white hover:border-white/20 rounded-xl text-sm font-medium transition-all">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
            Withdraw
          </Link>
          <Link href="/leadpay/invoices?new=1"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-orange-500/20">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Invoice
          </Link>
        </div>
      </div>

      <KycBanner status={account.kyc_status} />

      {/* Balance hero card */}
      <div className="relative rounded-3xl overflow-hidden mb-5 border border-white/[0.07]" style={{ background: "linear-gradient(135deg, #0c1f17 0%, #0a1710 40%, #080d0a 100%)" }}>
        {/* Decorative glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/8 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-teal-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative p-7 pb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs text-white/40 uppercase tracking-widest font-semibold mb-3">Available Balance</p>
              <div className="flex items-baseline gap-2">
                <span className="text-white/40 text-2xl font-light">$</span>
                <span className="text-5xl font-bold text-white tabular-nums tracking-tight">
                  {(s.usd_balance_cents / 100).toFixed(2)}
                </span>
                <span className="text-white/30 text-lg font-light">USD</span>
              </div>
              {s.usd_pending_cents > 0 && (
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <p className="text-sm text-amber-400/80">{fmt(s.usd_pending_cents)} pending clearance</p>
                </div>
              )}
            </div>

            <div className="text-right">
              <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1">Exchange rate</p>
              <p className="text-sm text-white/50 font-mono">1 USD</p>
              <p className="text-xs text-white/30">live rate applied on withdrawal</p>
            </div>
          </div>

          {/* Inline stats row */}
          <div className="grid grid-cols-3 gap-px bg-white/[0.06] rounded-2xl overflow-hidden">
            <div className="bg-[#080d0a] px-5 py-4">
              <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">Received this month</p>
              <p className="text-xl font-bold text-emerald-400 tabular-nums">{fmtShort(s.received_mtd_cents)}</p>
            </div>
            <div className="bg-[#080d0a] px-5 py-4">
              <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">Paid out this month</p>
              <p className="text-xl font-bold text-white/70 tabular-nums">{fmtShort(s.paid_out_mtd_cents)}</p>
            </div>
            <div className="bg-[#080d0a] px-5 py-4">
              <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">Invoices sent MTD</p>
              <p className="text-xl font-bold text-white tabular-nums">{s.invoices_sent_mtd}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Activity + Unpaid invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Recent activity */}
        <div className="lg:col-span-2 bg-white/[0.04] border border-white/[0.07] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
            <Link href="/leadpay/transactions" className="text-xs text-white/35 hover:text-white/70 transition-colors font-medium">
              View all →
            </Link>
          </div>
          {s.recent_transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-5 text-center">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
                </svg>
              </div>
              <p className="text-sm text-white/30">No transactions yet</p>
              <p className="text-xs text-white/20 mt-1">Send your first invoice to get started</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {s.recent_transactions.map((tx: LeadPayTransaction) => {
                const cfg = TX_CFG[tx.type] ?? TX_CFG.adjustment;
                const isCredit = tx.type === "invoice_payment" || tx.type === "refund";
                return (
                  <div key={tx.id} className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 font-bold text-sm ${cfg.bg} ${cfg.color}`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate">{tx.description}</p>
                      <p className="text-xs text-white/30 mt-0.5">{cfg.label} · {timeAgo(tx.created_at)}</p>
                    </div>
                    {tx.usd_amount_cents != null && (
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-bold tabular-nums ${isCredit ? "text-emerald-400" : "text-white/50"}`}>
                          {isCredit ? "+" : "−"}{fmt(Math.abs(tx.usd_amount_cents))}
                        </p>
                        <p className={`text-[10px] capitalize mt-0.5 ${tx.status === "completed" ? "text-white/25" : tx.status === "pending" ? "text-amber-400/70" : "text-red-400/70"}`}>
                          {tx.status}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Unpaid invoices */}
        <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-semibold text-white">Awaiting Payment</h2>
            <Link href="/leadpay/invoices" className="text-xs text-white/35 hover:text-white/70 transition-colors font-medium">
              All →
            </Link>
          </div>
          {s.unpaid_invoices.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 px-5 text-center">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-2.5">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-sm text-white/50">All clear!</p>
              <p className="text-xs text-white/25 mt-0.5">No outstanding invoices</p>
            </div>
          ) : (
            <div className="flex-1 divide-y divide-white/[0.04]">
              {s.unpaid_invoices.map((inv: LeadPayInvoice) => {
                const st = INV_STATUS[inv.status] ?? INV_STATUS.sent;
                return (
                  <Link key={inv.id} href={`/leadpay/invoices/${inv.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate group-hover:text-white transition-colors">
                        {inv.client_name ?? inv.client_email ?? "Unknown client"}
                      </p>
                      <p className="text-xs text-white/30 mt-0.5 font-mono">{inv.invoice_number}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-white/80 tabular-nums">{fmt(inv.total_cents)}</p>
                      <div className="flex items-center gap-1 justify-end mt-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                        <span className={`text-[10px] font-medium ${st.text}`}>{st.label}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <div className="px-5 py-3.5 border-t border-white/[0.06] mt-auto">
            <Link href="/leadpay/invoices?new=1"
              className="flex items-center justify-center gap-1.5 w-full py-2.5 text-xs text-white/40 hover:text-white/70 border border-dashed border-white/[0.12] hover:border-white/20 rounded-xl transition-all font-medium">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Create Invoice
            </Link>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { href: "/leadpay/invoices?new=1", label: "Create Invoice", sub: "Bill a client", icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z", color: "from-orange-500/15 to-orange-500/5 border-orange-500/20 hover:border-orange-500/35", icon_color: "text-orange-400" },
          { href: "/leadpay/clients?new=1",  label: "Add Client",     sub: "Save contact details", icon: "M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z", color: "from-blue-500/15 to-blue-500/5 border-blue-500/20 hover:border-blue-500/35", icon_color: "text-blue-400" },
          { href: "/leadpay/payouts",        label: "Withdraw Funds", sub: "Transfer to bank", icon: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5", color: "from-emerald-500/15 to-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/35", icon_color: "text-emerald-400" },
        ].map(a => (
          <Link key={a.href} href={a.href}
            className={`flex items-center gap-3.5 px-5 py-4 rounded-2xl border bg-gradient-to-br transition-all ${a.color}`}>
            <div className={`w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0`}>
              <svg className={`w-4 h-4 ${a.icon_color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={a.icon} />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{a.label}</p>
              <p className="text-xs text-white/35 mt-0.5">{a.sub}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
    </div>
  );
}
