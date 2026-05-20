"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { wsGet } from "@/lib/workspace/client";
import type { LeadPayAccount, LeadPayDashboardStats, LeadPayInvoice, LeadPayTransaction } from "@/types/leadpay";

// ── helpers ──────────────────────────────────────────────────────────────────
function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(cents / 100);
}
function fmtNgn(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(kobo / 100);
}
function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

const TX_ICONS: Record<string, string> = {
  invoice_payment: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z",
  payout:          "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
  card_spend:      "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
  card_funding:    "M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z",
  fee:             "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  refund:          "M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3",
  adjustment:      "M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75",
};
const TX_COLORS: Record<string, string> = {
  invoice_payment: "text-emerald-400 bg-emerald-500/10",
  payout:          "text-blue-400 bg-blue-500/10",
  card_spend:      "text-orange-400 bg-orange-500/10",
  card_funding:    "text-white/40 bg-white/5",
  fee:             "text-white/30 bg-white/5",
  refund:          "text-violet-400 bg-violet-500/10",
  adjustment:      "text-amber-400 bg-amber-500/10",
};

const INV_STATUS: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Draft",    cls: "bg-white/8 text-white/40" },
  sent:      { label: "Sent",     cls: "bg-blue-500/15 text-blue-400" },
  viewed:    { label: "Viewed",   cls: "bg-violet-500/15 text-violet-400" },
  paid:      { label: "Paid",     cls: "bg-emerald-500/15 text-emerald-400" },
  overdue:   { label: "Overdue",  cls: "bg-red-500/15 text-red-400" },
  cancelled: { label: "Cancelled",cls: "bg-white/8 text-white/30" },
};

// ── KYC banner ────────────────────────────────────────────────────────────────
function KycBanner({ status }: { status: string }) {
  if (status === "verified") return null;
  const map: Record<string, { msg: string; cls: string; icon: string }> = {
    unverified:     { msg: "Complete identity verification to start receiving payments.", cls: "border-amber-500/30 bg-amber-500/8 text-amber-300", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" },
    pending:        { msg: "Your identity verification is under review. Usually takes 24 hours.", cls: "border-blue-500/30 bg-blue-500/8 text-blue-300", icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
    needs_more_info:{ msg: "More information is needed to verify your identity.", cls: "border-orange-500/30 bg-orange-500/8 text-orange-300", icon: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" },
    rejected:       { msg: "Identity verification was rejected. Contact support for assistance.", cls: "border-red-500/30 bg-red-500/8 text-red-300", icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" },
  };
  const { msg, cls, icon } = map[status] ?? map.unverified;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border mb-6 ${cls}`}>
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      <p className="text-sm flex-1">{msg}</p>
      {status === "unverified" && (
        <Link href="/leadpay/onboarding" className="text-xs font-semibold underline underline-offset-2 hover:no-underline">
          Verify now
        </Link>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
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
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-4">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-white/4 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  // ── Onboarding gate ────────────────────────────────────────────────────────
  if (noAccount || !account) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">Get paid in USD. Receive in Naira.</h1>
        <p className="text-white/50 text-sm mb-2">Invoice your foreign clients, collect payments securely, and withdraw straight to your Nigerian bank account.</p>
        <div className="flex items-center justify-center gap-8 my-8 text-sm text-white/40">
          {["Invoice Clients", "Collect USD", "Receive NGN"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <svg className="w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>}
              <span>{s}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => router.push("/leadpay/onboarding")}
          className="px-6 py-3 bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-xl transition-colors"
        >
          Set up your account
        </button>
      </div>
    );
  }

  const s = stats!;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">LeadPay</h1>
          <p className="text-white/40 text-sm mt-0.5">Payments dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/leadpay/payouts" className="px-3 py-1.5 text-sm border border-white/10 text-white/60 hover:text-white hover:border-white/20 rounded-lg transition-colors">
            Withdraw
          </Link>
          <Link href="/leadpay/invoices?new=1" className="px-3 py-1.5 text-sm bg-orange-500 hover:bg-orange-400 text-white font-medium rounded-lg transition-colors">
            + New Invoice
          </Link>
        </div>
      </div>

      <KycBanner status={account.kyc_status} />

      {/* Balance card */}
      <div className="bg-gradient-to-br from-white/8 to-white/4 border border-white/10 rounded-2xl p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">USD Balance</p>
            <p className="text-2xl font-bold text-white tabular-nums">{fmt(s.usd_balance_cents)}</p>
            {s.usd_pending_cents > 0 && (
              <p className="text-xs text-amber-400/70 mt-0.5">{fmt(s.usd_pending_cents)} pending</p>
            )}
          </div>
          <div>
            <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Received MTD</p>
            <p className="text-2xl font-bold text-emerald-400 tabular-nums">{fmt(s.received_mtd_cents)}</p>
          </div>
          <div>
            <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Paid Out MTD</p>
            <p className="text-2xl font-bold text-white/70 tabular-nums">{fmt(s.paid_out_mtd_cents)}</p>
          </div>
          <div>
            <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Invoices Sent MTD</p>
            <p className="text-2xl font-bold text-white tabular-nums">{s.invoices_sent_mtd}</p>
            {s.avg_payment_days != null && (
              <p className="text-xs text-white/30 mt-0.5">avg {s.avg_payment_days}d to pay</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <div className="lg:col-span-2 bg-white/4 border border-white/8 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
            <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
            <Link href="/leadpay/transactions" className="text-xs text-white/40 hover:text-white/70 transition-colors">View all</Link>
          </div>
          {s.recent_transactions.length === 0 ? (
            <div className="px-5 py-10 text-center text-white/30 text-sm">No transactions yet</div>
          ) : (
            <div className="divide-y divide-white/5">
              {s.recent_transactions.map(tx => {
                const isCredit = (tx.usd_amount_cents ?? 0) > 0;
                const iconPath = TX_ICONS[tx.type] ?? TX_ICONS.adjustment;
                const iconColor = TX_COLORS[tx.type] ?? TX_COLORS.adjustment;
                return (
                  <div key={tx.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColor}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate">{tx.description}</p>
                      <p className="text-xs text-white/30 mt-0.5">{timeAgo(tx.created_at)}</p>
                    </div>
                    {tx.usd_amount_cents != null && (
                      <span className={`text-sm font-semibold tabular-nums ${isCredit ? "text-emerald-400" : "text-white/50"}`}>
                        {isCredit ? "+" : ""}{fmt(Math.abs(tx.usd_amount_cents))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Unpaid invoices */}
        <div className="bg-white/4 border border-white/8 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
            <h2 className="text-sm font-semibold text-white">Unpaid Invoices</h2>
            <Link href="/leadpay/invoices" className="text-xs text-white/40 hover:text-white/70 transition-colors">All invoices</Link>
          </div>
          {s.unpaid_invoices.length === 0 ? (
            <div className="px-5 py-10 text-center text-white/30 text-sm">All invoices paid</div>
          ) : (
            <div className="divide-y divide-white/5">
              {s.unpaid_invoices.map((inv: LeadPayInvoice) => {
                const st = INV_STATUS[inv.status] ?? INV_STATUS.sent;
                const isOverdue = inv.status === "overdue";
                return (
                  <Link key={inv.id} href={`/leadpay/invoices/${inv.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/3 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate">{inv.client_name ?? inv.client_email ?? "Unknown client"}</p>
                      <p className="text-xs text-white/30 mt-0.5">{inv.invoice_number}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-semibold tabular-nums ${isOverdue ? "text-red-400" : "text-white/70"}`}>
                        {fmt(inv.total_cents)}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${st.cls}`}>{st.label}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <div className="px-5 py-3 border-t border-white/8">
            <Link href="/leadpay/invoices?new=1"
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-white/40 hover:text-white/70 border border-white/8 hover:border-white/15 rounded-lg transition-all">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Invoice
            </Link>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        {[
          { href: "/leadpay/invoices?new=1", label: "Create Invoice",    icon: "M12 4.5v15m7.5-7.5h-15", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
          { href: "/leadpay/clients?new=1",  label: "Add Client",        icon: "M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
          { href: "/leadpay/payouts",        label: "Withdraw Funds",    icon: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
          { href: "/leadpay/cards?new=1",    label: "New Virtual Card",  icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z", color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
        ].map(a => (
          <Link key={a.href} href={a.href}
            className={`flex items-center gap-2.5 px-4 py-3.5 rounded-xl border transition-all hover:opacity-80 ${a.color}`}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={a.icon} />
            </svg>
            <span className="text-sm font-medium">{a.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
