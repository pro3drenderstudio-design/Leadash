/**
 * Admin module catalog — single source of truth used by:
 *  - The AdminSidebar to decide which groups to render for a given admin
 *  - The team page's preset editor to render module checkboxes
 *  - The API helpers (auth.ts) to authorize requests
 *
 * Keep this in lock-step with the sidebar groups in components/admin/AdminSidebar.tsx.
 * "Overview" is intentionally always-on — every admin can see the landing page.
 *
 * "team_config" gates the /admin/team and /admin/settings routes; granting it
 * to a non-super_admin lets them manage admins AND custom presets.
 */

export type AdminModuleKey =
  | "overview"
  | "users_billing"
  | "leadgen"
  | "leadpay"
  | "academy"
  | "funnel"
  | "support"
  | "infrastructure"
  | "team_config";

export type AdminModule = {
  key: AdminModuleKey;
  label: string;
  description: string;
  /** Sidebar group labels this module gates. The AdminSidebar matches by group label. */
  sidebarGroups: string[];
  /** Whether this module is always granted (Overview is). */
  always?: boolean;
};

export const ADMIN_MODULES: AdminModule[] = [
  {
    key:           "overview",
    label:         "Overview",
    description:   "Dashboard and platform activity log.",
    sidebarGroups: ["Overview"],
    always:        true,
  },
  {
    key:           "users_billing",
    label:         "Users & Billing",
    description:   "Users, workspaces, financials, plans, and the beta programme.",
    sidebarGroups: ["Users & Billing"],
  },
  {
    key:           "leadgen",
    label:         "Lead Gen",
    description:   "Lead campaigns and the credit ledger.",
    sidebarGroups: ["Lead Gen"],
  },
  {
    key:           "leadpay",
    label:         "LeadPay",
    description:   "LeadPay overview, accounts, payouts, transactions, settings.",
    sidebarGroups: ["LeadPay"],
  },
  {
    key:           "academy",
    label:         "Academy",
    description:   "Academy course and content management.",
    sidebarGroups: ["Academy"],
  },
  {
    key:           "funnel",
    label:         "Funnel",
    description:   "Course funnel settings, automation builder, and CRM inbox.",
    sidebarGroups: ["Funnel"],
  },
  {
    key:           "support",
    label:         "Support",
    description:   "Support tickets, broadcast emails, and notification settings.",
    sidebarGroups: ["Support"],
  },
  {
    key:           "infrastructure",
    label:         "Infrastructure",
    description:   "Sending domains, dedicated IPs, SMTP nodes, system health.",
    sidebarGroups: ["Infrastructure"],
  },
  {
    key:           "team_config",
    label:         "Team & Config",
    description:   "Manage the admin team, custom role presets, and platform settings.",
    sidebarGroups: ["Config"],
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
  support:     ["overview", "users_billing", "support"],
  // Billing/finance: financial side of the platform but no support tickets, no
  // infrastructure, no admin team management.
  billing:     ["overview", "users_billing", "leadpay"],
  // Read-only: visibility into everything except the team panel. (View-only at
  // the action level is still a future enhancement — for now this controls which
  // modules they can navigate into.)
  readonly:    ["overview", "users_billing", "leadgen", "leadpay", "academy", "funnel", "support", "infrastructure"],
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
