"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSidebar } from "@/components/SidebarContext";
import { useCredits } from "@/components/CreditsProvider";
import { SECTIONS, WORKSPACE_SECTION, findActiveSection, type NavSection, type NavTab } from "@/lib/nav/sections";

interface Props {
  workspaceName: string;
  plan: string;
}

export default function Sidebar({ workspaceName, plan }: Props) {
  const pathname = usePathname();
  const { isOpen, close } = useSidebar();
  // Credits flow through context so they update in real-time after any spend action.
  const { credits, monthlyCredits } = useCredits();
  const { section: activeSection } = findActiveSection(pathname);

  function isSectionActive(s: NavSection): boolean {
    return activeSection?.id === s.id;
  }

  function SectionLink({ section }: { section: NavSection }) {
    const active = isSectionActive(section);
    return (
      <Link
        href={section.href}
        onClick={close}
        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all ${
          active
            ? "bg-orange-50 dark:bg-white/10 text-slate-900 dark:text-white font-medium"
            : "text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white/80 hover:bg-slate-100 dark:hover:bg-white/5"
        }`}
      >
        <svg
          className={`w-4 h-4 flex-shrink-0 ${active ? "text-orange-500 dark:text-orange-400" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={section.icon} />
        </svg>
        {section.label}
        {section.badge && (
          <span className="ml-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-orange-500/15 text-orange-400 border border-orange-500/25 leading-none">
            {section.badge}
          </span>
        )}
        {active && <span className="ml-auto w-1 h-4 rounded-full bg-orange-400/60" />}
      </Link>
    );
  }

  // Inline sidebar link for a workspace sub-tab. Same visual treatment as SectionLink
  // so Settings/Support/Help sit visually alongside the primary section list, just
  // pinned to the bottom under the Workspace heading.
  function WorkspaceTabLink({ tab }: { tab: NavTab }) {
    const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
    return (
      <Link
        href={tab.href}
        onClick={close}
        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all ${
          active
            ? "bg-orange-50 dark:bg-white/10 text-slate-900 dark:text-white font-medium"
            : "text-slate-500 dark:text-white/40 hover:text-slate-800 dark:hover:text-white/80 hover:bg-slate-100 dark:hover:bg-white/5"
        }`}
      >
        {tab.icon && (
          <svg
            className={`w-4 h-4 flex-shrink-0 ${active ? "text-orange-500 dark:text-orange-400" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
          </svg>
        )}
        {tab.label}
        {active && <span className="ml-auto w-1 h-4 rounded-full bg-orange-400/60" />}
      </Link>
    );
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div
        className="px-4 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--sidebar-border)", minHeight: 56 }}
      >
        <Link href="/dashboard" className="flex items-center gap-2 group" onClick={close}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_Icon_Colored.svg" className="w-6 h-6 flex-shrink-0" alt="" />
          <div className="flex flex-col leading-none select-none">
            <span
              className="text-[15px] font-bold tracking-tight text-slate-800 dark:text-white/90 group-hover:text-slate-900 dark:group-hover:text-white transition-colors"
              style={{ letterSpacing: "-0.02em" }}
            >
              Leadash
            </span>
            <span className="text-[9px] text-slate-400 dark:text-white/30 mt-0.5">by Mizark</span>
          </div>
          <span className="px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-orange-500/15 text-orange-400 border border-orange-500/25 select-none">
            Beta
          </span>
        </Link>
        {/* Close button — mobile only */}
        <button
          onClick={close}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 dark:text-white/30 hover:text-slate-700 dark:hover:text-white/60 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
          aria-label="Close menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Primary nav — top-level sections */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {SECTIONS.map(section => <SectionLink key={section.id} section={section} />)}
      </nav>

      {/* Workspace — sticky bottom group, Settings/Support/Help shown directly so users
          don't have to drill in to find help. */}
      <div
        className="px-2 py-2 space-y-0.5"
        style={{ borderTop: "1px solid var(--sidebar-border)" }}
      >
        <p className="px-2.5 pt-1 pb-1 text-[9px] font-bold text-slate-400 dark:text-white/20 uppercase tracking-[0.15em]">
          {WORKSPACE_SECTION.label}
        </p>
        {WORKSPACE_SECTION.tabs.map(tab => <WorkspaceTabLink key={tab.href} tab={tab} />)}
      </div>

      {/* Bottom utility row — credits + sign out */}
      <div
        className="px-2 py-3 space-y-1"
        style={{ borderTop: "1px solid var(--sidebar-border)" }}
      >
        {/* Credits balance */}
        <Link
          href="/lead-campaigns/credits"
          onClick={close}
          className="flex flex-col px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-slate-500 dark:text-white/40 group-hover:text-slate-700 dark:group-hover:text-white/70 transition-colors">Credits</span>
            </div>
            <span className="text-sm font-semibold tabular-nums text-slate-700 dark:text-white/70 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
              {credits.toLocaleString()}
            </span>
          </div>
          {(monthlyCredits > 0 || credits > 0) && (
            <div className="flex items-center gap-1.5 mt-0.5 pl-[26px] text-xs text-white/25">
              {monthlyCredits > 0 && (
                <span className="text-amber-500/50">{monthlyCredits.toLocaleString()} monthly</span>
              )}
              {monthlyCredits > 0 && credits - monthlyCredits > 0 && (
                <span className="text-white/15">·</span>
              )}
              {credits - monthlyCredits > 0 && (
                <span>{Math.max(0, credits - monthlyCredits).toLocaleString()} lifetime</span>
              )}
            </div>
          )}
        </Link>

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
    </>
  );

  return (
    <>
      {/* Backdrop — mobile only */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={close}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 flex flex-col
          transition-transform duration-250 ease-in-out
          lg:static lg:inset-auto lg:w-56 lg:flex-shrink-0 lg:h-screen lg:sticky lg:top-0 lg:translate-x-0
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{ background: "var(--sidebar-bg)", borderRight: "1px solid var(--sidebar-border)" }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
