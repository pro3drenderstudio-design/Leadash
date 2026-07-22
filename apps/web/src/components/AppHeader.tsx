"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { wsGet } from "@/lib/workspace/client";
import { useCredits } from "@/components/CreditsProvider";
import { useSidebar } from "@/components/SidebarContext";
import { HugeiconsIcon } from "@hugeicons/react";
import { Coins01Icon, Settings02Icon, Mail01Icon, Logout03Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";

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
  trialEndsAt?: string | null;
  subscriptionRenewsAt?: string | null;
}

export default function AppHeader({ userEmail, userName, workspaceName, plan, trialEndsAt, subscriptionRenewsAt }: Props) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch]           = useState("");
  const [results, setResults]         = useState<SearchResult[]>([]);
  const [searchFocused, setFocused]   = useState(false);
  const [notifCount, setNotifCount]   = useState(0);
  const profileRef = useRef<HTMLDivElement>(null);
  const { open: openSidebar } = useSidebar();
  // Credits come from the shared provider — they live-update via the ld:credits-changed event.
  const { credits, monthlyCredits, lifetimeCredits } = useCredits();

  const displayName = userName || userEmail.split("@")[0];
  const initials    = displayName.split(/[\s.]+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");

  useEffect(() => {
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
      className="flex-shrink-0 z-50 h-14 flex items-center px-4 lg:px-5 gap-3 lg:gap-4"
      style={{
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        background: "var(--app-bg-sunken)",
        borderBottom: "1px solid var(--app-border)",
      }}
    >
      {/* ── Hamburger — mobile only ── */}
      <button
        onClick={openSidebar}
        className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70 hover:bg-slate-100 dark:hover:bg-white/5 transition-all flex-shrink-0"
        aria-label="Open menu"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* ── Search ── */}
      <div className="relative flex-1 max-w-sm">
        <div
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-all"
          style={{ background: "var(--app-surface)", border: "1px solid var(--app-border-strong)" }}
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
            style={{ background: "var(--app-bg-elevated)", border: "1px solid var(--app-border-strong)" }}
          >
            {results.map(r => (
              <Link
                key={r.type + r.id}
                href={r.href}
                className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
              >
                <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                  r.type === "lead_campaign" ? "bg-amber-500/10" : "bg-orange-500/10"
                }`}>
                  <svg className={`w-3 h-3 ${r.type === "lead_campaign" ? "text-amber-500 dark:text-amber-400" : "text-orange-500 dark:text-orange-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

        {/* Trial / subscription countdown pill */}
        {(() => {
          // Trial takes priority (shows for any plan with trial_ends_at)
          if (trialEndsAt) {
            const msLeft   = new Date(trialEndsAt).getTime() - Date.now();
            const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
            const expired  = daysLeft === 0;
            const color    = expired ? "#ef4444" : daysLeft <= 3 ? "#f97316" : daysLeft <= 7 ? "#f59e0b" : "#10b981";
            const bg       = expired ? "rgba(239,68,68,0.1)" : daysLeft <= 3 ? "rgba(249,115,22,0.1)" : daysLeft <= 7 ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.1)";
            const border   = expired ? "rgba(239,68,68,0.2)" : daysLeft <= 3 ? "rgba(249,115,22,0.2)" : daysLeft <= 7 ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.2)";
            const isBeta   = plan !== "free";
            const label    = expired
              ? (isBeta ? "Beta expired" : "Trial expired")
              : daysLeft === 1 ? "1 day left"
              : `${daysLeft}d ${isBeta ? "beta" : "trial"}`;
            return (
              <Link
                href="/settings?tab=billing"
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background: bg, border: `1px solid ${border}`, color }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {label}
              </Link>
            );
          }
          // Subscription renewal — show when ≤ 7 days away
          if (subscriptionRenewsAt && plan !== "free") {
            const msLeft   = new Date(subscriptionRenewsAt).getTime() - Date.now();
            const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
            if (daysLeft > 0 && daysLeft <= 7) {
              const color  = daysLeft <= 1 ? "#f97316" : daysLeft <= 3 ? "#f59e0b" : "#94a3b8";
              const bg     = daysLeft <= 1 ? "rgba(249,115,22,0.1)" : daysLeft <= 3 ? "rgba(245,158,11,0.1)" : "rgba(148,163,184,0.08)";
              const border = daysLeft <= 1 ? "rgba(249,115,22,0.2)" : daysLeft <= 3 ? "rgba(245,158,11,0.2)" : "rgba(148,163,184,0.15)";
              const label  = daysLeft === 1 ? "Renews tomorrow" : `Renews in ${daysLeft}d`;
              return (
                <Link
                  href="/settings?tab=billing"
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: bg, border: `1px solid ${border}`, color }}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {label}
                </Link>
              );
            }
          }
          return null;
        })()}

        {/* Credits */}
        {(
          <div className="relative group/credits hidden sm:block">
            <Link
              href="/lead-campaigns/credits"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.18)", color: "#f59e0b" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(245,158,11,0.15)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(245,158,11,0.1)")}
            >
              <HugeiconsIcon icon={Coins01Icon} size={14} strokeWidth={1.8} />
              {credits.toLocaleString()}
              <span className="text-amber-400/50 font-normal">cr</span>
            </Link>
            {/* Breakdown tooltip */}
            <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-white/10 bg-gray-950 shadow-2xl p-3 text-xs opacity-0 pointer-events-none group-hover/credits:opacity-100 group-hover/credits:pointer-events-auto transition-opacity z-50">
              <p className="text-white/40 font-medium mb-2 uppercase tracking-wider text-[10px]">Credits breakdown</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-white/50">Monthly (used first)</span>
                  <span className="text-amber-400 font-semibold tabular-nums">{monthlyCredits.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/50">Lifetime</span>
                  <span className="text-white/70 font-semibold tabular-nums">{lifetimeCredits.toLocaleString()}</span>
                </div>
                <div className="border-t border-white/8 pt-1.5 flex items-center justify-between">
                  <span className="text-white/70 font-medium">Total</span>
                  <span className="text-white font-bold tabular-nums">{credits.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
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
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 bg-emerald-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center" title="Interested replies">
              {notifCount}
            </span>
          )}
        </Link>

        {/* Divider */}
        <div className="w-px h-5 bg-slate-200 dark:bg-white/[0.08] mx-1" />

        {/* Profile identity card */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen(o => !o)}
            className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all group"
          >
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
              style={{ background: "var(--app-accent)", color: "#0a0a0a" }}
            >
              {initials}
            </div>
            <div className="text-left hidden sm:block leading-tight">
              <p style={{ fontSize: "var(--app-small)", fontWeight: 500, color: "var(--app-text)" }} className="truncate max-w-[96px]">{displayName}</p>
              <p style={{ fontSize: "var(--app-micro)", color: "var(--app-text-quiet)", marginTop: 1 }} className="truncate max-w-[96px]">{workspaceName}</p>
            </div>
            <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={1.8} style={{ color: "var(--app-text-quiet)" }} />
          </button>

          {/* Dropdown */}
          {profileOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-60 overflow-hidden z-50"
              style={{
                background: "var(--app-bg-elevated)",
                border: "1px solid var(--app-border-strong)",
                borderRadius: "var(--app-radius)",
                boxShadow: "0 12px 32px rgba(0, 0, 0, 0.5)",
              }}
            >
              {/* Identity */}
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--app-border)" }}>
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--app-accent)", color: "#0a0a0a", fontSize: 13, fontWeight: 600 }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p style={{ fontSize: "var(--app-body-sm)", fontWeight: 500, color: "var(--app-text)" }} className="truncate">{displayName}</p>
                    <p style={{ fontSize: "var(--app-micro)", color: "var(--app-text-quiet)", marginTop: 1 }} className="truncate">{userEmail}</p>
                  </div>
                </div>
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: "var(--app-micro)", color: "var(--app-text-quiet)" }} className="truncate">{workspaceName}</span>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    padding: "2px 7px",
                    borderRadius: 4,
                    background: "var(--app-surface)",
                    color: plan === "free" ? "var(--app-text-quiet)" : "var(--app-accent)",
                    border: "1px solid var(--app-border)",
                  }}>
                    {plan}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ padding: 6 }}>
                {[
                  { href: "/settings",              icon: Settings02Icon, label: "Settings" },
                  { href: "/lead-campaigns/credits", icon: Coins01Icon,    label: "Buy Credits" },
                  { href: "/inboxes",                icon: Mail01Icon,     label: "Manage Inboxes" },
                ].map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 transition-colors"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      fontSize: "var(--app-body-sm)",
                      color: "var(--app-text-muted)",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--app-surface)"; e.currentTarget.style.color = "var(--app-text)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--app-text-muted)"; }}
                  >
                    <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.8} />
                    {item.label}
                  </Link>
                ))}
              </div>

              <div style={{ padding: 6, borderTop: "1px solid var(--app-border)" }}>
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-2.5 transition-colors"
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    fontSize: "var(--app-body-sm)",
                    color: "var(--app-text-muted)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)"; e.currentTarget.style.color = "#f87171"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--app-text-muted)"; }}
                >
                  <HugeiconsIcon icon={Logout03Icon} size={16} strokeWidth={1.8} />
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
