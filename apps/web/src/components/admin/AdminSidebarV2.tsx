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
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_MODULES, type AdminModuleKey } from "@/lib/admin/modules";
import {
  Dashboard01Icon,
  Activity01Icon,
  UserGroupIcon,
  Building01Icon,
  ChartBarLineIcon,
  Briefcase01Icon,
  Beta01Icon,
  Mail01Icon,
  Coins01Icon,
  Wallet01Icon,
  GraduationScrollIcon,
  Settings02Icon,
  HeadsetIcon,
  Megaphone01Icon,
  Notification01Icon,
  ShieldUserIcon,
  ServerStack01Icon,
  Configuration01Icon,
  Database01Icon,
  Plug01Icon,
  WorkflowSquare01Icon,
  AnalyticsUpIcon,
  CustomerService01Icon,
  Configuration01Icon,
  GitBranchIcon,
  Login03Icon,
  Logout03Icon,
} from "@/v2-app/icons";
import "@/v2-app/v2-app.css";

type NavItemDef = { href: string; label: string; icon: IconSvgElement };
type NavGroupDef = { label: string; items: NavItemDef[] };

const NAV: NavGroupDef[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin",          label: "Dashboard", icon: Dashboard01Icon },
      { href: "/admin/activity", label: "Activity",  icon: Activity01Icon },
    ],
  },
  {
    label: "Users & Billing",
    items: [
      { href: "/admin/users",       label: "Users",          icon: UserGroupIcon },
      { href: "/admin/workspaces",  label: "Workspaces",     icon: Building01Icon },
      { href: "/admin/financials",  label: "Financials",     icon: ChartBarLineIcon },
      { href: "/admin/plans",       label: "Plans",          icon: Briefcase01Icon },
      { href: "/admin/beta",        label: "Beta programme", icon: Beta01Icon },
    ],
  },
  {
    label: "Lead Gen",
    items: [
      { href: "/admin/campaigns", label: "Campaigns",     icon: Mail01Icon },
      { href: "/admin/credits",   label: "Credit ledger", icon: Coins01Icon },
    ],
  },
  {
    label: "LeadPay",
    items: [
      { href: "/admin/leadpay",              label: "Overview",     icon: Wallet01Icon },
      { href: "/admin/leadpay/accounts",     label: "Accounts",     icon: UserGroupIcon },
      { href: "/admin/leadpay/payouts",      label: "Payouts",      icon: Login03Icon },
      { href: "/admin/leadpay/transactions", label: "Transactions", icon: AnalyticsUpIcon },
      { href: "/admin/leadpay/settings",     label: "Settings",     icon: Settings02Icon },
    ],
  },
  {
    label: "Academy",
    items: [
      { href: "/admin/academy", label: "Academy", icon: GraduationScrollIcon },
    ],
  },
  {
    label: "Funnel",
    items: [
      { href: "/admin/funnels",      label: "Funnels",         icon: GitBranchIcon },
      { href: "/admin/funnel",       label: "Funnel settings", icon: AnalyticsUpIcon },
      { href: "/admin/automations",  label: "Automations",     icon: WorkflowSquare01Icon },
      { href: "/admin/crm",          label: "CRM inbox",       icon: CustomerService01Icon },
      { href: "/admin/crm-settings", label: "CRM settings",    icon: Configuration01Icon },
    ],
  },
  {
    label: "Support",
    items: [
      { href: "/admin/support",       label: "Tickets",       icon: HeadsetIcon },
      { href: "/admin/broadcast",     label: "Broadcast",     icon: Megaphone01Icon },
      { href: "/admin/notifications", label: "Notifications", icon: Notification01Icon },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { href: "/admin/domains",        label: "Domains",        icon: Plug01Icon },
      { href: "/admin/dedicated-ip",   label: "Dedicated IPs",  icon: Database01Icon },
      { href: "/admin/infrastructure", label: "Infrastructure", icon: ServerStack01Icon },
      { href: "/admin/postal-nodes",   label: "SMTP nodes",     icon: ServerStack01Icon },
      { href: "/admin/system",         label: "System",         icon: Configuration01Icon },
    ],
  },
  {
    label: "Config",
    items: [
      { href: "/admin/team",     label: "Team",     icon: ShieldUserIcon },
      { href: "/admin/settings", label: "Settings", icon: Settings02Icon },
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
                    <HugeiconsIcon icon={item.icon} size={15} strokeWidth={1.5} className="app-sidebar-link-icon" />
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
            <HugeiconsIcon icon={Login03Icon} size={15} strokeWidth={1.5} />
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
            <HugeiconsIcon icon={Logout03Icon} size={15} strokeWidth={1.5} />
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
