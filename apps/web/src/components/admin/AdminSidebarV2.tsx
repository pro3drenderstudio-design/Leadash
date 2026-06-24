"use client";

/**
 * v2-app admin sidebar — replaces the legacy AdminSidebar.
 *
 * Reuses the existing NAV data (mapping admin routes to modules) and the
 * module-visibility logic so a custom-preset admin sees exactly the same
 * groups they did before. Visual switch: v2-app palette, denser rows,
 * orange accent left-rail on active items, "ADMIN" tag pill instead of a
 * separate red brand colour.
 *
 * The /api/admin/notifications unread poll is preserved so the bell-badge
 * on the Notifications link still updates.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_MODULES, type AdminModuleKey } from "@/lib/admin/modules";
import "@/v2-app/v2-app.css";

const NAV = [
  {
    label: "Overview",
    items: [
      { href: "/admin",          label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
      { href: "/admin/activity", label: "Activity",  icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
    ],
  },
  {
    label: "Users & Billing",
    items: [
      { href: "/admin/users",       label: "Users",          icon: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" },
      { href: "/admin/workspaces",  label: "Workspaces",     icon: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" },
      { href: "/admin/financials",  label: "Financials",     icon: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" },
      { href: "/admin/plans",       label: "Plans",          icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" },
      { href: "/admin/beta",        label: "Beta programme", icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" },
    ],
  },
  {
    label: "Lead Gen",
    items: [
      { href: "/admin/campaigns", label: "Campaigns",     icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" },
      { href: "/admin/credits",   label: "Credit ledger", icon: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    ],
  },
  {
    label: "LeadPay",
    items: [
      { href: "/admin/leadpay",              label: "Overview",     icon: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" },
      { href: "/admin/leadpay/accounts",     label: "Accounts",     icon: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-4.5 0 2.625 2.625 0 014.5 0z" },
      { href: "/admin/leadpay/payouts",      label: "Payouts",      icon: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" },
      { href: "/admin/leadpay/transactions", label: "Transactions", icon: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" },
      { href: "/admin/leadpay/settings",     label: "Settings",     icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
    ],
  },
  {
    label: "Academy",
    items: [
      { href: "/admin/academy", label: "Academy", icon: "M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" },
    ],
  },
  {
    label: "Funnel",
    items: [
      { href: "/admin/funnel",      label: "Funnel settings", icon: "M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" },
      { href: "/admin/automations", label: "Automations",     icon: "M13 10V3L4 14h7v7l9-11h-7z" },
      { href: "/admin/crm",         label: "CRM inbox",       icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
    ],
  },
  {
    label: "Support",
    items: [
      { href: "/admin/support",       label: "Tickets",       icon: "M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" },
      { href: "/admin/broadcast",     label: "Broadcast",     icon: "M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" },
      { href: "/admin/notifications", label: "Notifications", icon: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { href: "/admin/domains",        label: "Domains",        icon: "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" },
      { href: "/admin/dedicated-ip",   label: "Dedicated IPs",  icon: "M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" },
      { href: "/admin/infrastructure", label: "Infrastructure", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" },
      { href: "/admin/postal-nodes",   label: "SMTP nodes",     icon: "M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" },
      { href: "/admin/system",         label: "System",         icon: "M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z" },
    ],
  },
  {
    label: "Config",
    items: [
      { href: "/admin/team",     label: "Team",     icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" },
      { href: "/admin/settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
    ],
  },
];

interface Props {
  adminEmail:   string;
  adminRole:    string;
  adminModules: AdminModuleKey[];
}

// Group label → required module key.
const GROUP_MODULE_MAP: Record<string, AdminModuleKey> = (() => {
  const out: Record<string, AdminModuleKey> = {};
  for (const m of ADMIN_MODULES) {
    for (const group of m.sidebarGroups) out[group] = m.key;
  }
  return out;
})();

export default function AdminSidebarV2({ adminEmail, adminRole, adminModules }: Props) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const allowed = useMemo(() => new Set(adminModules), [adminModules]);
  const visibleNav = useMemo(
    () => NAV.filter(group => {
      const requiredModule = GROUP_MODULE_MAP[group.label];
      return !requiredModule || allowed.has(requiredModule);
    }),
    [allowed],
  );

  useEffect(() => {
    async function fetchUnread() {
      try {
        const res = await fetch("/api/admin/notifications?status=active&limit=1");
        if (res.ok) {
          const d = await res.json() as { unread?: number };
          setUnread(d.unread ?? 0);
        }
      } catch { /* non-fatal */ }
    }
    void fetchUnread();
    const t = setInterval(fetchUnread, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { setIsOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <>
      {/* Mobile top bar — `flex` is a Tailwind class instead of an inline
          `display: flex` so `lg:hidden` actually wins on desktop. The inline
          display previously overrode the responsive utility and the bar
          showed everywhere, burying page headers underneath. */}
      <div
        className="v2-app fixed top-0 left-0 right-0 lg:hidden flex items-center"
        style={{
          height: 48,
          zIndex: 30,
          padding: "0 16px",
          gap: 12,
          background: "var(--app-bg-sunken)",
          borderBottom: "1px solid var(--app-border)",
        }}
      >
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open menu"
          style={{
            width: 32, height: 32, borderRadius: 6,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none", cursor: "pointer",
            color: "var(--app-text-quiet)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_Icon_Colored.svg" alt="" width={18} height={18} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)", letterSpacing: "-0.02em" }}>Leadash</span>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.16em", color: "var(--app-danger)", textTransform: "uppercase" }}>Admin</span>
        </Link>
      </div>

      {/* Backdrop */}
      <div
        onClick={() => setIsOpen(false)}
        aria-hidden
        className="lg:hidden"
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)",
          zIndex: 40,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 200ms ease",
        }}
      />

      {/* Sidebar */}
      <aside
        className="v2-app"
        data-open={isOpen ? "true" : "false"}
        style={{
          position: "fixed",
          insetBlock: 0,
          left: 0,
          width: "var(--app-sidebar-w)",
          zIndex: 50,
          background: "var(--app-bg-sunken)",
          borderRight: "1px solid var(--app-border)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Brand */}
        <div
          className="app-sidebar-brand"
          style={{ justifyContent: "space-between" }}
        >
          <Link href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Logo_Icon_Colored.svg" alt="" width={20} height={20} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text)", letterSpacing: "-0.015em" }}>Leadash</span>
              <span
                style={{
                  fontSize: 9,
                  padding: "2px 5px",
                  borderRadius: 3,
                  background: "var(--app-danger-soft)",
                  border: "1px solid rgba(248,113,113,0.30)",
                  color: "var(--app-danger)",
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                Admin
              </span>
            </span>
          </Link>
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Close menu"
            className="lg:hidden"
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--app-text-quiet)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search trigger — opens the global ⌘K palette */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("app:open-command-palette"))}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "10px 12px 4px",
            padding: "7px 10px",
            background: "var(--app-surface)",
            border: "1px solid var(--app-border-strong)",
            borderRadius: "var(--app-radius-sm)",
            color: "var(--app-text-quiet)",
            fontSize: 12,
            cursor: "pointer",
            transition: "border-color var(--app-dur) var(--app-ease), color var(--app-dur) var(--app-ease)",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--app-text-quiet)"; e.currentTarget.style.color = "var(--app-text)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--app-border-strong)"; e.currentTarget.style.color = "var(--app-text-quiet)"; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span style={{ flex: 1, textAlign: "left" }}>Search</span>
          <span
            style={{
              fontSize: 10,
              padding: "1px 5px",
              borderRadius: 3,
              background: "var(--app-bg-elevated)",
              border: "1px solid var(--app-border-strong)",
              color: "var(--app-text-muted)",
              letterSpacing: "0.04em",
              fontWeight: 500,
            }}
          >
            ⌘K
          </span>
        </button>

        {/* Nav */}
        <nav className="app-sidebar-nav">
          {visibleNav.map(group => (
            <div key={group.label}>
              <p className="app-sidebar-section-label" style={{ paddingTop: 12, paddingBottom: 6 }}>
                {group.label}
              </p>
              {group.items.map(item => {
                const active = pathname === item.href ||
                  (item.href !== "/admin" && pathname.startsWith(item.href + "/"));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="app-sidebar-link"
                    data-active={active ? "true" : "false"}
                  >
                    <svg
                      width="15" height="15" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth={1.5}
                      className="app-sidebar-link-icon"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                    <span>{item.label}</span>
                    {item.href === "/admin/notifications" && unread > 0 && (
                      <span
                        style={{
                          marginLeft: "auto",
                          fontSize: 9,
                          padding: "1px 5px",
                          borderRadius: 999,
                          background: "var(--app-danger)",
                          color: "#FFFFFF",
                          fontWeight: 600,
                          minWidth: 18,
                          textAlign: "center",
                        }}
                      >
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom: user identity + back-to-app + sign out */}
        <div className="app-sidebar-bottom">
          <div style={{ padding: "6px 10px 8px" }}>
            <p style={{ fontSize: 12, color: "var(--app-text-muted)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {adminEmail}
            </p>
            <p style={{ fontSize: 10, color: "var(--app-danger)", fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", marginTop: 2 }}>
              {adminRole.replace("_", " ")}
            </p>
          </div>
          <Link href="/dashboard" className="app-sidebar-link">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
            <span>Back to app</span>
          </Link>
          <button
            onClick={signOut}
            className="app-sidebar-link"
            style={{
              width: "100%", textAlign: "left",
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 13,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Desktop spacer — the aside has inline `position: fixed` which beats
          the CSS sticky override, so the aside is out of flow on desktop.
          This spacer reserves the 236px of flex width that the fixed aside
          visually occupies; without it the main column slides under the
          sidebar. */}
      <div
        aria-hidden
        className="hidden lg:block v2-app"
        style={{ width: "var(--app-sidebar-w)", flexShrink: 0 }}
      />

      <style>{`
        @media (max-width: 1023px) {
          aside.v2-app[data-open="false"] {
            transform: translateX(-100%);
            transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
          }
          aside.v2-app[data-open="true"] {
            transform: translateX(0);
            transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
          }
        }
        @media (min-width: 1024px) {
          aside.v2-app { position: sticky; top: 0; height: 100vh; }
        }
      `}</style>
    </>
  );
}
