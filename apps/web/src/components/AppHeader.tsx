"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { wsGet } from "@/lib/workspace/client";
import { useTheme } from "@/components/ThemeProvider";

interface SearchResult {
  type: "lead_campaign" | "campaign";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

interface Props {
  userEmail: string;
  userName: string | null;
  workspaceName: string;
  plan: string;
}

const PLAN_STYLE: Record<string, string> = {
  free:       "text-slate-500 dark:text-white/40 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/[0.08]",
  pro:        "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20",
  scale:      "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/20",
  enterprise: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20",
};

export default function AppHeader({ userEmail, userName, workspaceName, plan }: Props) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch]           = useState("");
  const [results, setResults]         = useState<SearchResult[]>([]);
  const [searchFocused, setFocused]   = useState(false);
  const [credits, setCredits]         = useState<number | null>(null);
  const [notifCount, setNotifCount]   = useState(0);
  const profileRef = useRef<HTMLDivElement>(null);
  const { theme, toggle } = useTheme();

  const displayName = userName || userEmail.split("@")[0];
  const initials    = displayName.split(/[\s.]+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");

  useEffect(() => {
    wsGet<{ balance: number }>("/api/lead-campaigns/credits")
      .then(d => setCredits(d.balance ?? 0))
      .catch(() => {});

    const fetchInterested = () =>
      wsGet<{ count: number }>("/api/outreach/crm/interested-count")
        .then(d => setNotifCount(Math.min(d.count ?? 0, 9)))
        .catch(() => {});

    fetchInterested();
    // Re-check every 5 minutes
    const interval = setInterval(fetchInterested, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      const q = search.toLowerCase();
      const [lc, oc] = await Promise.allSettled([
        wsGet<{ id: string; name: string; mode: string }[]>("/api/lead-campaigns"),
        wsGet<{ id: string; name: string }[]>("/api/outreach/campaigns"),
      ]);
      const out: SearchResult[] = [];
      if (lc.status === "fulfilled") {
        lc.value.filter(c => c.name.toLowerCase().includes(q)).slice(0, 3).forEach(c =>
          out.push({ type: "lead_campaign", id: c.id, title: c.name, subtitle: c.mode.replace("_", " "), href: `/lead-campaigns/${c.id}` }),
        );
      }
      if (oc.status === "fulfilled") {
        oc.value.filter(c => c.name.toLowerCase().includes(q)).slice(0, 3).forEach(c =>
          out.push({ type: "campaign", id: c.id, title: c.name, subtitle: "sequence", href: `/campaigns/${c.id}` }),
        );
      }
      setResults(out);
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <header
      className="fixed top-0 left-56 right-0 z-30 h-14 flex items-center px-5 gap-4"
      style={{
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        background: "var(--header-bg)",
        borderBottom: "1px solid var(--header-border)",
      }}
    >
      {/* ── Search ── */}
      <div className="relative flex-1 max-w-sm">
        <div
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-all"
          style={{ background: "var(--search-bg)", border: "1px solid var(--search-border)" }}
        >
          <svg className="w-3.5 h-3.5 text-slate-400 dark:text-white/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            className="flex-1 bg-transparent text-sm text-slate-700 dark:text-white/70 placeholder-slate-400 dark:placeholder-white/25 outline-none w-0 min-w-0"
          />
          {search && (
            <button onClick={() => { setSearch(""); setResults([]); }} className="text-slate-400 dark:text-white/20 hover:text-slate-600 dark:hover:text-white/50 flex-shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Search results */}
        {searchFocused && results.length > 0 && (
          <div
            className="absolute top-full mt-1.5 w-full rounded-xl overflow-hidden shadow-2xl"
            style={{ background: "var(--dropdown-bg)", border: "1px solid var(--dropdown-border)" }}
          >
            {results.map(r => (
              <Link
                key={r.type + r.id}
                href={r.href}
                className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
              >
                <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                  r.type === "lead_campaign" ? "bg-amber-500/10" : "bg-blue-500/10"
                }`}>
                  <svg className={`w-3 h-3 ${r.type === "lead_campaign" ? "text-amber-500 dark:text-amber-400" : "text-blue-500 dark:text-blue-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={
                      r.type === "lead_campaign"
                        ? "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                        : "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    } />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-slate-600 dark:text-white/70 truncate group-hover:text-slate-900 dark:group-hover:text-white/90 transition-colors">{r.title}</p>
                  <p className="text-xs text-slate-400 dark:text-white/25 capitalize">{r.subtitle}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Right cluster ── */}
      <div className="flex items-center gap-2 ml-auto">

        {/* Credits */}
        {credits !== null && (
          <Link
            href="/lead-campaigns/credits"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.18)", color: "#f59e0b" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(245,158,11,0.15)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(245,158,11,0.1)")}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {credits.toLocaleString()}
            <span className="text-amber-400/50 font-normal">cr</span>
          </Link>
        )}

        {/* Notifications */}
        <Link
          href="/crm"
          className="relative w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-white/30 hover:text-slate-700 dark:hover:text-white/60 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
          title="CRM Inbox"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          {notifCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 bg-blue-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center">
              {notifCount}
            </span>
          )}
        </Link>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-white/30 hover:text-slate-700 dark:hover:text-white/60 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            /* Sun icon — shown in dark mode, click to go light */
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 6.343l-.707-.707m12.728 12.728l-.707-.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            /* Moon icon — shown in light mode, click to go dark */
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-slate-200 dark:bg-white/[0.08] mx-1" />

        {/* Profile identity card */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen(o => !o)}
            className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all group"
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)" }}
            >
              {initials}
            </div>
            <div className="text-left hidden sm:block leading-none">
              <p className="text-xs font-semibold text-slate-700 dark:text-white/80 group-hover:text-slate-900 dark:group-hover:text-white transition-colors truncate max-w-[96px]">{displayName}</p>
              <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5 truncate max-w-[96px]">{workspaceName}</p>
            </div>
            <svg className="w-3 h-3 text-slate-400 dark:text-white/20 group-hover:text-slate-600 dark:group-hover:text-white/40 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown */}
          {profileOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-56 rounded-xl shadow-2xl overflow-hidden z-50"
              style={{ background: "var(--dropdown-bg)", border: "1px solid var(--dropdown-border)" }}
            >
              {/* Identity */}
              <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--divider-color)" }}>
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)" }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{displayName}</p>
                    <p className="text-xs text-slate-400 dark:text-white/30 truncate">{userEmail}</p>
                  </div>
                </div>
                <div className="mt-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${PLAN_STYLE[plan] ?? PLAN_STYLE.free}`}>
                    {plan}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="p-1.5 space-y-0.5">
                {[
                  { href: "/settings",              icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z", label: "Settings" },
                  { href: "/lead-campaigns/credits", icon: "M13 10V3L4 14h7v7l9-11h-7z",                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     label: "Buy Credits" },
                  { href: "/inboxes",                icon: "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4",                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      label: "Manage Inboxes" },
                ].map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-white/55 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                    {item.label}
                  </Link>
                ))}
              </div>

              <div className="p-1.5" style={{ borderTop: "1px solid var(--divider-color)" }}>
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-500/70 dark:text-red-400/60 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/5 transition-all"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
