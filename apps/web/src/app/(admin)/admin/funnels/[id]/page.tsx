"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Funnel {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  status: "draft" | "active" | "archived";
  global_styles: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  created_at: string;
}

interface FunnelPage {
  id: string;
  funnel_id: string;
  name: string;
  slug: string;
  step_order: number;
  page_type: string;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const PAGE_TYPES = ["landing", "optin", "sales", "order", "oto", "upsell", "downsell", "thankyou", "webinar"];

function PageTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    landing:  "bg-blue-500/15 text-blue-400",
    optin:    "bg-purple-500/15 text-purple-400",
    sales:    "bg-orange-500/15 text-orange-400",
    order:    "bg-emerald-500/15 text-emerald-400",
    oto:      "bg-yellow-500/15 text-yellow-400",
    upsell:   "bg-pink-500/15 text-pink-400",
    downsell: "bg-red-500/15 text-red-400",
    thankyou: "bg-teal-500/15 text-teal-400",
    webinar:  "bg-indigo-500/15 text-indigo-400",
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${colors[type] ?? "bg-white/10 text-white/40"}`}>
      {type}
    </span>
  );
}

// ── Add Page Modal ────────────────────────────────────────────────────────────

function AddPageModal({
  funnelId,
  onClose,
  onAdd,
}: {
  funnelId: string;
  onClose: () => void;
  onAdd: (page: FunnelPage) => void;
}) {
  const [name,      setName]      = useState("");
  const [slug,      setSlug]      = useState("");
  const [pageType,  setPageType]  = useState("landing");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/admin/funnels/${funnelId}/pages`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: name.trim(), slug: slug.trim(), page_type: pageType }),
    });
    const d = await res.json() as { page?: FunnelPage; error?: string };
    setSaving(false);
    if (!res.ok) { setError(d.error ?? "Failed"); return; }
    onAdd(d.page!);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-md p-6">
        <h2 className="text-base font-bold text-white mb-5">Add Page</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Page Name</label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setSlug(slugify(e.target.value)); }}
              placeholder="e.g. Opt-in Page"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Slug</label>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="opt-in"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Page Type</label>
            <select
              value={pageType}
              onChange={e => setPageType(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            >
              {PAGE_TYPES.map(t => (
                <option key={t} value={t} className="bg-[#1a1a1a]">{t}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-sm font-semibold text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()} className="flex-1 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white rounded-lg transition-colors">
              {saving ? "Adding…" : "Add Page"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Pages Tab ─────────────────────────────────────────────────────────────────

function PagesTab({
  funnel,
  pages,
  onReload,
  router,
}: {
  funnel: Funnel;
  pages: FunnelPage[];
  onReload: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [showModal,   setShowModal]   = useState(false);
  const [dragging,    setDragging]    = useState<string | null>(null);
  const [localPages,  setLocalPages]  = useState<FunnelPage[]>(pages);
  const [publishing,  setPublishing]  = useState<string | null>(null);

  useEffect(() => { setLocalPages(pages); }, [pages]);

  async function handlePublish(pageId: string, current: string) {
    if (current === "published") {
      // Unpublish
      await fetch(`/api/admin/funnels/${funnel.id}/pages/${pageId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: "draft" }),
      });
      onReload();
      return;
    }
    setPublishing(pageId);
    await fetch(`/api/admin/funnels/${funnel.id}/pages/${pageId}/publish`, { method: "POST" });
    setPublishing(null);
    onReload();
  }

  async function handleDuplicate(page: FunnelPage) {
    await fetch(`/api/admin/funnels/${funnel.id}/pages`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: `${page.name} (Copy)`, slug: `${page.slug}-copy`, page_type: page.page_type }),
    });
    onReload();
  }

  async function handleDelete(pageId: string, name: string) {
    if (!confirm(`Delete page "${name}"?`)) return;
    await fetch(`/api/admin/funnels/${funnel.id}/pages/${pageId}`, { method: "DELETE" });
    onReload();
  }

  // Simple drag reorder
  function onDragStart(id: string) { setDragging(id); }
  function onDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragging || dragging === targetId) return;
    const from = localPages.findIndex(p => p.id === dragging);
    const to   = localPages.findIndex(p => p.id === targetId);
    if (from === -1 || to === -1) return;
    const next = [...localPages];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setLocalPages(next.map((p, i) => ({ ...p, step_order: i + 1 })));
  }
  async function onDrop() {
    setDragging(null);
    // Persist new order
    await Promise.all(
      localPages.map(p =>
        fetch(`/api/admin/funnels/${funnel.id}/pages/${p.id}`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ step_order: p.step_order }),
        })
      )
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-white/40">{localPages.length} page{localPages.length !== 1 ? "s" : ""}</p>
        <button
          onClick={() => setShowModal(true)}
          className="px-3 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white rounded-lg transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Page
        </button>
      </div>

      {localPages.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
          <p className="text-white/30 text-sm">No pages yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {localPages.map((p, i) => (
            <div
              key={p.id}
              draggable
              onDragStart={() => onDragStart(p.id)}
              onDragOver={e => onDragOver(e, p.id)}
              onDrop={onDrop}
              className={`flex items-center gap-4 bg-[#111] border rounded-xl px-4 py-3 group transition-all cursor-grab active:cursor-grabbing ${
                dragging === p.id ? "border-orange-500/40 opacity-50" : "border-white/5 hover:border-white/10"
              }`}
            >
              {/* Drag handle */}
              <div className="text-white/20 hover:text-white/50 cursor-grab flex-shrink-0">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm8 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM8 13.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm8 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM8 21a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm8 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                </svg>
              </div>

              {/* Step number */}
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-white/50">{i + 1}</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white truncate">{p.name}</span>
                  <PageTypeBadge type={p.page_type} />
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
                    p.status === "published"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-white/5 text-white/30"
                  }`}>
                    {p.status}
                  </span>
                </div>
                <p className="text-xs text-white/30 font-mono mt-0.5">/f/{funnel.slug}/{p.slug}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => router.push(`/admin/funnels/${funnel.id}/pages/${p.id}/builder`)}
                  className="px-3 py-1.5 text-xs font-semibold bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded-lg transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handlePublish(p.id, p.status)}
                  disabled={publishing === p.id}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    p.status === "published"
                      ? "bg-white/5 hover:bg-white/10 text-white/40"
                      : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400"
                  }`}
                >
                  {publishing === p.id ? "…" : p.status === "published" ? "Unpublish" : "Publish"}
                </button>
                <button
                  onClick={() => handleDuplicate(p)}
                  className="w-7 h-7 flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(p.id, p.name)}
                  className="w-7 h-7 flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <AddPageModal
          funnelId={funnel.id}
          onClose={() => setShowModal(false)}
          onAdd={() => { setShowModal(false); onReload(); }}
        />
      )}
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({ funnel, onUpdate }: { funnel: Funnel; onUpdate: (f: Partial<Funnel>) => void }) {
  const [slug,        setSlug]        = useState(funnel.slug);
  const [domain,      setDomain]      = useState(funnel.custom_domain ?? "");
  const [styles,      setStyles]      = useState(funnel.global_styles ? JSON.stringify(funnel.global_styles, null, 2) : "{}");
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [error,       setError]       = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    let parsedStyles: Record<string, unknown> = {};
    try { parsedStyles = JSON.parse(styles); } catch { setError("Invalid JSON in styles"); setSaving(false); return; }

    const res = await fetch(`/api/admin/funnels/${funnel.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ slug: slug.trim(), custom_domain: domain.trim() || null, global_styles: parsedStyles }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      const d = await res.json() as { funnel: Funnel };
      onUpdate(d.funnel);
      setTimeout(() => setSaved(false), 2000);
    } else {
      const d = await res.json() as { error?: string };
      setError(d.error ?? "Save failed");
    }
  }

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Funnel Slug</label>
        <input
          value={slug}
          onChange={e => setSlug(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40 font-mono"
        />
      </div>
      <div>
        <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Custom Domain (optional)</label>
        <input
          value={domain}
          onChange={e => setDomain(e.target.value)}
          placeholder="funnels.yourdomain.com"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
        />
      </div>
      <div>
        <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Global Brand Styles (JSON)</label>
        <textarea
          value={styles}
          onChange={e => setStyles(e.target.value)}
          rows={8}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/40 resize-none"
        />
        <p className="text-[10px] text-white/30 mt-1">e.g. {`{"primary_color":"#f97316","font":"Inter"}`}</p>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-5 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white rounded-lg transition-colors"
      >
        {saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────

function AnalyticsTab({ funnel }: { funnel: Funnel }) {
  const [stats, setStats] = useState<{
    total_sessions: number;
    total_conversions: number;
    revenue_cents: number;
    pages: Array<{ page_id: string; name: string; views: number; conversions: number }>;
  } | null>(null);

  useEffect(() => {
    // Placeholder: fetch analytics
    setStats({ total_sessions: 0, total_conversions: 0, revenue_cents: 0, pages: [] });
  }, [funnel.id]);

  if (!stats) return <div className="animate-pulse h-40 bg-white/5 rounded-xl" />;

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Sessions",    value: stats.total_sessions.toLocaleString() },
          { label: "Conversions", value: stats.total_conversions.toLocaleString() },
          { label: "Revenue",     value: `₦${(stats.revenue_cents / 100).toLocaleString()}` },
          { label: "Conv. Rate",  value: stats.total_sessions ? `${((stats.total_conversions / stats.total_sessions) * 100).toFixed(1)}%` : "0%" },
        ].map(c => (
          <div key={c.label} className="bg-[#111] border border-white/5 rounded-xl p-4">
            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">{c.label}</p>
            <p className="text-xl font-bold text-white">{c.value}</p>
          </div>
        ))}
      </div>

      {stats.pages.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-white/10 rounded-xl">
          <p className="text-white/30 text-sm">No analytics data yet — publish pages and drive traffic</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="pb-2 text-xs text-white/30 font-semibold">Page</th>
              <th className="pb-2 text-xs text-white/30 font-semibold text-right">Views</th>
              <th className="pb-2 text-xs text-white/30 font-semibold text-right">Conversions</th>
              <th className="pb-2 text-xs text-white/30 font-semibold text-right">Rate</th>
            </tr>
          </thead>
          <tbody>
            {stats.pages.map(p => (
              <tr key={p.page_id} className="border-b border-white/5">
                <td className="py-2.5 text-white">{p.name}</td>
                <td className="py-2.5 text-white/60 text-right">{p.views}</td>
                <td className="py-2.5 text-white/60 text-right">{p.conversions}</td>
                <td className="py-2.5 text-white/60 text-right">
                  {p.views ? `${((p.conversions / p.views) * 100).toFixed(1)}%` : "0%"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── A/B Tests Tab ─────────────────────────────────────────────────────────────

function ABTestsTab({ funnel }: { funnel: Funnel }) {
  return (
    <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
      <svg className="w-8 h-8 text-white/20 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <p className="text-white/30 text-sm">A/B testing coming soon</p>
      <p className="text-white/20 text-xs mt-1">Create variants and split traffic between pages</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FunnelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id     = params.id as string;

  const [funnel,   setFunnel]   = useState<Funnel | null>(null);
  const [pages,    setPages]    = useState<FunnelPage[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<"pages" | "analytics" | "settings" | "abtests">("pages");
  const [editName, setEditName] = useState(false);
  const [nameVal,  setNameVal]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/funnels/${id}`);
    const d   = await res.json() as { funnel?: Funnel; pages?: FunnelPage[] };
    setFunnel(d.funnel ?? null);
    setPages(d.pages ?? []);
    setNameVal(d.funnel?.name ?? "");
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleRename() {
    if (!nameVal.trim() || nameVal === funnel?.name) { setEditName(false); return; }
    await fetch(`/api/admin/funnels/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: nameVal.trim() }),
    });
    setEditName(false);
    load();
  }

  async function toggleStatus() {
    if (!funnel) return;
    const next = funnel.status === "active" ? "draft" : "active";
    await fetch(`/api/admin/funnels/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status: next }),
    });
    load();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0c0f] p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/5 rounded-lg w-64" />
          <div className="h-4 bg-white/5 rounded w-40" />
        </div>
      </div>
    );
  }

  if (!funnel) {
    return (
      <div className="min-h-screen bg-[#0c0c0f] p-6 flex items-center justify-center">
        <p className="text-white/30">Funnel not found</p>
      </div>
    );
  }

  const TABS = [
    { key: "pages",     label: "Pages" },
    { key: "analytics", label: "Analytics" },
    { key: "settings",  label: "Settings" },
    { key: "abtests",   label: "A/B Tests" },
  ] as const;

  return (
    <div className="min-h-screen bg-[#0c0c0f] p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-white/30 mb-5">
        <button onClick={() => router.push("/admin/funnels")} className="hover:text-white/60 transition-colors">Funnels</button>
        <span>/</span>
        <span className="text-white/60">{funnel.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          {editName ? (
            <input
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setEditName(false); }}
              className="text-xl font-bold bg-transparent border-b border-orange-500/50 text-white focus:outline-none pb-0.5"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setEditName(true)}
              className="text-xl font-bold text-white hover:text-white/80 flex items-center gap-2 group"
            >
              {funnel.name}
              <svg className="w-4 h-4 text-white/20 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
          <p className="text-sm text-white/30 font-mono mt-1">/f/{funnel.slug}/…</p>
        </div>
        <button
          onClick={toggleStatus}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            funnel.status === "active"
              ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
              : "bg-white/10 text-white/60 hover:bg-white/20"
          }`}
        >
          {funnel.status === "active" ? "Active" : "Go Live"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10 mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? "border-orange-500 text-white"
                : "border-transparent text-white/40 hover:text-white/70"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "pages" && (
        <PagesTab funnel={funnel} pages={pages} onReload={load} router={router} />
      )}
      {tab === "analytics" && <AnalyticsTab funnel={funnel} />}
      {tab === "settings" && (
        <SettingsTab
          funnel={funnel}
          onUpdate={updated => setFunnel(prev => prev ? { ...prev, ...updated } : prev)}
        />
      )}
      {tab === "abtests" && <ABTestsTab funnel={funnel} />}
    </div>
  );
}
