/**
 * Canonical navigation structure. Owned by the sidebar AND the top tab bar so
 * both stay in lock-step — change a label or icon here once and it propagates
 * everywhere. The sidebar shows section entry-points; the top tab bar shows
 * the sub-pages of whichever section is active.
 *
 * Active-section detection (used by both components) finds the tab whose
 * `href` is the longest prefix of the current pathname, then walks back to
 * its parent section. Dashboard has no sub-tabs and matches by exact path.
 */

export type NavBadge = "New" | "Beta";

export type NavTab = {
  href: string;
  label: string;
  badge?: NavBadge;
  /** Optional SVG path — used when a tab is rendered inline in the sidebar (e.g. Workspace pinned-bottom group). */
  icon?: string;
};

export type NavSection = {
  id: string;
  label: string;
  /** SVG path string used inside <path d="..."/> in the sidebar icon. */
  icon: string;
  /** The default route the sidebar links to (usually the first tab's href). */
  href: string;
  tabs: NavTab[];
  badge?: NavBadge;
  /** When true, the sidebar renders an <a target="_blank"> instead of a Next.js Link. */
  external?: boolean;
};

// Icons reuse the strokes from the previous flat sidebar — same shapes the team is used to.
const ICON_DASHBOARD = "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6";
const ICON_OUTREACH  = "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z";
const ICON_LEADGEN   = "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253M3 12a8.96 8.96 0 00.284 2.253";
const ICON_ACADEMY   = "M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5";
const ICON_WORKSPACE = "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z";

/** Primary sections shown in the top of the sidebar. */
export const SECTIONS: NavSection[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: ICON_DASHBOARD,
    href: "/dashboard",
    tabs: [],
  },
  {
    id: "outreach",
    label: "Outreach",
    icon: ICON_OUTREACH,
    href: "/campaigns",
    badge: "New",
    tabs: [
      { href: "/campaigns",  label: "Sequences" },
      { href: "/inboxes",    label: "Inboxes" },
      { href: "/leads",      label: "Leads Pool" },
      { href: "/crm",        label: "CRM" },
      { href: "/playbook",   label: "ICPs & Offers", badge: "New" },
    ],
  },
  {
    id: "leadgen",
    label: "Leadgen",
    icon: ICON_LEADGEN,
    href: "/discover",
    tabs: [
      { href: "/discover",              label: "Discover", badge: "New" },
      { href: "/discover/ai-search",   label: "AI Search", badge: "New" },
      { href: "/lead-campaigns",        label: "Lead Campaigns" },
      { href: "/lead-campaigns/verify", label: "Verify Email" },
      { href: "/lead-campaigns/enrich", label: "AI Enrichment" },
    ],
  },
  {
    id: "academy",
    label: "Academy",
    icon: ICON_ACADEMY,
    href: "/academy",
    badge: "New",
    external: true,
    tabs: [],
  },
];

// Icons for the Workspace sub-items — rendered as flat sidebar links at the bottom
// so users can find Settings / Support / Help directly without a click-to-expand.
const ICON_SETTINGS   = "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z";
const ICON_SUPPORT    = "M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z";
const ICON_HELP       = "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z";
const ICON_AFFILIATES = "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z";

/** Workspace section is pinned to the bottom of the sidebar, separate from SECTIONS. */
export const WORKSPACE_SECTION: NavSection = {
  id: "workspace",
  label: "Workspace",
  icon: ICON_WORKSPACE,
  href: "/settings",
  tabs: [
    { href: "/settings",   label: "Settings",   icon: ICON_SETTINGS   },
    { href: "/affiliates", label: "Affiliates", icon: ICON_AFFILIATES, badge: "New" },
    { href: "/support",    label: "Support",    icon: ICON_SUPPORT    },
    { href: "/help",       label: "Help",       icon: ICON_HELP       },
  ],
};

const ALL_SECTIONS: NavSection[] = [...SECTIONS, WORKSPACE_SECTION];

/**
 * Find the active section + tab for the given pathname.
 * Picks the tab whose href is the longest prefix match — so /campaigns/new
 * resolves to the Sequences tab under Outreach, not just /campaigns.
 */
export function findActiveSection(pathname: string): { section: NavSection | null; tab: NavTab | null } {
  let bestSection: NavSection | null = null;
  let bestTab: NavTab | null = null;
  let bestLen = -1;

  for (const section of ALL_SECTIONS) {
    // Section with no tabs (e.g. Dashboard) matches its own href
    if (section.tabs.length === 0) {
      if ((pathname === section.href || pathname.startsWith(section.href + "/")) && section.href.length > bestLen) {
        bestSection = section;
        bestTab     = null;
        bestLen     = section.href.length;
      }
      continue;
    }
    for (const tab of section.tabs) {
      const matches = pathname === tab.href || pathname.startsWith(tab.href + "/");
      if (matches && tab.href.length > bestLen) {
        bestSection = section;
        bestTab     = tab;
        bestLen     = tab.href.length;
      }
    }
  }

  return { section: bestSection, tab: bestTab };
}
