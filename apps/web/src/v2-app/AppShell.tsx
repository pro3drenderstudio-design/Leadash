"use client";

/**
 * v2-app AppShell — the layout chrome every signed-in screen sits inside.
 *
 * Composition: <AppShell> wraps <Sidebar> + <Topbar> + content area. The
 * sidebar is sticky-left and full height; the topbar is sticky-top; content
 * scrolls independently. Mobile collapses the sidebar into an off-canvas
 * drawer triggered by the topbar's menu button.
 *
 * Why a single shell instead of plain Next.js layouts: the auto-active
 * breadcrumb in the topbar needs to read the same nav data the sidebar
 * uses. Keeping them sibling components inside one shell makes that simple.
 */

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Icon, Tooltip } from "./primitives";
import {
  Menu01Icon,
  Logout03Icon,
  CommandIcon,
  Notification01Icon,
  Search01Icon,
} from "./icons";
import {
  APP_NAV,
  ADMIN_NAV,
  findActiveItem,
  type NavGroup,
} from "./nav";

// ─── Sidebar ───────────────────────────────────────────────────────────────
function Sidebar({
  groups,
  brandName,
  brandTag,
  bottom,
  mobileOpen,
}: {
  groups: NavGroup[];
  brandName: string;
  brandTag?: string;
  bottom?: React.ReactNode;
  mobileOpen?: boolean;
}) {
  const pathname = usePathname();
  const active = findActiveItem(pathname, groups);

  return (
    <aside className="app-shell-sidebar" data-open={mobileOpen ? "true" : "false"}>
      <Link href="/dashboard" className="app-sidebar-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Logo_Icon_Colored.svg" alt="" width={20} height={20} />
        <span className="app-sidebar-brand-name">
          {brandName}
          {brandTag && (
            <span style={{ fontSize: 10, color: "var(--app-text-quiet)", fontWeight: 500, marginLeft: 6, letterSpacing: "0.04em" }}>
              {brandTag}
            </span>
          )}
        </span>
      </Link>

      <nav className="app-sidebar-nav">
        {groups.map((group, gi) => (
          <React.Fragment key={gi}>
            {group.label && (
              <p className="app-sidebar-section-label">{group.label}</p>
            )}
            {group.items.map(item => {
              const isActive = active?.href === item.href;
              return (
                <React.Fragment key={item.href}>
                  <Link
                    href={item.href}
                    className="app-sidebar-link"
                    data-active={isActive ? "true" : "false"}
                  >
                    <Icon icon={item.icon} size={15} className="app-sidebar-link-icon" />
                    <span>{item.label}</span>
                    {item.badge && (
                      <span style={{
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
                      }}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                  {isActive && item.children && (
                    <div style={{ marginLeft: 24, paddingLeft: 8, borderLeft: "1px solid var(--app-border)", display: "flex", flexDirection: "column", gap: 1, marginTop: 2, marginBottom: 6 }}>
                      {item.children.map(t => {
                        const tActive = pathname === t.href || pathname.startsWith(t.href + "/");
                        return (
                          <Link
                            key={t.href}
                            href={t.href}
                            className="app-sidebar-link"
                            data-active={tActive ? "true" : "false"}
                            style={{ padding: "5px 10px", fontSize: 12.5 }}
                          >
                            <span>{t.label}</span>
                            {t.badge && (
                              <span style={{
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
                              }}>
                                {t.badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        ))}
      </nav>

      {bottom && <div className="app-sidebar-bottom">{bottom}</div>}
    </aside>
  );
}

// ─── Topbar ────────────────────────────────────────────────────────────────
function Topbar({
  groups,
  onMenu,
  onCommand,
  rightSlot,
}: {
  groups: NavGroup[];
  onMenu?: () => void;
  onCommand?: () => void;
  rightSlot?: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = findActiveItem(pathname, groups);
  const activeChild = active?.children?.find(t => pathname === t.href || pathname.startsWith(t.href + "/"));

  return (
    <header className="app-shell-topbar">
      <Button variant="ghost" size="sm" iconOnly={Menu01Icon} aria-label="Menu" onClick={onMenu} className="md:hidden" />

      <div className="app-topbar-crumbs">
        {active && (
          <>
            <span>{active.label}</span>
            {activeChild && (
              <>
                <span className="app-topbar-crumb-sep">/</span>
                <span className="app-topbar-crumb-current">{activeChild.label}</span>
              </>
            )}
          </>
        )}
      </div>

      <div className="app-topbar-actions">
        {onCommand && (
          <Tooltip label={<>Search anything <span className="app-kbd">⌘K</span></>}>
            <button
              type="button"
              onClick={onCommand}
              className="app-btn app-btn-secondary app-btn-sm"
              style={{ gap: 8 }}
              aria-label="Open command palette"
            >
              <Icon icon={Search01Icon} size={13} />
              <span style={{ color: "var(--app-text-quiet)" }}>Search</span>
              <span className="app-kbd" style={{ marginLeft: 4 }}>⌘K</span>
            </button>
          </Tooltip>
        )}
        {rightSlot}
      </div>
    </header>
  );
}

// ─── AppShell entry ────────────────────────────────────────────────────────
export function AppShell({
  variant = "app",
  brandName = "Leadash",
  brandTag,
  onCommand,
  onSignOut,
  sidebarBottom,
  topbarRight,
  children,
}: {
  variant?: "app" | "admin";
  brandName?: string;
  brandTag?: string;
  onCommand?: () => void;
  onSignOut?: () => void;
  sidebarBottom?: React.ReactNode;
  topbarRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const groups = variant === "admin" ? ADMIN_NAV : APP_NAV;
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="v2-app">
      <div className="app-shell">
        <Sidebar
            mobileOpen={mobileOpen}
            groups={groups}
            brandName={brandName}
            brandTag={brandTag}
            bottom={
              sidebarBottom ?? (
                onSignOut ? (
                  <button
                    onClick={onSignOut}
                    className="app-sidebar-link"
                    style={{ width: "100%", textAlign: "left", background: "transparent", border: "none" }}
                  >
                    <Icon icon={Logout03Icon} size={15} className="app-sidebar-link-icon" />
                    <span>Sign out</span>
                  </button>
                ) : null
              )
            }
          />

        <div className="app-shell-main">
          <Topbar
            groups={groups}
            onMenu={() => setMobileOpen(o => !o)}
            onCommand={onCommand}
            rightSlot={
              topbarRight ?? (
                <>
                  <Button variant="ghost" size="sm" iconOnly={Notification01Icon} aria-label="Notifications" />
                </>
              )
            }
          />
          <main className="app-shell-content">{children}</main>
        </div>
      </div>
    </div>
  );
}

export { CommandIcon, Search01Icon };
