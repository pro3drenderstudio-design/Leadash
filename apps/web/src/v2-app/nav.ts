/**
 * v2-app navigation data — app and admin sidebars.
 *
 * Kept as pure data so both sidebars and (future) Cmd+K palette read from
 * the same source. Each section can have sub-tabs that render as a nested
 * group inside the sidebar when the section is active.
 */

import type { IconSvgElement } from "@hugeicons/react";
import {
  Dashboard01Icon,
  Mail01Icon,
  UserSearch01Icon,
  Wallet01Icon,
  GraduationScrollIcon,
  Settings02Icon,
  HelpCircleIcon,
  HeadsetIcon,
  Inbox01Icon,
  Bookmark01Icon,
  Note01Icon,
  Briefcase01Icon,
  ChartBarLineIcon,
  Coins01Icon,
  CustomerService01Icon,
  UserGroupIcon,
  Building01Icon,
  Database01Icon,
  Notification01Icon,
  ShieldUserIcon,
  Activity01Icon,
  ServerStack01Icon,
  Megaphone01Icon,
  AnalyticsUpIcon,
  Configuration01Icon,
  WorkflowSquare01Icon,
  Plug01Icon,
  Beta01Icon,
  SparklesIcon,
} from "./icons";

type IconRef = IconSvgElement;
export type AppBadge = "New" | "Beta";

export type NavItem = {
  href: string;
  label: string;
  icon: IconRef;
  badge?: AppBadge;
  children?: { href: string; label: string; badge?: AppBadge }[];
};

export type NavGroup = {
  label?: string;          // optional section header (e.g., "Workspace")
  items: NavItem[];
};

// ─── App nav ────────────────────────────────────────────────────────────────
export const APP_NAV: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Dashboard01Icon },
      {
        href: "/campaigns", label: "Outreach", icon: Mail01Icon, badge: "New",
        children: [
          { href: "/campaigns", label: "Sequences" },
          { href: "/inboxes",   label: "Inboxes" },
          { href: "/leads",     label: "Leads Pool" },
          { href: "/crm",       label: "CRM" },
        ],
      },
      {
        href: "/discover", label: "Leadgen", icon: UserSearch01Icon,
        children: [
          { href: "/discover",              label: "Discover",       badge: "New" },
          { href: "/discover/ai-search",    label: "AI Search",      badge: "New" },
          { href: "/lead-campaigns/verify", label: "Verify Email" },
          { href: "/lead-campaigns/enrich", label: "AI Enrichment" },
        ],
      },
      {
        href: "/leadpay", label: "Leadash Pay", icon: Wallet01Icon, badge: "New",
        children: [
          { href: "/leadpay",              label: "Overview" },
          { href: "/leadpay/invoices",     label: "Invoices" },
          { href: "/leadpay/clients",      label: "Clients" },
          { href: "/leadpay/payouts",      label: "Payouts" },
          { href: "/leadpay/transactions", label: "Transactions" },
        ],
      },
      { href: "/academy",  label: "Academy",  icon: GraduationScrollIcon, badge: "New" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/settings", label: "Settings", icon: Settings02Icon },
      { href: "/support",  label: "Support",  icon: HeadsetIcon },
      { href: "/help",     label: "Help",     icon: HelpCircleIcon },
    ],
  },
];

// ─── Admin nav ──────────────────────────────────────────────────────────────
export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin/dashboard",  label: "Dashboard",  icon: Dashboard01Icon },
      { href: "/admin/activity",   label: "Activity",   icon: Activity01Icon },
      { href: "/admin/financials", label: "Financials", icon: ChartBarLineIcon },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/admin/users",      label: "Users",       icon: UserGroupIcon },
      { href: "/admin/workspaces", label: "Workspaces",  icon: Building01Icon },
      { href: "/admin/crm",        label: "CRM",         icon: CustomerService01Icon },
      { href: "/admin/support",    label: "Support",     icon: HeadsetIcon },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: "/admin/plans",      label: "Plans",       icon: Briefcase01Icon },
      { href: "/admin/credits",    label: "Credits",     icon: Coins01Icon },
      { href: "/admin/leadpay",    label: "Leadash Pay", icon: Wallet01Icon },
      { href: "/admin/academy",    label: "Academy",     icon: GraduationScrollIcon },
    ],
  },
  {
    label: "Outreach ops",
    items: [
      { href: "/admin/campaigns",     label: "Campaigns",     icon: Mail01Icon },
      { href: "/admin/domains",       label: "Domains",       icon: Plug01Icon },
      { href: "/admin/postal-nodes",  label: "Postal nodes",  icon: ServerStack01Icon },
      { href: "/admin/dedicated-ip",  label: "Dedicated IP",  icon: Database01Icon },
      { href: "/admin/broadcast",     label: "Broadcast",     icon: Megaphone01Icon },
      { href: "/admin/notifications", label: "Notifications", icon: Notification01Icon },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/admin/funnel",      label: "Funnel",      icon: AnalyticsUpIcon },
      { href: "/admin/automations", label: "Automations", icon: WorkflowSquare01Icon },
      { href: "/admin/beta",        label: "Beta",        icon: Beta01Icon },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/team",           label: "Team",           icon: ShieldUserIcon },
      { href: "/admin/settings",       label: "Settings",       icon: Settings02Icon },
      { href: "/admin/system",         label: "System",         icon: Configuration01Icon },
      { href: "/admin/infrastructure", label: "Infrastructure", icon: ServerStack01Icon },
    ],
  },
];

// ─── Resolution helpers ────────────────────────────────────────────────────
// Given the current pathname, find the best-matching nav item (longest prefix
// match against any item or sub-tab). Returns the parent item so the sidebar
// can highlight the right section.
export function findActiveItem(pathname: string, groups: NavGroup[]) {
  let best: { item: NavItem; matchLen: number } | null = null;

  for (const g of groups) {
    for (const item of g.items) {
      // Check own href
      if (pathname === item.href || pathname.startsWith(item.href + "/")) {
        if (!best || item.href.length > best.matchLen) best = { item, matchLen: item.href.length };
      }
      // Check sub-tabs (more specific)
      for (const t of item.children ?? []) {
        if (pathname === t.href || pathname.startsWith(t.href + "/")) {
          if (!best || t.href.length > best.matchLen) best = { item, matchLen: t.href.length };
        }
      }
    }
  }
  return best?.item ?? null;
}

// Flatten everything for the Cmd+K palette later.
export function flattenNav(groups: NavGroup[]): { href: string; label: string; groupLabel?: string }[] {
  const out: { href: string; label: string; groupLabel?: string }[] = [];
  for (const g of groups) {
    for (const item of g.items) {
      out.push({ href: item.href, label: item.label, groupLabel: g.label });
      for (const t of item.children ?? []) {
        out.push({ href: t.href, label: `${item.label} → ${t.label}`, groupLabel: g.label });
      }
    }
  }
  return out;
}

export {
  // Re-exported so Sparkles-like icons are available without a separate import
  SparklesIcon,
};
