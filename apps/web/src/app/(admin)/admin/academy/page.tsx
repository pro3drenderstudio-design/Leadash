"use client";
import { useEffect, useState } from "react";

interface Product {
  id: string; name: string; price_ngn: number; credits_grant: number;
  leadash_months: number; is_active: boolean;
}
interface Cohort {
  id: string; product_id: string; name: string; starts_at: string;
  max_seats: number | null; status: string;
}
interface Enrollment {
  id: string; product_id: string; status: string; enrolled_at: string;
  workspace_id: string; workspaces: { name: string } | null;
}
interface Module {
  id: string; product_id: string; day_number: number; title: string;
  mux_playback_id: string | null; unlock_offset_hours: number;
}

type Tab = "overview" | "cohorts" | "products";

export default function AdminAcademyPage() {
  const [tab, setTab]             = useState<Tab>("overview");
  const [products, setProducts]   = useState<Product[]>([]);
  const [cohorts, setCohorts]     = useState<Cohort[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [modules, setModules]     = useState<Module[]>([]);
  const [loading, setLoading]     = useState(true);
  const [msg, setMsg]             = useState<{ text: string; ok: boolean } | null>(null);

  // New cohort form
  const [newCohort, setNewCohort] = useState({ product_id: "challenge", name: "", starts_at: "", max_seats: "" });
  const [creating, setCreating]   = useState(false);

  // Edit product state
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [productEdits, setProductEdits]     = useState<Partial<Product>>({});
  const [savingProduct, setSavingProduct]   = useState(false);

  function flash(text: string, ok = true) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }

  function load() {
    setLoading(true);
    fetch("/api/admin/academy")
      .then(r => r.json() as Promise<{ products: Product[]; cohorts: Cohort[]; enrollments: Enrollment[]; modules: Module[] }>)
      .then(d => {
        setProducts(d.products ?? []);
        setCohorts(d.cohorts ?? []);
        setEnrollments(d.enrollments ?? []);
        setModules(d.modules ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function createCohort() {
    if (!newCohort.name || !newCohort.starts_at) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/academy/cohorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: newCohort.product_id,
          name:       newCohort.name,
          starts_at:  newCohort.starts_at,
          max_seats:  newCohort.max_seats ? parseInt(newCohort.max_seats) : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      flash("Cohort created");
      setNewCohort({ product_id: "challenge", name: "", starts_at: "", max_seats: "" });
      load();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Failed", false);
    } finally {
      setCreating(false);
    }
  }

  async function updateCohortStatus(id: string, status: string) {
    try {
      await fetch("/api/admin/academy/cohorts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      setCohorts(cs => cs.map(c => c.id === id ? { ...c, status } : c));
    } catch { /* ignore */ }
  }

  async function saveProduct() {
    if (!editingProduct) return;
    setSavingProduct(true);
    try {
      const res = await fetch("/api/admin/academy/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingProduct, ...productEdits }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      flash("Product updated");
      setEditingProduct(null);
      load();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Failed", false);
    } finally {
      setSavingProduct(false);
    }
  }

  const challengeEnrollments = enrollments.filter(e => e.product_id === "challenge");
  const academyEnrollments   = enrollments.filter(e => e.product_id === "academy");
  const totalRevenue = enrollments.reduce((sum, e) => {
    const p = products.find(p => p.id === e.product_id);
    return sum + (p?.price_ngn ?? 0);
  }, 0);

  const STATUS_COLORS: Record<string, string> = {
    upcoming: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    active:   "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
    ended:    "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/30",
  };

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-24 bg-white/5 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Academy</h1>
        <p className="text-slate-500 dark:text-white/40 text-sm mt-0.5">Manage cohorts, products, and enrollments</p>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-xl text-sm ${msg.ok ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"}`}>
          {msg.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Challenge Enrollments", value: challengeEnrollments.length, color: "text-orange-600 dark:text-orange-400" },
          { label: "Academy Enrollments",   value: academyEnrollments.length,   color: "text-purple-600 dark:text-purple-400" },
          { label: "Active Cohorts",        value: cohorts.filter(c => c.status === "active").length, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Revenue (₦)",           value: `₦${totalRevenue.toLocaleString("en-NG")}`, color: "text-slate-900 dark:text-white" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-400 dark:text-white/40 uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 dark:bg-white/5 p-1 rounded-xl w-fit">
        {(["overview", "cohorts", "products"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
              tab === t
                ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === "overview" && (
        <div className="space-y-6">
          <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/8">
              <h2 className="font-semibold text-slate-900 dark:text-white">Recent Enrollments</h2>
            </div>
            {enrollments.length === 0 ? (
              <p className="px-6 py-8 text-slate-400 dark:text-white/30 text-sm text-center">No enrollments yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-white/8">
                    {["Workspace", "Product", "Status", "Enrolled"].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/6">
                  {enrollments.slice(0, 20).map(e => (
                    <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-white/3 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-800 dark:text-white/80">{e.workspaces?.name ?? e.workspace_id.slice(0, 8)}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide ${
                          e.product_id === "challenge" ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300" : "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300"
                        }`}>
                          {e.product_id}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                          e.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" :
                          e.status === "completed" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" :
                          "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/30"
                        }`}>{e.status}</span>
                      </td>
                      <td className="px-6 py-3 text-slate-400 dark:text-white/40 tabular-nums">
                        {new Date(e.enrolled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Modules overview */}
          <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/8">
              <h2 className="font-semibold text-slate-900 dark:text-white">Challenge Modules</h2>
              <p className="text-slate-400 dark:text-white/40 text-xs mt-0.5">Video upload: set mux_playback_id via database for now</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/8">
                  {["Day", "Title", "Unlocks after", "Video"].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/6">
                {modules.filter(m => m.product_id === "challenge").map(m => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-white/3">
                    <td className="px-6 py-3 font-bold text-slate-900 dark:text-white/80">Day {m.day_number}</td>
                    <td className="px-6 py-3 text-slate-700 dark:text-white/70">{m.title}</td>
                    <td className="px-6 py-3 text-slate-400 dark:text-white/40 tabular-nums">
                      {m.unlock_offset_hours === 0 ? "Immediately" : `${m.unlock_offset_hours}h after start`}
                    </td>
                    <td className="px-6 py-3">
                      {m.mux_playback_id ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300 uppercase">Uploaded</span>
                      ) : (
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-400 dark:bg-white/8 dark:text-white/30 uppercase">No video</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {/* Cohorts tab */}
      {tab === "cohorts" && (
        <div className="space-y-6">
          {/* Create cohort form */}
          <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
            <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Create New Cohort</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 dark:text-white/40 uppercase tracking-wider mb-1.5">Product</label>
                <select
                  value={newCohort.product_id}
                  onChange={e => setNewCohort(c => ({ ...c, product_id: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-white/6 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-orange-500/50"
                >
                  {products.map(p => <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 dark:text-white/40 uppercase tracking-wider mb-1.5">Cohort Name</label>
                <input
                  value={newCohort.name}
                  onChange={e => setNewCohort(c => ({ ...c, name: e.target.value }))}
                  placeholder="e.g. June 2026 Challenge"
                  className="w-full bg-slate-50 dark:bg-white/6 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-white/20 focus:outline-none focus:border-orange-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 dark:text-white/40 uppercase tracking-wider mb-1.5">Start Date &amp; Time (Day 1 unlock)</label>
                <input
                  type="datetime-local"
                  value={newCohort.starts_at}
                  onChange={e => setNewCohort(c => ({ ...c, starts_at: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-white/6 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-orange-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 dark:text-white/40 uppercase tracking-wider mb-1.5">Max Seats (optional)</label>
                <input
                  type="number"
                  min="1"
                  value={newCohort.max_seats}
                  onChange={e => setNewCohort(c => ({ ...c, max_seats: e.target.value }))}
                  placeholder="Leave blank for unlimited"
                  className="w-full bg-slate-50 dark:bg-white/6 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-white/20 focus:outline-none focus:border-orange-500/50"
                />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={createCohort}
                disabled={creating || !newCohort.name || !newCohort.starts_at}
                className="px-6 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {creating ? "Creating…" : "Create Cohort"}
              </button>
            </div>
          </section>

          {/* Cohort list */}
          <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/8">
              <h2 className="font-semibold text-slate-900 dark:text-white">All Cohorts</h2>
            </div>
            {cohorts.length === 0 ? (
              <p className="px-6 py-8 text-slate-400 dark:text-white/30 text-sm text-center">No cohorts yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-white/8">
                    {["Name", "Product", "Starts", "Max Seats", "Status", "Actions"].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/6">
                  {cohorts.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/3 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-800 dark:text-white/80">{c.name}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                          c.product_id === "challenge" ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300" : "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300"
                        }`}>{c.product_id}</span>
                      </td>
                      <td className="px-6 py-3 text-slate-600 dark:text-white/60 tabular-nums">
                        {new Date(c.starts_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-6 py-3 text-slate-400 dark:text-white/40">{c.max_seats ?? "∞"}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${STATUS_COLORS[c.status] ?? STATUS_COLORS.ended}`}>{c.status}</span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex gap-2">
                          {c.status === "upcoming" && (
                            <button onClick={() => updateCohortStatus(c.id, "active")}
                              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium">Activate</button>
                          )}
                          {c.status === "active" && (
                            <button onClick={() => updateCohortStatus(c.id, "ended")}
                              className="text-xs text-slate-400 hover:underline font-medium">End</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {/* Products tab */}
      {tab === "products" && (
        <div className="space-y-4">
          {products.map(p => (
            <section key={p.id} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="font-semibold text-slate-900 dark:text-white text-lg">{p.name}</h2>
                  <p className="text-slate-400 dark:text-white/40 text-xs mt-0.5 font-mono">{p.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${p.is_active ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" : "bg-slate-100 text-slate-400 dark:bg-white/8 dark:text-white/30"}`}>
                    {p.is_active ? "Active" : "Inactive"}
                  </span>
                  {editingProduct !== p.id ? (
                    <button
                      onClick={() => { setEditingProduct(p.id); setProductEdits({ price_ngn: p.price_ngn, credits_grant: p.credits_grant, leadash_months: p.leadash_months, is_active: p.is_active }); }}
                      className="text-sm text-orange-500 hover:text-orange-400 font-medium"
                    >Edit</button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setEditingProduct(null)} className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-white/60">Cancel</button>
                      <button onClick={saveProduct} disabled={savingProduct} className="text-sm text-emerald-600 dark:text-emerald-400 font-medium disabled:opacity-40">
                        {savingProduct ? "Saving…" : "Save"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {editingProduct === p.id ? (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Price (₦)", key: "price_ngn" as const, type: "number" },
                    { label: "Credits Grant", key: "credits_grant" as const, type: "number" },
                    { label: "Leadash Months", key: "leadash_months" as const, type: "number" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs font-semibold text-slate-400 dark:text-white/40 uppercase tracking-wider mb-1.5">{f.label}</label>
                      <input
                        type={f.type}
                        value={(productEdits[f.key] as number) ?? ""}
                        onChange={e => setProductEdits(prev => ({ ...prev, [f.key]: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-slate-50 dark:bg-white/6 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-orange-500/50"
                      />
                    </div>
                  ))}
                  <div className="flex items-center gap-3 pt-6">
                    <div
                      onClick={() => setProductEdits(prev => ({ ...prev, is_active: !prev.is_active }))}
                      className={`w-10 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${productEdits.is_active ? "bg-orange-500" : "bg-slate-200 dark:bg-white/15"}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${productEdits.is_active ? "translate-x-4" : "translate-x-0"}`} />
                    </div>
                    <span className="text-sm text-slate-600 dark:text-white/60">Active</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Price", value: `₦${p.price_ngn.toLocaleString("en-NG")}` },
                    { label: "Credits Grant", value: p.credits_grant.toLocaleString() },
                    { label: "Leadash Months", value: String(p.leadash_months) },
                  ].map(f => (
                    <div key={f.label}>
                      <p className="text-xs text-slate-400 dark:text-white/30 uppercase tracking-wider font-semibold mb-0.5">{f.label}</p>
                      <p className="text-slate-900 dark:text-white font-semibold">{f.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
