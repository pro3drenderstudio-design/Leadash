/**
 * Admin module catalog — SINGLE source of truth for both:
 *   - The AdminSidebar (which nav items to render for each module)
 *   - The team page's preset editor (which module checkboxes exist)
 *   - The API helpers (auth.ts) that authorize requests
 *
 * Add a new admin section = add ONE module entry here (with its nav items).
 * The sidebar renders from `items`; the team page renders module checkboxes
 * from the top-level list. Both surfaces stay in lock-step with zero drift.
 *
 * "overview" is always-on — every admin sees the landing page.
 * "team_config" gates /admin/team + /admin/settings; granting it to a
 * non-super_admin lets them manage admins AND custom presets.
 */

import type { IconSvgElement } from "@hugeicons/react";
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
  GitBranchIcon,
  Login03Icon,
  Sale01Icon,
  Link01Icon,
} from "@/v2-app/icons";

export type AdminModuleKey =
  | "overview"
  | "users_billing"
  | "leadgen"
  | "leadpay"
  | "academy"
  | "funnel"
  | "offers"
  | "affiliates"
  | "support"
  | "outreach"
  | "growth"
  | "infrastructure"
  | "team_config";

export type AdminNavItem = {
  href:  string;
  label: string;
  icon:  IconSvgElement;
};

export type AdminModule = {
  key:                AdminModuleKey;
  label:              string;
  description:        string;
  /** Sidebar group header label — shown above the item list. */
  sidebarGroupLabel:  string;
  /** Whether this module is always granted (Overview is). */
  always?:            boolean;
  /** Nav items rendered under this group in the sidebar. */
  items:              AdminNavItem[];
};

export const ADMIN_MODULES: AdminModule[] = [
  {
    key:               "overview",
    label:             "Overview",
    description:       "Dashboard and platform activity log.",
    sidebarGroupLabel: "Overview",
    always:            true,
    items: [
      { href: "/admin",          label: "Dashboard", icon: Dashboard01Icon },
      { href: "/admin/activity", label: "Activity",  icon: Activity01Icon },
    ],
  },
  {
    key:               "users_billing",
    label:             "Users & Billing",
    description:       "Users, workspaces, financials, plans, and the beta programme.",
    sidebarGroupLabel: "Users & Billing",
    items: [
      { href: "/admin/users",       label: "Users",          icon: UserGroupIcon },
      { href: "/admin/workspaces",  label: "Workspaces",     icon: Building01Icon },
      { href: "/admin/financials",  label: "Financials",     icon: ChartBarLineIcon },
      { href: "/admin/plans",       label: "Plans",          icon: Briefcase01Icon },
      { href: "/admin/beta",        label: "Beta programme", icon: Beta01Icon },
    ],
  },
  {
    key:               "leadgen",
    label:             "Lead Gen",
    description:       "Lead campaigns and the credit ledger.",
    sidebarGroupLabel: "Lead Gen",
    items: [
      { href: "/admin/campaigns", label: "Campaigns",     icon: Mail01Icon },
      { href: "/admin/credits",   label: "Credit ledger", icon: Coins01Icon },
    ],
  },
  {
    key:               "leadpay",
    label:             "LeadPay",
    description:       "LeadPay overview, accounts, payouts, transactions, settings.",
    sidebarGroupLabel: "LeadPay",
    items: [
      { href: "/admin/leadpay",              label: "Overview",     icon: Wallet01Icon },
      { href: "/admin/leadpay/accounts",     label: "Accounts",     icon: UserGroupIcon },
      { href: "/admin/leadpay/payouts",      label: "Payouts",      icon: Login03Icon },
      { href: "/admin/leadpay/transactions", label: "Transactions", icon: AnalyticsUpIcon },
      { href: "/admin/leadpay/settings",     label: "Settings",     icon: Settings02Icon },
    ],
  },
  {
    key:               "academy",
    label:             "Academy",
    description:       "Academy course and content management.",
    sidebarGroupLabel: "Academy",
    items: [
      { href: "/admin/academy",           label: "Academy",           icon: GraduationScrollIcon },
      { href: "/admin/challenge-signups", label: "Challenge Signups", icon: UserGroupIcon },
    ],
  },
  {
    key:               "funnel",
    label:             "Funnel",
    description:       "Funnel pages, automation builder, and CRM inbox.",
    sidebarGroupLabel: "Funnel",
    items: [
      { href: "/admin/funnels",      label: "Funnels",         icon: GitBranchIcon },
      { href: "/admin/funnel",       label: "Funnel settings", icon: AnalyticsUpIcon },
      { href: "/admin/automations",  label: "Automations",     icon: WorkflowSquare01Icon },
      { href: "/admin/crm",          label: "CRM inbox",       icon: CustomerService01Icon },
      { href: "/admin/crm-settings", label: "CRM settings",    icon: Configuration01Icon },
    ],
  },
  {
    key:               "offers",
    label:             "Offers",
    description:       "Sellable offer bundles, checkout pages, bumps/upsells, and discount codes.",
    sidebarGroupLabel: "Monetization",
    items: [
      { href: "/admin/offers", label: "Offers", icon: Sale01Icon },
    ],
  },
  {
    key:               "affiliates",
    label:             "Affiliates",
    description:       "Affiliate program management, payouts, and referral commissions.",
    sidebarGroupLabel: "Affiliates",
    items: [
      { href: "/admin/affiliates", label: "Affiliates", icon: UserGroupIcon },
    ],
  },
  {
    key:               "support",
    label:             "Support",
    description:       "Support tickets, broadcast emails, and notification settings.",
    sidebarGroupLabel: "Support",
    items: [
      { href: "/admin/support",       label: "Tickets",       icon: HeadsetIcon },
      { href: "/admin/broadcast",     label: "Broadcast",     icon: Megaphone01Icon },
      { href: "/admin/notifications", label: "Notifications", icon: Notification01Icon },
    ],
  },
  {
    key:               "outreach",
    label:             "Outreach",
    description:       "Cross-workspace view of user inboxes, campaigns, warmup pool, and failed sends.",
    sidebarGroupLabel: "Outreach",
    items: [
      { href: "/admin/outreach/inboxes",   label: "Inboxes",      icon: Mail01Icon },
      { href: "/admin/outreach/campaigns", label: "Campaigns",    icon: WorkflowSquare01Icon },
      { href: "/admin/outreach/warmup",    label: "Warmup Pool",  icon: Activity01Icon },
      { href: "/admin/outreach/queue",     label: "Failed Sends", icon: ChartBarLineIcon },
    ],
  },
  {
    key:               "growth",
    label:             "Growth",
    description:       "Link tracker and growth analytics.",
    sidebarGroupLabel: "Growth",
    items: [
      { href: "/admin/links", label: "Link Tracker", icon: Link01Icon },
    ],
  },
  {
    key:               "infrastructure",
    label:             "Infrastructure",
    description:       "Sending domains, dedicated IPs, SMTP nodes, system health.",
    sidebarGroupLabel: "Infrastructure",
    items: [
      { href: "/admin/domains",        label: "Domains",        icon: Plug01Icon },
      { href: "/admin/dedicated-ip",   label: "Dedicated IPs",  icon: Database01Icon },
      { href: "/admin/infrastructure", label: "Infrastructure", icon: ServerStack01Icon },
      { href: "/admin/postal-nodes",   label: "SMTP nodes",     icon: ServerStack01Icon },
      { href: "/admin/system",         label: "System",         icon: Configuration01Icon },
    ],
  },
  {
    key:               "team_config",
    label:             "Team & Config",
    description:       "Manage the admin team, custom role presets, and platform settings.",
    sidebarGroupLabel: "Config",
    items: [
      { href: "/admin/team",     label: "Team",     icon: ShieldUserIcon },
      { href: "/admin/settings", label: "Settings", icon: Settings02Icon },
    ],
  },
];

export const ALL_MODULE_KEYS: AdminModuleKey[] = ADMIN_MODULES.map(m => m.key);

const ALWAYS_ON: AdminModuleKey[] = ADMIN_MODULES.filter(m => m.always).map(m => m.key);

/** Modules a member may not toggle off when editing a preset (e.g. Overview). */
export function isAlwaysOnModule(key: AdminModuleKey): boolean {
  return ALWAYS_ON.includes(key);
}

/**
 * Built-in roles → module sets. These are deliberately hardcoded (not stored in the
 * presets table) so they can't be deleted or modified. A "custom" role pulls its
 * modules from the preset / per-admin override instead.
 */
export const BUILTIN_ROLES = ["super_admin", "support", "billing", "readonly", "custom"] as const;
export type AdminRole = typeof BUILTIN_ROLES[number];

export const BUILTIN_ROLE_MODULES: Record<Exclude<AdminRole, "custom">, AdminModuleKey[]> = {
  super_admin: [...ALL_MODULE_KEYS],
  // Support staff: deals with tickets, can look up users + workspaces, but no
  // billing/financials access and no infrastructure.
  support:     ["overview", "users_billing", "support", "outreach"],
  // Billing/finance: financial side of the platform but no support tickets, no
  // infrastructure, no admin team management.
  billing:     ["overview", "users_billing", "leadpay"],
  // Read-only: visibility into everything except the team panel. New modules
  // are opted-in here automatically at build time.
  readonly:    ALL_MODULE_KEYS.filter(k => k !== "team_config"),
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  support:     "Support",
  billing:     "Billing",
  readonly:    "Read-only",
  custom:      "Custom",
};

/**
 * Resolve an admin's effective module set:
 *  - super_admin: everything
 *  - other built-in roles: their predefined set
 *  - custom: the per-admin permissions list (or the preset's modules, snapshotted
 *    onto the admin row at assign time — but we use live preset lookup, so the
 *    caller should pass the freshest list)
 * Always includes the always-on modules (Overview) regardless of input.
 */
export function resolveModules(role: string, customModules: string[] | null | undefined): Set<AdminModuleKey> {
  const set = new Set<AdminModuleKey>(ALWAYS_ON);
  if (role === "custom") {
    for (const m of customModules ?? []) {
      if ((ALL_MODULE_KEYS as string[]).includes(m)) set.add(m as AdminModuleKey);
    }
    return set;
  }
  const builtin = BUILTIN_ROLE_MODULES[role as Exclude<AdminRole, "custom">];
  if (builtin) for (const m of builtin) set.add(m);
  return set;
}

/** True if the admin can access the named module. */
export function hasModule(role: string, customModules: string[] | null | undefined, moduleKey: AdminModuleKey): boolean {
  return resolveModules(role, customModules).has(moduleKey);
}
