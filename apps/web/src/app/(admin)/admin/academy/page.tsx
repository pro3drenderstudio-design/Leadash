"use client";
import { useEffect, useState, useRef, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product {
  id: string; slug: string; name: string; price_ngn: number;
  credits_grant: number; leadash_months: number; is_active: boolean;
  is_published: boolean; certificate_enabled: boolean;
  completion_threshold_pct: number; trailer_playback_id: string | null;
}
interface Section {
  id: string; product_id: string; title: string; position: number; is_published: boolean;
}
interface Lesson {
  id: string; section_id: string; product_id: string; title: string;
  lesson_type: string; mux_playback_id: string | null; mux_upload_id: string | null;
  duration_secs: number | null; position: number; drip_type: string;
  drip_value: number | null; is_free_preview: boolean; is_published: boolean;
  description: string | null;
}
interface Cohort {
  id: string; product_id: string; name: string; starts_at: string;
  ends_at: string | null; max_seats: number | null; status: string;
  is_default: boolean; enrolled_count: number;
}
interface Enrollment {
  id: string; product_id: string; status: string; enrolled_at: string;
  workspace_id: string; access_type: string;
  workspaces: { name: string } | null;
  academy_cohorts: { name: string } | null;
}
interface DiscountCode {
  id: string; code: string; product_id: string | null; discount_type: string;
  discount_value: number; max_uses: number | null; uses_count: number;
  expires_at: string | null; is_active: boolean;
}
interface WorkspaceOption {
  id: string; name: string;
}

type Tab = "builder" | "cohorts" | "enrollments" | "codes" | "products" | "access";
type UploadState = "idle" | "uploading" | "processing" | "done" | "error";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) { return `₦${n.toLocaleString("en-NG")}`; }
function dur(s: number | null) {
  if (!s) return "—";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminAcademyPage() {
  const [tab, setTab]               = useState<Tab>("builder");
  const [products, setProducts]     = useState<Product[]>([]);
  const [sections, setSections]     = useState<Section[]>([]);
  const [lessons, setLessons]       = useState<Lesson[]>([]);
  const [cohorts, setCohorts]       = useState<Cohort[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [codes, setCodes]           = useState<DiscountCode[]>([]);
  const [loading, setLoading]       = useState(true);
  const [msg, setMsg]               = useState<{ text: string; ok: boolean } | null>(null);

  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [selectedLesson,  setSelectedLesson]  = useState<Lesson | null>(null);
  const [editingLesson,   setEditingLesson]   = useState<Partial<Lesson>>({});

  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadPct,   setUploadPct]   = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Access / coming-soon state ─────────────────────────────────────────────
  const [comingSoon, setComingSoon]         = useState<{ enabled: boolean; beta_workspaces: string[] }>({ enabled: true, beta_workspaces: [] });
  const [allWorkspaces, setAllWorkspaces]   = useState<WorkspaceOption[]>([]);
  const [wsSearch,     setWsSearch]         = useState("");
  const [accessSaving, setAccessSaving]     = useState(false);

  const notify = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  };

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [adminRes, codesRes, accessRes, wsRes] = await Promise.all([
        fetch("/api/admin/academy").then(r => r.json()),
        fetch("/api/admin/academy/discount-codes").then(r => r.json()),
        fetch("/api/admin/academy/coming-soon").then(r => r.json()),
        fetch("/api/admin/workspaces?page=1&per_page=200").then(r => r.json()),
      ]);
      setProducts(adminRes.products ?? []);
      setCohorts(adminRes.cohorts ?? []);
      setEnrollments(adminRes.enrollments ?? []);
      setCodes(codesRes.codes ?? []);
      if (accessRes.setting) setComingSoon(accessRes.setting);
      if (wsRes.workspaces) setAllWorkspaces(wsRes.workspaces.map((w: WorkspaceOption) => ({ id: w.id, name: w.name })));

      if (!selectedProduct && adminRes.products?.length) {
        setSelectedProduct(adminRes.products[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedProduct]);

  useEffect(() => { load(); }, []);

  // ── Access actions ─────────────────────────────────────────────────────────

  async function saveComingSoon(patch: Partial<typeof comingSoon>) {
    setAccessSaving(true);
    const next = { ...comingSoon, ...patch };
    setComingSoon(next);
    const res = await fetch("/api/admin/academy/coming-soon", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).then(r => r.json());
    if (res.setting) { setComingSoon(res.setting); notify("Access settings saved"); }
    else notify(res.error ?? "Error", false);
    setAccessSaving(false);
  }

  function addBetaWorkspace(id: string) {
    const list = comingSoon.beta_workspaces ?? [];
    if (!id || list.includes(id)) return;
    saveComingSoon({ beta_workspaces: [...list, id] });
    setWsSearch("");
  }

  function removeBetaWorkspace(id: string) {
    saveComingSoon({ beta_workspaces: (comingSoon.beta_workspaces ?? []).filter(w => w !== id) });
  }

  // Load sections+lessons when product changes
  useEffect(() => {
    if (!selectedProduct) return;
    Promise.all([
      fetch(`/api/admin/academy/sections?product_id=${selectedProduct}`).then(r => r.json()),
      fetch(`/api/admin/academy/lessons?product_id=${selectedProduct}`).then(r => r.json()),
    ]).then(([sRes, lRes]) => {
      setSections(sRes.sections ?? []);
      setLessons(lRes.lessons ?? []);
      setSelectedSection(sRes.sections?.[0]?.id ?? "");
      setSelectedLesson(null);
    });
  }, [selectedProduct]);

  // ── Section actions ───────────────────────────────────────────────────────

  async function addSection() {
    const title = prompt("Section title:");
    if (!title) return;
    const res = await fetch("/api/admin/academy/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: selectedProduct, title }),
    }).then(r => r.json());
    if (res.section) {
      setSections(s => [...s, res.section]);
      setSelectedSection(res.section.id);
      notify("Section created");
    } else notify(res.error ?? "Error", false);
  }

  async function deleteSection(id: string) {
    if (!confirm("Delete section and all its lessons?")) return;
    const res = await fetch(`/api/admin/academy/sections?id=${id}`, { method: "DELETE" }).then(r => r.json());
    if (res.ok) {
      setSections(s => s.filter(x => x.id !== id));
      setLessons(l => l.filter(x => x.section_id !== id));
      if (selectedSection === id) setSelectedSection(sections[0]?.id ?? "");
      notify("Section deleted");
    } else notify(res.error ?? "Error", false);
  }

  // ── Lesson actions ────────────────────────────────────────────────────────

  async function addLesson(type = "video") {
    if (!selectedSection) return notify("Select a section first", false);
    const title = prompt(`Lesson title (${type}):`);
    if (!title) return;
    const res = await fetch("/api/admin/academy/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_id: selectedSection, product_id: selectedProduct, title, lesson_type: type }),
    }).then(r => r.json());
    if (res.lesson) {
      setLessons(l => [...l, res.lesson]);
      openLesson(res.lesson);
      notify("Lesson created");
    } else notify(res.error ?? "Error", false);
  }

  function openLesson(lesson: Lesson) {
    setSelectedLesson(lesson);
    setEditingLesson({ ...lesson });
    setUploadState("idle");
    setUploadPct(0);
  }

  async function saveLesson() {
    if (!selectedLesson) return;
    const res = await fetch(`/api/admin/academy/lessons/${selectedLesson.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingLesson),
    }).then(r => r.json());
    if (res.lesson) {
      setLessons(l => l.map(x => x.id === res.lesson.id ? res.lesson : x));
      setSelectedLesson(res.lesson);
      setEditingLesson({ ...res.lesson });
      notify("Lesson saved");
    } else notify(res.error ?? "Error", false);
  }

  async function deleteLesson(id: string) {
    if (!confirm("Delete this lesson?")) return;
    const res = await fetch(`/api/admin/academy/lessons?id=${id}`, { method: "DELETE" }).then(r => r.json());
    if (res.ok) {
      setLessons(l => l.filter(x => x.id !== id));
      if (selectedLesson?.id === id) { setSelectedLesson(null); setEditingLesson({}); }
      notify("Lesson deleted");
    } else notify(res.error ?? "Error", false);
  }

  // ── Mux video upload ─────────────────────────────────────────────────────

  async function handleVideoUpload(file: File) {
    if (!selectedLesson) return;
    setUploadState("uploading");
    setUploadPct(0);

    const { upload_id, url } = await fetch(`/api/admin/academy/lessons/${selectedLesson.id}/upload-url`, { method: "POST" })
      .then(r => r.json());

    if (!url) { setUploadState("error"); return; }

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = e => { if (e.lengthComputable) setUploadPct(Math.round(e.loaded / e.total * 100)); };
    xhr.onload = async () => {
      setUploadPct(100);
      setUploadState("processing");
      // Poll until Mux processes the asset
      let attempts = 0;
      const poll = async () => {
        attempts++;
        const res = await fetch(`/api/admin/academy/lessons/${selectedLesson.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mux_upload_id: upload_id }),
        }).then(r => r.json());
        if (res.lesson?.mux_playback_id) {
          setLessons(l => l.map(x => x.id === res.lesson.id ? res.lesson : x));
          setSelectedLesson(res.lesson);
          setEditingLesson({ ...res.lesson });
          setUploadState("done");
        } else if (attempts < 20) {
          setTimeout(poll, 5000);
        } else {
          setUploadState("error");
        }
      };
      setTimeout(poll, 5000);
    };
    xhr.onerror = () => setUploadState("error");
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  }

  // ── Cohort actions ────────────────────────────────────────────────────────

  const [cohortForm, setCohortForm] = useState({ product_id: "", name: "", starts_at: "", ends_at: "", max_seats: "", is_default: false });

  async function createCohort(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/academy/cohorts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...cohortForm,
        max_seats: cohortForm.max_seats ? parseInt(cohortForm.max_seats) : null,
        ends_at:   cohortForm.ends_at || null,
      }),
    }).then(r => r.json());
    if (res.cohort) { setCohorts(c => [res.cohort, ...c]); setCohortForm({ product_id: "", name: "", starts_at: "", ends_at: "", max_seats: "", is_default: false }); notify("Cohort created"); }
    else notify(res.error ?? "Error", false);
  }

  async function updateCohortStatus(id: string, status: string) {
    const res = await fetch("/api/admin/academy/cohorts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    }).then(r => r.json());
    if (res.cohort) { setCohorts(c => c.map(x => x.id === id ? res.cohort : x)); notify("Cohort updated"); }
    else notify(res.error ?? "Error", false);
  }

  // ── Discount code actions ─────────────────────────────────────────────────

  const [codeForm, setCodeForm] = useState({ code: "", product_id: "", discount_type: "percent", discount_value: "", max_uses: "", expires_at: "" });

  async function createCode(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/academy/discount-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...codeForm,
        discount_value: parseInt(codeForm.discount_value),
        max_uses:       codeForm.max_uses ? parseInt(codeForm.max_uses) : null,
        expires_at:     codeForm.expires_at || null,
        product_id:     codeForm.product_id || null,
      }),
    }).then(r => r.json());
    if (res.code) { setCodes(c => [res.code, ...c]); setCodeForm({ code: "", product_id: "", discount_type: "percent", discount_value: "", max_uses: "", expires_at: "" }); notify("Code created"); }
    else notify(res.error ?? "Error", false);
  }

  async function toggleCode(id: string, is_active: boolean) {
    const res = await fetch("/api/admin/academy/discount-codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active }),
    }).then(r => r.json());
    if (res.code) setCodes(c => c.map(x => x.id === id ? res.code : x));
  }

  // ── Product settings ──────────────────────────────────────────────────────

  const [editProduct, setEditProduct] = useState<Partial<Product>>({});

  async function saveProduct() {
    const { id, ...updates } = editProduct as Product;
    if (!id) return;
    const res = await fetch("/api/admin/academy/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    }).then(r => r.json());
    if (res.product) { setProducts(p => p.map(x => x.id === id ? res.product : x)); notify("Product saved"); }
    else notify(res.error ?? "Error", false);
  }

  // ─────────────────────────────────────────────────────────────────────────

  const sectionLessons = lessons.filter(l => l.section_id === selectedSection);
  const productSections = sections.filter(s => s.product_id === selectedProduct);

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>;

  const TABS: { key: Tab; label: string }[] = [
    { key: "builder",     label: "Course Builder" },
    { key: "cohorts",     label: "Cohorts" },
    { key: "enrollments", label: "Enrollments" },
    { key: "codes",       label: "Discount Codes" },
    { key: "products",    label: "Product Settings" },
    { key: "access",      label: comingSoon.enabled ? "🔒 Coming Soon ON" : "✅ Live" },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Academy</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {enrollments.length} enrollments · {cohorts.length} cohorts · {products.length} products
          </p>
        </div>
        {msg && (
          <div className={`text-sm px-4 py-2 rounded-lg ${msg.ok ? "bg-emerald-900/60 text-emerald-300" : "bg-red-900/60 text-red-300"}`}>
            {msg.text}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 px-6">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? "border-indigo-500 text-indigo-400" : "border-transparent text-gray-400 hover:text-gray-200"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">

        {/* ── COURSE BUILDER ─────────────────────────────────────────────── */}
        {tab === "builder" && (
          <div className="flex gap-0 h-[calc(100vh-180px)]">

            {/* Left: Section + Lesson tree */}
            <div className="w-72 border-r border-gray-800 flex flex-col">
              {/* Product selector */}
              <div className="p-4 border-b border-gray-800">
                <label className="text-xs text-gray-400 mb-1 block">Course</label>
                <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm">
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* Sections */}
              <div className="flex-1 overflow-y-auto">
                {productSections.map(sec => (
                  <div key={sec.id}>
                    <div
                      onClick={() => setSelectedSection(sec.id)}
                      className={`flex items-center justify-between px-4 py-2.5 cursor-pointer group ${
                        selectedSection === sec.id ? "bg-gray-800" : "hover:bg-gray-900"
                      }`}>
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 truncate">
                        {sec.title}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); deleteSection(sec.id); }}
                        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs px-1">
                        ✕
                      </button>
                    </div>
                    {selectedSection === sec.id && lessons.filter(l => l.section_id === sec.id).map(lesson => (
                      <div key={lesson.id}
                        onClick={() => openLesson(lesson)}
                        className={`flex items-center gap-2 pl-8 pr-4 py-2 cursor-pointer text-sm group ${
                          selectedLesson?.id === lesson.id ? "bg-indigo-900/40 text-indigo-300" : "hover:bg-gray-900 text-gray-300"
                        }`}>
                        <span className="text-xs opacity-50">
                          {lesson.lesson_type === "video" ? "▶" : lesson.lesson_type === "text" ? "📝" : lesson.lesson_type === "live" ? "📡" : "📋"}
                        </span>
                        <span className="truncate flex-1">{lesson.title}</span>
                        {!lesson.is_published && <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1 rounded">draft</span>}
                        {lesson.mux_playback_id && <span className="text-[10px] text-emerald-500">●</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Add buttons */}
              <div className="p-4 border-t border-gray-800 space-y-2">
                <button onClick={addSection}
                  className="w-full text-xs bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded text-gray-300">
                  + Add Section
                </button>
                <div className="flex gap-1">
                  {(["video","text","live","assignment"] as const).map(t => (
                    <button key={t} onClick={() => addLesson(t)}
                      className="flex-1 text-[10px] bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded text-gray-400">
                      +{t[0].toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Lesson editor */}
            <div className="flex-1 overflow-y-auto">
              {!selectedLesson ? (
                <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                  Select a lesson to edit, or create one
                </div>
              ) : (
                <div className="p-6 max-w-2xl">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold">{selectedLesson.title}</h2>
                    <div className="flex gap-2">
                      <button onClick={() => deleteLesson(selectedLesson.id)}
                        className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded border border-red-800">
                        Delete
                      </button>
                      <button onClick={saveLesson}
                        className="text-xs bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 rounded font-medium">
                        Save
                      </button>
                    </div>
                  </div>

                  <div className="space-y-5">
                    {/* Title */}
                    <div>
                      <label className="label-xs">Title</label>
                      <input value={editingLesson.title ?? ""}
                        onChange={e => setEditingLesson(l => ({ ...l, title: e.target.value }))}
                        className="input-base w-full" />
                    </div>

                    {/* Type + drip */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label-xs">Type</label>
                        <select value={editingLesson.lesson_type ?? "video"}
                          onChange={e => setEditingLesson(l => ({ ...l, lesson_type: e.target.value }))}
                          className="input-base w-full">
                          <option value="video">Video</option>
                          <option value="text">Text / Article</option>
                          <option value="live">Live Session</option>
                          <option value="assignment">Assignment</option>
                        </select>
                      </div>
                      <div>
                        <label className="label-xs">Drip</label>
                        <select value={editingLesson.drip_type ?? "immediate"}
                          onChange={e => setEditingLesson(l => ({ ...l, drip_type: e.target.value }))}
                          className="input-base w-full">
                          <option value="immediate">Immediate</option>
                          <option value="days_after_enrollment">Days after enrollment</option>
                          <option value="days_after_cohort_start">Days after cohort start</option>
                          <option value="on_date">Specific date</option>
                          <option value="manual">Manual unlock</option>
                        </select>
                      </div>
                    </div>

                    {/* Drip value */}
                    {(editingLesson.drip_type === "days_after_enrollment" || editingLesson.drip_type === "days_after_cohort_start") && (
                      <div>
                        <label className="label-xs">Unlock after (days)</label>
                        <input type="number" min={0} value={editingLesson.drip_value ?? 0}
                          onChange={e => setEditingLesson(l => ({ ...l, drip_value: parseInt(e.target.value) || 0 }))}
                          className="input-base w-32" />
                      </div>
                    )}
                    {editingLesson.drip_type === "on_date" && (
                      <div>
                        <label className="label-xs">Unlock date</label>
                        <input type="datetime-local" value={editingLesson.drip_date?.slice(0, 16) ?? ""}
                          onChange={e => setEditingLesson(l => ({ ...l, drip_date: e.target.value }))}
                          className="input-base w-full" />
                      </div>
                    )}

                    {/* Description */}
                    <div>
                      <label className="label-xs">Description / lesson brief</label>
                      <textarea rows={4} value={editingLesson.description ?? ""}
                        onChange={e => setEditingLesson(l => ({ ...l, description: e.target.value }))}
                        className="input-base w-full resize-none" />
                    </div>

                    {/* Toggles */}
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={editingLesson.is_free_preview ?? false}
                          onChange={e => setEditingLesson(l => ({ ...l, is_free_preview: e.target.checked }))}
                          className="rounded" />
                        <span className="text-sm text-gray-300">Free preview</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={editingLesson.is_published ?? false}
                          onChange={e => setEditingLesson(l => ({ ...l, is_published: e.target.checked }))}
                          className="rounded" />
                        <span className="text-sm text-gray-300">Published</span>
                      </label>
                    </div>

                    {/* Video upload (video lessons only) */}
                    {(editingLesson.lesson_type ?? selectedLesson.lesson_type) === "video" && (
                      <div className="border border-dashed border-gray-700 rounded-xl p-5">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-gray-300">Video</span>
                          {selectedLesson.mux_playback_id && (
                            <span className="text-xs text-emerald-400 flex items-center gap-1">
                              ● Ready · {dur(selectedLesson.duration_secs)}
                            </span>
                          )}
                        </div>

                        {uploadState === "idle" && (
                          <>
                            <input ref={fileRef} type="file" accept="video/*" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f); }} />
                            <button onClick={() => fileRef.current?.click()}
                              className="w-full text-sm bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-3 text-gray-300">
                              {selectedLesson.mux_playback_id ? "Replace video" : "Upload video"}
                            </button>
                          </>
                        )}
                        {uploadState === "uploading" && (
                          <div>
                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                              <span>Uploading…</span><span>{uploadPct}%</span>
                            </div>
                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${uploadPct}%` }} />
                            </div>
                          </div>
                        )}
                        {uploadState === "processing" && (
                          <p className="text-sm text-yellow-400">Processing video… this may take a few minutes.</p>
                        )}
                        {uploadState === "done" && (
                          <p className="text-sm text-emerald-400">✓ Video ready! Playback ID saved.</p>
                        )}
                        {uploadState === "error" && (
                          <p className="text-sm text-red-400">Upload failed. Try again.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── COHORTS ──────────────────────────────────────────────────────── */}
        {tab === "cohorts" && (
          <div className="max-w-4xl space-y-6">
            <form onSubmit={createCohort} className="bg-gray-900 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold">Create Cohort</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-xs">Course</label>
                  <select value={cohortForm.product_id} onChange={e => setCohortForm(f => ({ ...f, product_id: e.target.value }))} className="input-base w-full" required>
                    <option value="">Select…</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-xs">Cohort name</label>
                  <input value={cohortForm.name} onChange={e => setCohortForm(f => ({ ...f, name: e.target.value }))} className="input-base w-full" placeholder="e.g. June 2026 Challenge" required />
                </div>
                <div>
                  <label className="label-xs">Starts at</label>
                  <input type="datetime-local" value={cohortForm.starts_at} onChange={e => setCohortForm(f => ({ ...f, starts_at: e.target.value }))} className="input-base w-full" required />
                </div>
                <div>
                  <label className="label-xs">Ends at (optional)</label>
                  <input type="datetime-local" value={cohortForm.ends_at} onChange={e => setCohortForm(f => ({ ...f, ends_at: e.target.value }))} className="input-base w-full" />
                </div>
                <div>
                  <label className="label-xs">Max seats (blank = unlimited)</label>
                  <input type="number" value={cohortForm.max_seats} onChange={e => setCohortForm(f => ({ ...f, max_seats: e.target.value }))} className="input-base w-full" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input type="checkbox" checked={cohortForm.is_default} onChange={e => setCohortForm(f => ({ ...f, is_default: e.target.checked }))} className="rounded" />
                    <span className="text-sm text-gray-300">Auto-assign new enrollments</span>
                  </label>
                </div>
              </div>
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 px-5 py-2 rounded-lg text-sm font-medium">Create Cohort</button>
            </form>

            <div className="bg-gray-900 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="th-left">Cohort</th>
                    <th className="th-left">Course</th>
                    <th className="th-left">Starts</th>
                    <th className="th-left">Seats</th>
                    <th className="th-left">Status</th>
                    <th className="th-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map(c => (
                    <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="td">{c.name}{c.is_default && <span className="ml-2 text-[10px] bg-indigo-900/40 text-indigo-400 px-1 rounded">default</span>}</td>
                      <td className="td text-gray-400">{products.find(p => p.id === c.product_id)?.name}</td>
                      <td className="td text-gray-400">{new Date(c.starts_at).toLocaleDateString()}</td>
                      <td className="td text-gray-400">{c.enrolled_count}{c.max_seats ? ` / ${c.max_seats}` : ""}</td>
                      <td className="td">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          c.status === "active" ? "bg-emerald-900/40 text-emerald-400" :
                          c.status === "upcoming" ? "bg-blue-900/40 text-blue-400" :
                          "bg-gray-800 text-gray-500"
                        }`}>{c.status}</span>
                      </td>
                      <td className="td">
                        <div className="flex gap-2">
                          {c.status === "upcoming" && <button onClick={() => updateCohortStatus(c.id, "active")} className="text-xs text-emerald-400 hover:text-emerald-300">Activate</button>}
                          {c.status === "active"   && <button onClick={() => updateCohortStatus(c.id, "ended")}  className="text-xs text-gray-400 hover:text-gray-300">End</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ENROLLMENTS ──────────────────────────────────────────────────── */}
        {tab === "enrollments" && (
          <div className="max-w-5xl">
            <div className="bg-gray-900 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-4">
                <h3 className="font-semibold flex-1">All Enrollments</h3>
                <span className="text-xs text-gray-400">{enrollments.length} total</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="th-left">Workspace</th>
                    <th className="th-left">Course</th>
                    <th className="th-left">Cohort</th>
                    <th className="th-left">Type</th>
                    <th className="th-left">Status</th>
                    <th className="th-left">Enrolled</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map(e => (
                    <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="td font-medium">{e.workspaces?.name ?? e.workspace_id.slice(0, 8)}</td>
                      <td className="td text-gray-400">{products.find(p => p.id === e.product_id)?.name ?? e.product_id}</td>
                      <td className="td text-gray-400">{e.academy_cohorts?.name ?? "—"}</td>
                      <td className="td">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          e.access_type === "paid" ? "bg-emerald-900/30 text-emerald-400" :
                          "bg-yellow-900/30 text-yellow-400"
                        }`}>{e.access_type}</span>
                      </td>
                      <td className="td">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          e.status === "active" ? "bg-blue-900/30 text-blue-400" :
                          e.status === "completed" ? "bg-emerald-900/30 text-emerald-400" :
                          "bg-gray-800 text-gray-500"
                        }`}>{e.status}</span>
                      </td>
                      <td className="td text-gray-500 text-xs">{new Date(e.enrolled_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── DISCOUNT CODES ────────────────────────────────────────────────── */}
        {tab === "codes" && (
          <div className="max-w-3xl space-y-6">
            <form onSubmit={createCode} className="bg-gray-900 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold">Create Discount Code</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-xs">Code (blank = auto-generate)</label>
                  <input value={codeForm.code} onChange={e => setCodeForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="input-base w-full uppercase" placeholder="e.g. LAUNCH50" />
                </div>
                <div>
                  <label className="label-xs">Course (blank = all)</label>
                  <select value={codeForm.product_id} onChange={e => setCodeForm(f => ({ ...f, product_id: e.target.value }))} className="input-base w-full">
                    <option value="">All courses</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-xs">Discount type</label>
                  <select value={codeForm.discount_type} onChange={e => setCodeForm(f => ({ ...f, discount_type: e.target.value }))} className="input-base w-full">
                    <option value="percent">Percent (%)</option>
                    <option value="fixed_ngn">Fixed (₦)</option>
                  </select>
                </div>
                <div>
                  <label className="label-xs">Value ({codeForm.discount_type === "percent" ? "%" : "₦"})</label>
                  <input type="number" value={codeForm.discount_value} onChange={e => setCodeForm(f => ({ ...f, discount_value: e.target.value }))} className="input-base w-full" required />
                </div>
                <div>
                  <label className="label-xs">Max uses (blank = unlimited)</label>
                  <input type="number" value={codeForm.max_uses} onChange={e => setCodeForm(f => ({ ...f, max_uses: e.target.value }))} className="input-base w-full" />
                </div>
                <div>
                  <label className="label-xs">Expires at</label>
                  <input type="datetime-local" value={codeForm.expires_at} onChange={e => setCodeForm(f => ({ ...f, expires_at: e.target.value }))} className="input-base w-full" />
                </div>
              </div>
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 px-5 py-2 rounded-lg text-sm font-medium">Create Code</button>
            </form>

            <div className="bg-gray-900 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="th-left">Code</th>
                    <th className="th-left">Discount</th>
                    <th className="th-left">Course</th>
                    <th className="th-left">Uses</th>
                    <th className="th-left">Expires</th>
                    <th className="th-left">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map(c => (
                    <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="td font-mono font-semibold text-indigo-300">{c.code}</td>
                      <td className="td">{c.discount_value}{c.discount_type === "percent" ? "%" : "₦"}</td>
                      <td className="td text-gray-400">{c.product_id ? products.find(p => p.id === c.product_id)?.name : "All"}</td>
                      <td className="td text-gray-400">{c.uses_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
                      <td className="td text-gray-400">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}</td>
                      <td className="td">
                        <button onClick={() => toggleCode(c.id, !c.is_active)}
                          className={`text-xs px-2 py-0.5 rounded-full ${c.is_active ? "bg-emerald-900/40 text-emerald-400" : "bg-gray-800 text-gray-500"}`}>
                          {c.is_active ? "Active" : "Off"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PRODUCT SETTINGS ─────────────────────────────────────────────── */}
        {tab === "products" && (
          <div className="max-w-2xl space-y-4">
            {products.map(p => (
              <div key={p.id} className="bg-gray-900 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">{p.name}</h3>
                  <button onClick={() => { setEditProduct(editProduct.id === p.id ? {} : { ...p }); }}
                    className="text-xs text-gray-400 hover:text-gray-200">
                    {editProduct.id === p.id ? "Cancel" : "Edit"}
                  </button>
                </div>

                {editProduct.id === p.id ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label-xs">Price (₦)</label>
                        <input type="number" value={editProduct.price_ngn ?? 0}
                          onChange={e => setEditProduct(ep => ({ ...ep, price_ngn: parseInt(e.target.value) || 0 }))}
                          className="input-base w-full" />
                      </div>
                      <div>
                        <label className="label-xs">Compare price (₦)</label>
                        <input type="number" value={editProduct.compare_price_ngn ?? ""}
                          onChange={e => setEditProduct(ep => ({ ...ep, compare_price_ngn: e.target.value ? parseInt(e.target.value) : null }))}
                          className="input-base w-full" />
                      </div>
                      <div>
                        <label className="label-xs">Credits granted on enroll</label>
                        <input type="number" value={editProduct.credits_grant ?? 0}
                          onChange={e => setEditProduct(ep => ({ ...ep, credits_grant: parseInt(e.target.value) || 0 }))}
                          className="input-base w-full" />
                      </div>
                      <div>
                        <label className="label-xs">Leadash access (months)</label>
                        <input type="number" value={editProduct.leadash_months ?? 0}
                          onChange={e => setEditProduct(ep => ({ ...ep, leadash_months: parseInt(e.target.value) || 0 }))}
                          className="input-base w-full" />
                      </div>
                      <div>
                        <label className="label-xs">Completion threshold (%)</label>
                        <input type="number" min={1} max={100} value={editProduct.completion_threshold_pct ?? 80}
                          onChange={e => setEditProduct(ep => ({ ...ep, completion_threshold_pct: parseInt(e.target.value) || 80 }))}
                          className="input-base w-full" />
                      </div>
                    </div>
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={editProduct.is_active ?? true}
                          onChange={e => setEditProduct(ep => ({ ...ep, is_active: e.target.checked }))} />
                        <span className="text-sm text-gray-300">Active</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={editProduct.is_published ?? true}
                          onChange={e => setEditProduct(ep => ({ ...ep, is_published: e.target.checked }))} />
                        <span className="text-sm text-gray-300">Published</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={editProduct.certificate_enabled ?? true}
                          onChange={e => setEditProduct(ep => ({ ...ep, certificate_enabled: e.target.checked }))} />
                        <span className="text-sm text-gray-300">Certificates</span>
                      </label>
                    </div>
                    <button onClick={saveProduct}
                      className="bg-indigo-600 hover:bg-indigo-500 px-5 py-2 rounded-lg text-sm font-medium">
                      Save Changes
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4 text-sm text-gray-400">
                    <div><span className="text-gray-600 text-xs">Price</span><br />{fmt(p.price_ngn)}</div>
                    <div><span className="text-gray-600 text-xs">Credits</span><br />{p.credits_grant.toLocaleString()}</div>
                    <div><span className="text-gray-600 text-xs">Access</span><br />{p.leadash_months}mo</div>
                    <div><span className="text-gray-600 text-xs">Threshold</span><br />{p.completion_threshold_pct}%</div>
                    <div><span className="text-gray-600 text-xs">Status</span><br />{p.is_published ? "Published" : "Draft"}</div>
                    <div><span className="text-gray-600 text-xs">Certificate</span><br />{p.certificate_enabled ? "Yes" : "No"}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── ACCESS / COMING SOON ─────────────────────────────────────────── */}
        {tab === "access" && (
          <div className="max-w-xl space-y-6">

            {/* Global toggle */}
            <div className="bg-gray-900 rounded-xl p-5">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h3 className="font-semibold text-white">Coming Soon Mode</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    When ON, all users see the "Coming Soon" overlay instead of the Academy.
                    Beta workspaces below bypass it.
                  </p>
                </div>
                <button
                  onClick={() => saveComingSoon({ enabled: !comingSoon.enabled })}
                  disabled={accessSaving}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                    comingSoon.enabled ? "bg-orange-500" : "bg-emerald-500"
                  }`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    comingSoon.enabled ? "translate-x-1" : "translate-x-6"
                  }`} />
                </button>
              </div>

              <div className={`mt-4 flex items-center gap-2 text-sm font-medium ${comingSoon.enabled ? "text-orange-400" : "text-emerald-400"}`}>
                {comingSoon.enabled
                  ? "🔒 Academy is hidden — Coming Soon overlay is active"
                  : "✅ Academy is live — all users can access it"}
              </div>
            </div>

            {/* Beta workspaces */}
            <div className="bg-gray-900 rounded-xl p-5">
              <h3 className="font-semibold text-white mb-1">Beta Access</h3>
              <p className="text-xs text-gray-400 mb-4">
                These workspaces bypass the Coming Soon overlay regardless of the global toggle.
                You can exempt multiple workspaces.
              </p>

              {/* Workspace selector — shows all, filters as you type */}
              {(() => {
                const betaList = comingSoon.beta_workspaces ?? [];
                const filtered = allWorkspaces.filter(
                  w => !betaList.includes(w.id) &&
                    (!wsSearch ||
                      w.name.toLowerCase().includes(wsSearch.toLowerCase()) ||
                      w.id.toLowerCase().includes(wsSearch.toLowerCase()))
                );
                return (
                  <div className="mb-4 border border-gray-700 rounded-lg overflow-hidden">
                    <div className="bg-gray-800 px-3 py-2 border-b border-gray-700">
                      <input
                        value={wsSearch}
                        onChange={e => setWsSearch(e.target.value)}
                        placeholder="Filter workspaces…"
                        className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none"
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      {filtered.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-gray-500">
                          {allWorkspaces.length === 0 ? "Loading…" : "No matching workspaces"}
                        </p>
                      ) : (
                        filtered.slice(0, 50).map(w => (
                          <button
                            key={w.id}
                            onClick={() => addBetaWorkspace(w.id)}
                            disabled={accessSaving}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-700/60 flex items-center justify-between gap-3 border-b border-gray-800 last:border-0">
                            <span className="text-gray-200 truncate">{w.name}</span>
                            <span className="text-gray-500 text-xs font-mono shrink-0">{w.id.slice(0, 8)}…</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Exempted list */}
              {(comingSoon.beta_workspaces ?? []).length === 0 ? (
                <p className="text-xs text-gray-600">No workspaces exempted yet.</p>
              ) : (
                <div className="space-y-2">
                  {(comingSoon.beta_workspaces ?? []).map(id => {
                    const ws = allWorkspaces.find(w => w.id === id);
                    return (
                      <div key={id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2.5">
                        <div>
                          <p className="text-sm text-gray-200">{ws?.name ?? "Unknown workspace"}</p>
                          <p className="font-mono text-[10px] text-gray-500">{id}</p>
                        </div>
                        <button
                          onClick={() => removeBetaWorkspace(id)}
                          className="text-gray-500 hover:text-red-400 text-xs ml-4 shrink-0">
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

      {/* Global CSS helpers (inline so no separate file needed) */}
      <style jsx global>{`
        .label-xs { display: block; font-size: 11px; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; }
        .input-base { background: #111827; border: 1px solid #374151; border-radius: 6px; padding: 7px 10px; font-size: 13px; color: #e5e7eb; outline: none; }
        .input-base:focus { border-color: #6366f1; }
        .th-left { padding: 10px 16px; text-align: left; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
        .td { padding: 10px 16px; }
      `}</style>
    </div>
  );
}
