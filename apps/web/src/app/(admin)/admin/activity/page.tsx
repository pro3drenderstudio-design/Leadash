"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

interface ActivityItem {
  id:             string;
  workspace_id:   string | null;
  workspace_name: string | null;
  user_email:     string | null;
  type:           string;
  title:          string;
  description:    string | null;
  metadata:       Record<string, unknown>;
  created_at:     string;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  new_workspace:         { label: "New Workspace",    color: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10",   icon: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" },
  subscription_started:  { label: "Subscription",     color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10",      icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" },
  subscription_upgraded: { label: "Upgraded",         color: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10", icon: "M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" },
  subscription_cancelled:{ label: "Cancelled",        color: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10",           icon: "M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  domain_purchased:      { label: "Domain Ordered",   color: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10", icon: "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" },
  domain_provisioned:    { label: "Domain Live",      color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10", icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  credit_purchase:       { label: "Credits",          color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",   icon: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  support_ticket:        { label: "Support Ticket",   color: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10",       icon: "M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" },
  lead_campaign_created: { label: "Campaign Created", color: "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10",           icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" },
  lead_campaign_completed:{ label: "Campaign Done",  color: "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10",        icon: "M3 3l1.664 1.664M21 21l-1.5-1.5m-5.485-1.242L12 17.25 4.5 21V8.742m.164-4.078a2.15 2.15 0 011.743-1.342 48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185V19.5M4.664 4.664L19.5 19.5" },
};

const ALL_TYPES = Object.keys(TYPE_CONFIG);

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)    return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] ?? { label: type, color: "text-slate-500 bg-slate-100 dark:bg-white/5", icon: "" };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

export default function ActivityPage() {
  const [items, setItems]       = useState<ActivityItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor]   = useState<string | null>(null);
  const [typeFilter, setTypeFilter]   = useState("");
  const [search, setSearch]           = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const fetchActivity = useCallback(async (cursor?: string, append = false) => {
    if (!append) setLoading(true); else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (typeFilter) params.set("type", typeFilter);
      if (search)     params.set("workspace", search);
      if (cursor)     params.set("cursor", cursor);
      const res  = await fetch(`/api/admin/activity?${params}`);
      const data = await res.json() as { items: ActivityItem[]; nextCursor: string | null };
      setItems(prev => append ? [...prev, ...data.items] : data.items);
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [typeFilter, search]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  function handleSearchInput(val: string) {
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(val), 400);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Activity Feed</h1>
        <p className="text-sm text-slate-500 dark:text-white/40 mt-1">All workspace events across the platform</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <input
          type="text"
          placeholder="Search workspace..."
          value={searchInput}
          onChange={e => handleSearchInput(e.target.value)}
          className="h-8 px-3 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-red-500 w-48"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="h-8 px-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-700 dark:text-white/70 focus:outline-none focus:ring-1 focus:ring-red-500"
        >
          <option value="">All events</option>
          {ALL_TYPES.map(t => (
            <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
          ))}
        </select>
        <button
          onClick={() => fetchActivity()}
          className="h-8 px-3 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-white/50 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-slate-400 dark:text-white/30">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          No activity yet
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {items.map(item => {
              const cfg = TYPE_CONFIG[item.type] ?? { color: "text-slate-500 bg-slate-100 dark:bg-white/5", icon: "" };
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06] hover:border-slate-200 dark:hover:border-white/10 transition-all"
                >
                  {/* Icon */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5 ${cfg.color}`}>
                    {cfg.icon && (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={cfg.icon} />
                      </svg>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800 dark:text-white/90 truncate">{item.title}</span>
                      <TypeBadge type={item.type} />
                    </div>
                    {item.description && (
                      <p className="text-xs text-slate-500 dark:text-white/40 mt-0.5 truncate">{item.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {item.workspace_id && item.workspace_name && (
                        <Link
                          href={`/admin/workspaces/${item.workspace_id}`}
                          className="text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 font-medium truncate max-w-[200px]"
                        >
                          {item.workspace_name}
                        </Link>
                      )}
                      {item.user_email && (
                        <span className="text-xs text-slate-400 dark:text-white/30 truncate">{item.user_email}</span>
                      )}
                    </div>
                  </div>

                  {/* Timestamp */}
                  <span className="flex-shrink-0 text-xs text-slate-400 dark:text-white/25 tabular-nums whitespace-nowrap pt-0.5">
                    {timeAgo(item.created_at)}
                  </span>
                </div>
              );
            })}
          </div>

          {nextCursor && (
            <button
              onClick={() => fetchActivity(nextCursor, true)}
              disabled={loadingMore}
              className="w-full mt-4 py-2.5 text-sm text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/60 border border-slate-200 dark:border-white/10 rounded-xl hover:border-slate-300 dark:hover:border-white/20 transition-all disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
