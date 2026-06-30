"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Funnel {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  status: "draft" | "active" | "archived";
  page_count: number;
  preview_page_id: string | null;
  entry_page_slug: string | null;
  created_at: string;
  updated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function StatusBadge({ status }: { status: Funnel["status"] }) {
  const map: Record<string, string> = {
    draft:    "bg-white/5 text-white/50 border border-white/10",
    active:   "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
    archived: "bg-white/5 text-white/30 border border-white/10",
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${map[status] ?? ""}`}>
      {status}
    </span>
  );
}

// ── Create Modal ──────────────────────────────────────────────────────────────

function CreateFunnelModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (funnel: Funnel) => void;
}) {
  const [name, setName]   = useState("");
  const [slug, setSlug]   = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]  = useState("");

  function handleNameChange(v: string) {
    setName(v);
    setSlug(slugify(v));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/funnels", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: name.trim(), slug: slug.trim() }),
    });
    const d = await res.json() as { funnel?: Funnel; error?: string };
    setSaving(false);
    if (!res.ok) { setError(d.error ?? "Failed"); return; }
    onCreate(d.funnel!);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-md p-6">
        <h2 className="text-base font-bold text-white mb-5">New Funnel</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Funnel Name</label>
            <input
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="e.g. 30-Day B2B Challenge"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-white/40 uppercase tracking-widest mb-1.5">Slug</label>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="b2b-challenge"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40 font-mono"
            />
            <p className="text-[10px] text-white/30 mt-1">leadash.com/{slug || "..."}/...</p>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm font-semibold text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white rounded-lg transition-colors"
            >
              {saving ? "Creating…" : "Create Funnel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FunnelsPage() {
  const router = useRouter();
  const [funnels,   setFunnels]   = useState<Funnel[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [cloning,   setCloning]   = useState<string | null>(null);
  const [copiedId,  setCopiedId]  = useState<string | null>(null);

  function funnelUrl(f: Funnel) {
    return `${window.location.origin}/f/${f.slug}/${f.entry_page_slug}`;
  }

  async function handleCopyUrl(f: Funnel) {
    if (!f.entry_page_slug) return;
    await navigator.clipboard.writeText(funnelUrl(f));
    setCopiedId(f.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/funnels");
    const d   = await res.json() as { funnels?: Funnel[] };
    setFunnels(d.funnels ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleArchive(id: string, current: string) {
    const newStatus = current === "archived" ? "draft" : "archived";
    await fetch(`/api/admin/funnels/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status: newStatus }),
    });
    load();
  }

  async function handleClone(id: string) {
    setCloning(id);
    const res = await fetch(`/api/admin/funnels/${id}/clone`, { method: "POST" });
    setCloning(null);
    if (res.ok) load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/funnels/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="min-h-screen bg-[#0c0c0f] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold text-white">Funnels</h1>
          <p className="text-sm text-white/40 mt-0.5">Build and manage conversion funnels</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-400 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Funnel
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : funnels.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
          <svg className="w-10 h-10 text-white/20 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
          </svg>
          <p className="text-white/30 text-sm">No funnels yet</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 px-4 py-2 text-sm font-semibold bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded-lg transition-colors"
          >
            Create your first funnel
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {funnels.map(f => (
            <div
              key={f.id}
              onClick={() => router.push(`/admin/funnels/${f.id}`)}
              className="flex items-center gap-4 bg-[#111] hover:bg-[#161616] border border-white/5 rounded-xl px-5 py-4 transition-colors group cursor-pointer"
            >
              {/* Icon */}
              <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                </svg>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white truncate">{f.name}</span>
                  <StatusBadge status={f.status} />
                </div>
                <p className="text-xs text-white/30 mt-0.5 font-mono">/{f.slug}/…</p>
              </div>

              {/* Stats */}
              <div className="hidden md:flex items-center gap-6 text-center">
                <div>
                  <p className="text-base font-bold text-white">{f.page_count}</p>
                  <p className="text-[10px] text-white/30">pages</p>
                </div>
              </div>

              {/* Date */}
              <div className="hidden lg:block text-right">
                <p className="text-xs text-white/30">
                  {new Date(f.created_at).toLocaleDateString()}
                </p>
              </div>

              {/* Actions */}
              <div
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <button
                  onClick={() => handleCopyUrl(f)}
                  disabled={!f.entry_page_slug}
                  title={f.entry_page_slug ? "Copy funnel URL" : "Add a page first"}
                  className="px-3 py-1.5 text-xs font-semibold bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white/60 rounded-lg transition-colors"
                >
                  {copiedId === f.id ? "Copied!" : "Copy URL"}
                </button>
                <button
                  onClick={() => window.open(funnelUrl(f), "_blank", "noopener,noreferrer")}
                  disabled={!f.entry_page_slug}
                  title={f.entry_page_slug ? "Open the live funnel in a new tab" : "Add a page first"}
                  className="px-3 py-1.5 text-xs font-semibold bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white/60 rounded-lg transition-colors"
                >
                  Open Funnel
                </button>
                <button
                  onClick={() => router.push(`/admin/funnels/${f.id}`)}
                  className="px-3 py-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleClone(f.id)}
                  disabled={cloning === f.id}
                  className="px-3 py-1.5 text-xs font-semibold bg-white/5 hover:bg-white/10 text-white/60 rounded-lg transition-colors"
                >
                  {cloning === f.id ? "…" : "Clone"}
                </button>
                <button
                  onClick={() => handleArchive(f.id, f.status)}
                  className="px-3 py-1.5 text-xs font-semibold bg-white/5 hover:bg-white/10 text-white/60 rounded-lg transition-colors"
                >
                  {f.status === "archived" ? "Unarchive" : "Archive"}
                </button>
                <button
                  onClick={() => handleDelete(f.id, f.name)}
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
        <CreateFunnelModal
          onClose={() => setShowModal(false)}
          onCreate={funnel => {
            setShowModal(false);
            router.push(`/admin/funnels/${funnel.id}`);
          }}
        />
      )}
    </div>
  );
}
