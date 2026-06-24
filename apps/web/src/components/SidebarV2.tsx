"use client";

/**
 * v2-app sidebar — drop-in replacement for the legacy Sidebar.
 *
 * Reuses the existing SECTIONS + WORKSPACE_SECTION nav data so the navigation
 * stays in lock-step with the top tab bar. What's different vs the old
 * Sidebar:
 *   - v2-app palette (deeper sunken background, accent left-rail on active)
 *   - Tighter type, denser rows, fewer hover gradients
 *   - Same Workspace pinned-bottom group and credits + sign out cluster
 *
 * Imports v2-app.css for tokens — safe to load multiple times.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSidebar } from "@/components/SidebarContext";
import { useCredits } from "@/components/CreditsProvider";
import {
  SECTIONS,
  WORKSPACE_SECTION,
  findActiveSection,
  type NavSection,
  type NavTab,
} from "@/lib/nav/sections";
import "@/v2-app/v2-app.css";

interface Props {
  workspaceName: string;
  plan: string;
}

export default function SidebarV2({ workspaceName, plan }: Props) {
  const pathname = usePathname();
  const { isOpen, close } = useSidebar();
  const { credits, monthlyCredits } = useCredits();
  const { section: activeSection } = findActiveSection(pathname);

  function SectionLink({ section }: { section: NavSection }) {
    const active = activeSection?.id === section.id;
    return (
      <Link
        href={section.href}
        onClick={close}
        className="app-sidebar-link"
        data-active={active ? "true" : "false"}
      >
        <svg
          width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={1.5}
          className="app-sidebar-link-icon"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={section.icon} />
        </svg>
        <span>{section.label}</span>
        {section.badge && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 9,
              padding: "1px 5px",
              borderRadius: 4,
              background: "var(--app-accent-soft)",
              border: "1px solid var(--app-accent-line)",
              color: "var(--app-accent)",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {section.badge}
          </span>
        )}
      </Link>
    );
  }

  function WorkspaceTabLink({ tab }: { tab: NavTab }) {
    const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
    return (
      <Link
        href={tab.href}
        onClick={close}
        className="app-sidebar-link"
        data-active={active ? "true" : "false"}
      >
        {tab.icon && (
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={1.5}
            className="app-sidebar-link-icon"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
          </svg>
        )}
        <span>{tab.label}</span>
      </Link>
    );
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={close}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(2px)",
          zIndex: 40,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 200ms ease",
        }}
        className="lg:hidden"
      />

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
          transform: isOpen ? "translateX(0)" : undefined,
        }}
      >
        {/* Brand */}
        <div
          className="app-sidebar-brand"
          style={{ justifyContent: "space-between" }}
        >
          <Link
            href="/dashboard"
            onClick={close}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Logo_Icon_Colored.svg" alt="" width={20} height={20} />
            <span
              className="app-sidebar-brand-name"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {workspaceName || "Leadash"}
              </span>
              {plan && (
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 4,
                    background: "var(--app-surface)",
                    color: "var(--app-text-quiet)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  {plan}
                </span>
              )}
            </span>
          </Link>
          {/* Close — mobile only */}
          <button
            onClick={close}
            aria-label="Close menu"
            className="lg:hidden"
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: "transparent", border: "none",
              color: "var(--app-text-quiet)", cursor: "pointer",
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

        {/* Primary nav */}
        <nav className="app-sidebar-nav">
          {SECTIONS.map(s => <SectionLink key={s.id} section={s} />)}
        </nav>

        {/* Workspace pinned bottom */}
        <div style={{ padding: 8, borderTop: "1px solid var(--app-border)" }}>
          <p className="app-sidebar-section-label" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {WORKSPACE_SECTION.label}
          </p>
          {WORKSPACE_SECTION.tabs.map(t => <WorkspaceTabLink key={t.href} tab={t} />)}
        </div>

        {/* Credits + sign out */}
        <div className="app-sidebar-bottom">
          <Link
            href="/lead-campaigns/credits"
            onClick={close}
            className="app-sidebar-link"
            style={{ flexDirection: "column", alignItems: "stretch", gap: 2 }}
          >
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Credits
              </span>
              <span style={{ fontSize: 12, color: "var(--app-text)", fontVariantNumeric: "tabular-nums" }}>
                {credits.toLocaleString()}
              </span>
            </span>
            {(monthlyCredits > 0 || credits > 0) && (
              <span style={{ fontSize: 10, color: "var(--app-text-quiet)", paddingLeft: 25, display: "flex", gap: 6 }}>
                {monthlyCredits > 0 && <span>{monthlyCredits.toLocaleString()} monthly</span>}
                {monthlyCredits > 0 && credits - monthlyCredits > 0 && <span>·</span>}
                {credits - monthlyCredits > 0 && <span>{Math.max(0, credits - monthlyCredits).toLocaleString()} lifetime</span>}
              </span>
            )}
          </Link>

          <button
            onClick={signOut}
            className="app-sidebar-link"
            style={{
              width: "100%",
              textAlign: "left",
              background: "transparent",
              border: "none",
              cursor: "pointer",
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
          the CSS sticky override, so it's out of flow even on desktop. This
          spacer reserves the 236px of flex width that the fixed aside
          visually occupies. Without it, the main column expands to full
          width and the sidebar overlaps the content. */}
      <div
        aria-hidden
        style={{ width: "var(--app-sidebar-w)", flexShrink: 0 }}
        className="hidden lg:block v2-app"
      />

      <style>{`
        @media (max-width: 1023px) {
          aside[data-open="false"][class*="v2-app"] {
            transform: translateX(-100%);
            transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
          }
          aside[data-open="true"][class*="v2-app"] {
            transform: translateX(0);
            transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
          }
        }
        @media (min-width: 1024px) {
          aside[class*="v2-app"] {
            position: sticky;
            top: 0;
            height: 100vh;
          }
        }
      `}</style>
    </>
  );
}
