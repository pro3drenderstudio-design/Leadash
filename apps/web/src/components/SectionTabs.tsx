"use client";

/**
 * Top-center tab bar that renders the sub-pages of whichever sidebar section
 * is currently active. Sits inside the AppHeader / between header and main.
 *
 * Desktop: up to 4 tabs visible, the rest collapse into a "More" dropdown.
 *   If the active tab lives in the overflow bucket we swap it into the
 *   visible row so the user always sees their current location.
 * Mobile: horizontal scroll, no More dropdown — tabs flow naturally.
 *
 * Renders nothing if the active section has fewer than 2 tabs (Dashboard,
 * Academy) — a single-tab section doesn't need a tab strip.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { findActiveSection, type NavTab } from "@/lib/nav/sections";

// Every section has at most 5 tabs (Outreach), so 5 keeps them all flat — no
// nested "More" dropdown. Raise only if a section ever exceeds this.
const MAX_VISIBLE = 5;

function TabLabel({ tab, active }: { tab: NavTab; active: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {tab.label}
      {tab.badge && (
        <span className={`px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider leading-none ${
          active
            ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
            : "bg-orange-500/15 text-orange-400 border border-orange-500/25"
        }`}>{tab.badge}</span>
      )}
    </span>
  );
}

export default function SectionTabs() {
  const pathname = usePathname();
  const { section, tab: activeTab } = findActiveSection(pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close the More dropdown on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Close the dropdown on every navigation
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  if (!section || section.tabs.length < 2) return null;

  // Decide what's visible vs overflow on desktop. If the active tab is in the
  // overflow bucket, swap it forward so the user can see where they are.
  const tabs = section.tabs;
  const needsMore = tabs.length > MAX_VISIBLE;
  let visible: NavTab[];
  let overflow: NavTab[];
  if (!needsMore) {
    visible = tabs;
    overflow = [];
  } else {
    const activeIdx = activeTab ? tabs.findIndex(t => t.href === activeTab.href) : -1;
    if (activeIdx >= MAX_VISIBLE) {
      // Pull active forward; drop the last visible into overflow
      const baseVisible = tabs.slice(0, MAX_VISIBLE - 1);
      visible  = [...baseVisible, tabs[activeIdx]];
      overflow = tabs.filter((_, i) => i >= MAX_VISIBLE - 1 && i !== activeIdx);
    } else {
      visible  = tabs.slice(0, MAX_VISIBLE);
      overflow = tabs.slice(MAX_VISIBLE);
    }
  }

  return (
    <div className="w-full border-b border-slate-200 dark:border-white/8 bg-white/40 dark:bg-white/[0.02] backdrop-blur-sm">
      <div className="flex justify-center px-4">
        {/* Mobile: horizontal scroll across all tabs */}
        <nav className="flex sm:hidden w-full overflow-x-auto no-scrollbar -mx-4 px-4 gap-1 py-2">
          {tabs.map(tab => {
            const isActive = activeTab?.href === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-white dark:bg-white/12 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white/70 hover:bg-slate-100 dark:hover:bg-white/5"
                }`}
              >
                <TabLabel tab={tab} active={isActive} />
              </Link>
            );
          })}
        </nav>

        {/* Desktop: capped at 4 visible + More dropdown */}
        <nav className="hidden sm:flex items-center gap-1 py-2">
          {visible.map(tab => {
            const isActive = activeTab?.href === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-white dark:bg-white/12 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-white/45 hover:text-slate-800 dark:hover:text-white/75 hover:bg-slate-100 dark:hover:bg-white/5"
                }`}
              >
                <TabLabel tab={tab} active={isActive} />
              </Link>
            );
          })}

          {overflow.length > 0 && (
            <div ref={moreRef} className="relative">
              <button
                onClick={() => setMoreOpen(v => !v)}
                aria-haspopup="true"
                aria-expanded={moreOpen}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  moreOpen
                    ? "bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white"
                    : "text-slate-500 dark:text-white/45 hover:text-slate-800 dark:hover:text-white/75 hover:bg-slate-100 dark:hover:bg-white/5"
                }`}
              >
                More
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round"
                  className={`transition-transform ${moreOpen ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] shadow-2xl py-1 z-50">
                  {overflow.map(tab => (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      onClick={() => setMoreOpen(false)}
                      className="block px-3 py-2 text-sm text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/6 transition-colors"
                    >
                      <TabLabel tab={tab} active={false} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}
