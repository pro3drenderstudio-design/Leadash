"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrency } from "@/lib/currency";

const NAV = [
  {
    label: "Outreach",
    items: [
      { href: "/dashboard",         label: "Dashboard",  icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
      { href: "/campaigns",         label: "Sequences",  icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
      { href: "/inboxes",           label: "Inboxes",    icon: "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" },
      { href: "/leads",             label: "Leads Pool", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
      { href: "/crm",               label: "CRM",        icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
      { href: "/warmup",            label: "Warmup",     icon: "M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" },
      { href: "/templates",         label: "Templates",  icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
    ],
  },
  {
    label: "Lead Gen",
    items: [
      { href: "/lead-campaigns",        label: "Lead Campaigns", icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" },
      { href: "/lead-campaigns/verify", label: "Verify Email",   icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
      { href: "/lead-campaigns/enrich", label: "AI Enrichment",  icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
      { href: "/support",  label: "Support",  icon: "M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" },
      { href: "/help",     label: "Help",     icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" },
    ],
  },
];

interface Props {
  workspaceName: string;
  plan: string;
}

export default function Sidebar({ workspaceName, plan }: Props) {
  const pathname = usePathname();
  const { currency, setCurrency, detected } = useCurrency();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <aside
      className="w-56 flex-shrink-0 flex flex-col h-screen sticky top-0"
      style={{ background: "var(--sidebar-bg)", borderRight: "1px solid var(--sidebar-border)" }}
    >
      {/* Logo */}
      <div
        className="px-4 py-4 flex items-center"
        style={{ borderBottom: "1px solid var(--sidebar-border)", minHeight: 56 }}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="flex-shrink-0 w-8 h-8 relative">
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
              <defs>
                <linearGradient id="sb" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1d4ed8"/>
                  <stop offset="100%" stopColor="#6d28d9"/>
                </linearGradient>
              </defs>
              <rect width="40" height="40" rx="10" fill="url(#sb)"/>
              <path d="M22 5L10 22H19L18 35L30 18H21L22 5Z" fill="white"/>
            </svg>
          </div>
          <span
            className="text-[17px] font-bold tracking-tight text-slate-800 dark:text-white/90 group-hover:text-slate-900 dark:group-hover:text-white transition-colors select-none"
            style={{ letterSpacing: "-0.02em" }}
          >
            Leadash
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {NAV.map(group => (
          <div key={group.label}>
            <p className="px-2 mb-1.5 text-[9px] font-bold text-slate-400 dark:text-white/20 uppercase tracking-[0.15em]">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const allHrefs = NAV.flatMap(g => g.items.map(i => i.href));
                const active = pathname === item.href || (
                  item.href !== "/dashboard" &&
                  pathname.startsWith(item.href + "/") &&
                  !allHrefs.some(h => h !== item.href && pathname.startsWith(h))
                );
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all ${
                      active
                        ? "bg-blue-50 dark:bg-white/10 text-slate-900 dark:text-white font-medium"
                        : "text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white/80 hover:bg-slate-100 dark:hover:bg-white/5"
                    }`}
                  >
                    <svg
                      className={`w-4 h-4 flex-shrink-0 ${active ? "text-blue-500 dark:text-blue-400" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                    {item.label}
                    {active && <span className="ml-auto w-1 h-4 rounded-full bg-blue-400/60" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div
        className="px-2 py-3 space-y-1"
        style={{ borderTop: "1px solid var(--sidebar-border)" }}
      >
        {/* Currency toggle */}
        {detected && (
          <div className="px-2.5 py-2 flex items-center justify-between">
            <span className="text-slate-400 dark:text-white/30 text-xs">Currency</span>
            <div className="flex items-center gap-0.5 bg-slate-200/70 dark:bg-white/6 rounded-lg p-0.5">
              <button
                onClick={() => setCurrency("USD")}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  currency === "USD"
                    ? "bg-blue-600 text-white shadow"
                    : "text-slate-500 dark:text-white/30 hover:text-slate-700 dark:hover:text-white/60"
                }`}
              >
                USD
              </button>
              <button
                onClick={() => setCurrency("NGN")}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  currency === "NGN"
                    ? "bg-green-600 text-white shadow"
                    : "text-slate-500 dark:text-white/30 hover:text-slate-700 dark:hover:text-white/60"
                }`}
              >
                NGN
              </button>
            </div>
          </div>
        )}

        <button
          onClick={signOut}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-slate-400 dark:text-white/30 hover:text-slate-700 dark:hover:text-white/70 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}
