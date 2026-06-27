"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import LessonContentEditor from "./LessonContentEditor";
import CourseBannerEditor from "./CourseBannerEditor";
import SectionSettingsEditor from "./SectionSettingsEditor";
import SortableList, { DragHandle } from "./SortableList";
import { useAcademyDialog } from "./AcademyDialog";
import ChallengeBuilder from "./ChallengeBuilder";
import ChallengeFunnelMap from "./ChallengeFunnelMap";
import ChallengeAnalytics from "./ChallengeAnalytics";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  PlusSignIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  PlayCircleIcon,
  DocumentValidationIcon,
  Calendar03Icon,
  PencilEdit02Icon,
  Delete02Icon,
  Tag01Icon,
  UserMultipleIcon,
  Settings02Icon,
  ImageAdd02Icon,
  BookOpen02Icon,
  CreditCardIcon,
  LockedIcon,
  GlobeIcon,
  Video01Icon,
  GitBranchIcon,
  ChartBarLineIcon,
} from "@hugeicons/core-free-icons";

interface ChallengeConfig {
  tagline?: string;
  duration_days?: number;
  cadence?: "daily" | "weekly";
  grace_days?: number;
  catchup_enabled?: boolean;
  leaderboard_enabled?: boolean;
  points_board_enabled?: boolean;
  earnings_board_enabled?: boolean;
  earnings_require_proof?: boolean;
  earnings_reset?: "all_time" | "weekly" | "daily";
  auto_advance_offer?: {
    enabled: boolean; trigger: string; window_hours: number;
    target_product_id?: string; discount_type: string; discount_value: number;
  };
  reminders?: {
    email: boolean; whatsapp: boolean;
    daily_unlock_time: string; timezone: string; nudge_missed: boolean;
  };
  [key: string]: unknown;
}

interface Product {
  id: string; slug: string; name: string; price_ngn: number;
  compare_price_ngn: number | null; credits_grant: number; leadash_months: number;
  is_active: boolean; is_published: boolean; certificate_enabled: boolean;
  completion_threshold_pct: number; trailer_playback_id: string | null;
  product_type?: "course" | "challenge";
  challenge_config?: ChallengeConfig | null;
}
interface Section {
  id: string; product_id: string; title: string; position: number; is_published: boolean;
}
interface Lesson {
  id: string; section_id: string; product_id: string; title: string;
  lesson_type: string; mux_playback_id: string | null; mux_upload_id: string | null;
  duration_secs: number | null; position: number; drip_type: string;
  drip_value: number | null; drip_date: string | null; is_free_preview: boolean; is_published: boolean;
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
interface WorkspaceOption { id: string; name: string; }

type TopNav = "courses" | "funnels" | "cohorts" | "enrollments" | "codes" | "access";
type CourseView = "curriculum" | "details" | "pricing" | "settings";
type ChallengeView = "builder" | "analytics";
type UploadState = "idle" | "uploading" | "processing" | "done" | "error";

function fmt(n: number) { return `₦${n.toLocaleString("en-NG")}`; }
function dur(s: number | null) {
  if (!s) return "—";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const LESSON_ICON: Record<string, typeof PlayCircleIcon> = {
  video:      PlayCircleIcon,
  text:       DocumentValidationIcon,
  live:       Video01Icon,
  assignment: BookOpen02Icon,
};

export default function AdminAcademyPage() {
  const [top, setTop]                 = useState<TopNav>("courses");
  const [products, setProducts]       = useState<Product[]>([]);
  const [sections, setSections]       = useState<Section[]>([]);
  const [lessons, setLessons]         = useState<Lesson[]>([]);
  const [cohorts, setCohorts]         = useState<Cohort[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [codes, setCodes]             = useState<DiscountCode[]>([]);
  const [loading, setLoading]         = useState(true);
  const [msg, setMsg]                 = useState<{ text: string; ok: boolean } | null>(null);

  const [openProduct,    setOpenProduct]    = useState<string | null>(null);
  const [courseView,     setCourseView]     = useState<CourseView>("curriculum");
  const [challengeView,  setChallengeView]  = useState<ChallengeView>("builder");
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [selectedLesson,  setSelectedLesson]  = useState<Lesson | null>(null);
  const [editingLesson,   setEditingLesson]   = useState<Partial<Lesson>>({});

  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadPct,   setUploadPct]   = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const [comingSoon, setComingSoon]         = useState<{ enabled: boolean; beta_workspaces: string[] } | null>(null);
  const [allWorkspaces, setAllWorkspaces]   = useState<WorkspaceOption[]>([]);
  const [wsSearch,     setWsSearch]         = useState("");
  const [accessSaving, setAccessSaving]     = useState(false);

  const notify = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  };

  const dialog = useAcademyDialog();

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [adminRes, codesRes, wsRes] = await Promise.all([
        fetch("/api/admin/academy", { signal }).then(r => r.json()),
        fetch("/api/admin/academy/discount-codes", { signal }).then(r => r.json()),
        fetch("/api/admin/workspaces?page=1&per_page=200", { signal }).then(r => r.json()),
      ]);
      if (signal?.aborted) return;
      setProducts(adminRes.products ?? []);
      setCohorts(adminRes.cohorts ?? []);
      setEnrollments(adminRes.enrollments ?? []);
      setCodes(codesRes.codes ?? []);
      if (wsRes.workspaces) setAllWorkspaces(wsRes.workspaces.map((w: WorkspaceOption) => ({ id: w.id, name: w.name })));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/admin/academy/coming-soon", { signal: ac.signal })
      .then(r => r.json())
      .then(d => { if (!ac.signal.aborted && typeof d.enabled === "boolean") setComingSoon(d); })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  async function createChallenge() {
    const name = window.prompt("Challenge name", "30-Day Challenge");
    if (!name) return;
    setCreatingChallenge(true);
    try {
      const res = await fetch("/api/admin/academy/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, product_type: "challenge" }),
      });
      const d = await res.json();
      if (!res.ok) { notify(d.error ?? "Failed to create challenge", false); return; }
      await load();
      setOpenProduct(d.product.id);
      setChallengeView("builder");
      notify("Challenge created");
    } catch {
      notify("Network error", false);
    } finally {
      setCreatingChallenge(false);
    }
  }

  async function saveProductFields(id: string, updates: Record<string, unknown>) {
    const res = await fetch("/api/admin/academy/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    const d = await res.json();
    if (!res.ok) { notify(d.error ?? "Save failed", false); throw new Error(d.error ?? "Save failed"); }
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...d.product } : p));
    notify("Saved");
  }

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [load]);

  async function saveComingSoon(next: { enabled: boolean; beta_workspaces: string[] }) {
    setAccessSaving(true);
    try {
      const res = await fetch("/api/admin/academy/coming-soon", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) { notify(data.error ?? "Save failed", false); return; }
      setComingSoon(data);
      notify("Saved");
    } catch {
      notify("Network error", false);
    } finally {
      setAccessSaving(false);
    }
  }

  function addBetaWorkspace(id: string) {
    if (!id || !comingSoon) return;
    const list = comingSoon.beta_workspaces;
    if (list.includes(id)) return;
    setWsSearch("");
    saveComingSoon({ ...comingSoon, beta_workspaces: [...list, id] });
  }

  function removeBetaWorkspace(id: string) {
    if (!comingSoon) return;
    saveComingSoon({ ...comingSoon, beta_workspaces: comingSoon.beta_workspaces.filter(w => w !== id) });
  }

  useEffect(() => {
    if (!openProduct) {
      setSections([]); setLessons([]); setSelectedSection(""); setSelectedLesson(null);
      return;
    }
    Promise.all([
      fetch(`/api/admin/academy/sections?product_id=${openProduct}`).then(r => r.json()),
      fetch(`/api/admin/academy/lessons?product_id=${openProduct}`).then(r => r.json()),
    ]).then(([sRes, lRes]) => {
      setSections(sRes.sections ?? []);
      setLessons(lRes.lessons ?? []);
      setSelectedSection(sRes.sections?.[0]?.id ?? "");
      setSelectedLesson(null);
    });
  }, [openProduct]);

  async function addSection() {
    if (!openProduct) return;
    const title = await dialog.askText("New section", { placeholder: "Section title" });
    if (!title) return;
    const res = await fetch("/api/admin/academy/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: openProduct, title }),
    }).then(r => r.json());
    if (res.section) {
      setSections(s => [...s, res.section]);
      setSelectedSection(res.section.id);
      notify("Section created");
    } else notify(res.error ?? "Error", false);
  }

  async function deleteSection(id: string) {
    const ok = await dialog.askConfirm("Delete section?", {
      body: "This also removes every lesson inside it. This action cannot be undone.",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/academy/sections?id=${id}`, { method: "DELETE" }).then(r => r.json());
    if (res.ok) {
      setSections(s => s.filter(x => x.id !== id));
      setLessons(l => l.filter(x => x.section_id !== id));
      if (selectedSection === id) setSelectedSection(sections[0]?.id ?? "");
      notify("Section deleted");
    } else notify(res.error ?? "Error", false);
  }

  async function reorderSections(next: Section[]) {
    setSections(next);
    await Promise.all(next.map((s, i) =>
      fetch("/api/admin/academy/sections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, position: i }),
      }),
    ));
  }

  async function reorderLessons(sectionId: string, next: Lesson[]) {
    setLessons(prev => {
      const others = prev.filter(l => l.section_id !== sectionId);
      return [...others, ...next.map((l, i) => ({ ...l, position: i }))];
    });
    await Promise.all(next.map((l, i) =>
      fetch(`/api/admin/academy/lessons/${l.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: i }),
      }),
    ));
  }

  async function addLesson(type = "video") {
    if (!selectedSection) return notify("Select a section first", false);
    const title = await dialog.askText(`New ${type} lesson`, { placeholder: "Lesson title" });
    if (!title) return;
    const res = await fetch("/api/admin/academy/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_id: selectedSection, product_id: openProduct, title, lesson_type: type }),
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
    const ok = await dialog.askConfirm("Delete lesson?", {
      body: "This action cannot be undone.",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/academy/lessons?id=${id}`, { method: "DELETE" }).then(r => r.json());
    if (res.ok) {
      setLessons(l => l.filter(x => x.id !== id));
      if (selectedLesson?.id === id) { setSelectedLesson(null); setEditingLesson({}); }
      notify("Lesson deleted");
    } else notify(res.error ?? "Error", false);
  }

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

  const [editProduct, setEditProduct] = useState<Partial<Product>>({});

  async function saveProduct() {
    const { id, ...updates } = editProduct as Product;
    if (!id) return;
    const res = await fetch("/api/admin/academy/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    }).then(r => r.json());
    if (res.product) {
      setProducts(p => p.map(x => x.id === id ? res.product : x));
      notify("Product saved");
    }
    else notify(res.error ?? "Error", false);
  }

  const product = openProduct ? products.find(p => p.id === openProduct) ?? null : null;
  const productSections = sections.filter(s => s.product_id === openProduct);
  const productEnrollments = enrollments.filter(e => e.product_id === openProduct);
  const productCohorts = cohorts.filter(c => c.product_id === openProduct);

  return (
    <div className="v2-app academy-admin" style={{ minHeight: "100vh", background: "var(--app-bg)", color: "var(--app-text)" }}>
      <style>{`
        .academy-admin .ac-input,
        .academy-admin .ac-select,
        .academy-admin .ac-textarea {
          width: 100%;
          background: var(--app-surface);
          border: 1px solid var(--app-border);
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 13px;
          color: var(--app-text);
          outline: none;
          transition: border-color var(--app-dur) var(--app-ease);
        }
        .academy-admin .ac-input:focus,
        .academy-admin .ac-select:focus,
        .academy-admin .ac-textarea:focus { border-color: var(--app-accent); }
        .academy-admin .ac-textarea { resize: vertical; }
        .academy-admin .ac-label {
          display: block;
          font-size: 10px;
          color: var(--app-text-quiet);
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 600;
        }
        .academy-admin .ac-card {
          background: var(--app-bg-elevated);
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius-lg);
        }
        .academy-admin .ac-table { width: 100%; font-size: 13px; border-collapse: collapse; }
        .academy-admin .ac-table th {
          padding: 10px 16px;
          text-align: left;
          font-size: 10px;
          font-weight: 600;
          color: var(--app-text-quiet);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          border-bottom: 1px solid var(--app-border);
        }
        .academy-admin .ac-table td {
          padding: 11px 16px;
          color: var(--app-text);
          border-bottom: 1px solid var(--app-border);
        }
        .academy-admin .ac-table tbody tr:last-child td { border-bottom: 0; }
        .academy-admin .ac-table tbody tr:hover { background: var(--app-surface); }
        .academy-admin .ac-chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 999px;
          font-size: 10px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.06em;
          border: 1px solid var(--app-border);
          background: var(--app-surface);
          color: var(--app-text-muted);
        }
        .academy-admin .ac-chip.success { color: #34d399; border-color: rgba(52,211,153,0.25); background: rgba(52,211,153,0.08); }
        .academy-admin .ac-chip.warn    { color: #fbbf24; border-color: rgba(251,191,36,0.25); background: rgba(251,191,36,0.08); }
        .academy-admin .ac-chip.info    { color: var(--app-accent); border-color: var(--app-accent-line); background: var(--app-accent-soft); }

        /* Horizontal-scroll wrapper for wide tables on narrow viewports */
        .academy-admin .ac-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .academy-admin .ac-table-scroll .ac-table { min-width: 720px; }

        @media (max-width: 1023px) {
          /* Course-detail: left-rail above, content below */
          .academy-admin .acad-detail { flex-direction: column; min-height: auto; }
          .academy-admin .acad-detail-rail {
            width: 100% !important;
            border-right: none !important;
            border-bottom: 1px solid var(--app-border);
            padding: 12px !important;
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
          }
          .academy-admin .acad-detail-rail > button { width: auto !important; flex: 1 1 auto; }
          .academy-admin .acad-detail-rail > div:last-child { display: none; }

          /* Curriculum: tree above, lesson editor below */
          .academy-admin .acad-curriculum-split { flex-direction: column; height: auto !important; }
          .academy-admin .acad-curriculum-tree {
            width: 100% !important;
            border-right: none !important;
            border-bottom: 1px solid var(--app-border);
          }
        }

        @media (max-width: 640px) {
          .academy-admin .ac-table th,
          .academy-admin .ac-table td { padding: 9px 12px; font-size: 12px; }
        }
      `}</style>

      {/* Top bar */}
      <header style={{
        borderBottom: "1px solid var(--app-border)",
        padding: "18px 28px",
        background: "var(--app-bg-sunken)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {openProduct && (
              <button
                onClick={() => { setOpenProduct(null); setCourseView("curriculum"); }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 13, color: "var(--app-text-muted)",
                  background: "transparent", border: "none",
                  cursor: "pointer", padding: "4px 0",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--app-text)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--app-text-muted)")}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.8} />
                All courses
              </button>
            )}
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--app-text)" }}>
                {product ? product.name : "Academy"}
              </h1>
              <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: 2 }}>
                {product
                  ? `${productSections.length} sections · ${lessons.filter(l => l.product_id === openProduct).length} lessons · ${productEnrollments.length} learners`
                  : `${products.length} courses · ${enrollments.length} enrollments · ${cohorts.length} cohorts`}
              </p>
            </div>
          </div>
          {msg && (
            <div
              role="status"
              style={{
                fontSize: 13,
                padding: "8px 14px",
                borderRadius: 6,
                background: msg.ok ? "rgba(52,211,153,0.1)" : "rgba(239,68,68,0.1)",
                color:      msg.ok ? "#34d399" : "#f87171",
                border:     `1px solid ${msg.ok ? "rgba(52,211,153,0.2)" : "rgba(239,68,68,0.2)"}`,
              }}
            >
              {msg.text}
            </div>
          )}
        </div>

        {/* Top nav — only when not in a course detail */}
        {!openProduct && (
          <nav style={{ display: "flex", gap: 4, marginTop: 18 }}>
            {([
              { key: "courses",     label: "Courses",        icon: BookOpen02Icon },
              { key: "funnels",     label: "Funnels",         icon: GitBranchIcon },
              { key: "cohorts",     label: "Cohorts",        icon: Calendar03Icon },
              { key: "enrollments", label: "Enrollments",    icon: UserMultipleIcon },
              { key: "codes",       label: "Discount codes", icon: Tag01Icon },
              { key: "access",      label: "Access",         icon: comingSoon?.enabled ? LockedIcon : GlobeIcon },
            ] as { key: TopNav; label: string; icon: typeof BookOpen02Icon }[]).map(t => {
              const active = top === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTop(t.key)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "8px 12px",
                    fontSize: 13,
                    fontWeight: active ? 500 : 400,
                    color: active ? "var(--app-text)" : "var(--app-text-muted)",
                    background: active ? "var(--app-surface)" : "transparent",
                    border: "1px solid",
                    borderColor: active ? "var(--app-border)" : "transparent",
                    borderRadius: 6,
                    cursor: "pointer",
                    transition: "all var(--app-dur) var(--app-ease)",
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.color = "var(--app-text)"; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.color = "var(--app-text-muted)"; }}
                >
                  <HugeiconsIcon icon={t.icon} size={14} strokeWidth={1.8} />
                  {t.label}
                </button>
              );
            })}
          </nav>
        )}
      </header>

      {loading ? (
        <div style={{ padding: "60px 28px", textAlign: "center", fontSize: 13, color: "var(--app-text-quiet)" }}>Loading…</div>
      ) : (
        <main style={{ padding: openProduct ? 0 : "24px 28px" }}>
          {/* ── Top-level COURSES gallery ─────────────────────────────────── */}
          {!openProduct && top === "courses" && (
            <CoursesGallery
              products={products}
              onOpen={id => {
                setOpenProduct(id);
                setCourseView("curriculum");
                setChallengeView("builder");
              }}
              onCreateChallenge={createChallenge}
              creatingChallenge={creatingChallenge}
            />
          )}

          {/* ── FUNNELS ───────────────────────────────────────────────────── */}
          {!openProduct && top === "funnels" && (
            <ChallengeFunnelMap
              onOpenBuilder={id => { setOpenProduct(id); setChallengeView("builder"); }}
              onToast={notify}
            />
          )}

          {/* ── COHORTS ───────────────────────────────────────────────────── */}
          {!openProduct && top === "cohorts" && (
            <div style={{ display: "grid", gap: 24, maxWidth: 960 }}>
              <form onSubmit={createCohort} className="ac-card" style={{ padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Create cohort</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label className="ac-label">Course</label>
                    <select value={cohortForm.product_id} onChange={e => setCohortForm(f => ({ ...f, product_id: e.target.value }))} className="ac-select" required>
                      <option value="">Select…</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="ac-label">Cohort name</label>
                    <input value={cohortForm.name} onChange={e => setCohortForm(f => ({ ...f, name: e.target.value }))} className="ac-input" placeholder="e.g. June 2026 Challenge" required />
                  </div>
                  <div>
                    <label className="ac-label">Starts at</label>
                    <input type="datetime-local" value={cohortForm.starts_at} onChange={e => setCohortForm(f => ({ ...f, starts_at: e.target.value }))} className="ac-input" required />
                  </div>
                  <div>
                    <label className="ac-label">Ends at (optional)</label>
                    <input type="datetime-local" value={cohortForm.ends_at} onChange={e => setCohortForm(f => ({ ...f, ends_at: e.target.value }))} className="ac-input" />
                  </div>
                  <div>
                    <label className="ac-label">Max seats (blank = unlimited)</label>
                    <input type="number" value={cohortForm.max_seats} onChange={e => setCohortForm(f => ({ ...f, max_seats: e.target.value }))} className="ac-input" />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", paddingBottom: 6 }}>
                      <input type="checkbox" checked={cohortForm.is_default} onChange={e => setCohortForm(f => ({ ...f, is_default: e.target.checked }))} />
                      <span style={{ fontSize: 13, color: "var(--app-text-muted)" }}>Auto-assign new enrollments</span>
                    </label>
                  </div>
                </div>
                <button type="submit" className="app-btn app-btn-primary" style={{ marginTop: 16 }}>Create cohort</button>
              </form>

              <div className="ac-card" style={{ overflow: "hidden" }}>
                <div className="ac-table-scroll"><table className="ac-table">
                  <thead>
                    <tr>
                      <th>Cohort</th>
                      <th>Course</th>
                      <th>Starts</th>
                      <th>Seats</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 500 }}>
                          {c.name}
                          {c.is_default && <span className="ac-chip info" style={{ marginLeft: 8 }}>default</span>}
                        </td>
                        <td style={{ color: "var(--app-text-muted)" }}>{products.find(p => p.id === c.product_id)?.name}</td>
                        <td style={{ color: "var(--app-text-muted)" }}>{new Date(c.starts_at).toLocaleDateString()}</td>
                        <td style={{ color: "var(--app-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                          {c.enrolled_count}{c.max_seats ? ` / ${c.max_seats}` : ""}
                        </td>
                        <td>
                          <span className={`ac-chip ${c.status === "active" ? "success" : c.status === "upcoming" ? "info" : ""}`}>{c.status}</span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {c.status === "upcoming" && (
                            <button onClick={() => updateCohortStatus(c.id, "active")} className="app-btn app-btn-ghost" style={{ fontSize: 12 }}>
                              Activate
                            </button>
                          )}
                          {c.status === "active" && (
                            <button onClick={() => updateCohortStatus(c.id, "ended")} className="app-btn app-btn-ghost" style={{ fontSize: 12 }}>
                              End
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {cohorts.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--app-text-quiet)" }}>No cohorts yet.</td></tr>
                    )}
                  </tbody>
                </table></div>
              </div>
            </div>
          )}

          {/* ── ENROLLMENTS ───────────────────────────────────────────────── */}
          {!openProduct && top === "enrollments" && (
            <div className="ac-card" style={{ overflow: "hidden", maxWidth: 1100 }}>
              <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", borderBottom: "1px solid var(--app-border)" }}>
                <h3 style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>All enrollments</h3>
                <span style={{ fontSize: 12, color: "var(--app-text-quiet)" }}>{enrollments.length} total</span>
              </div>
              <div className="ac-table-scroll"><table className="ac-table">
                <thead>
                  <tr>
                    <th>Workspace</th>
                    <th>Course</th>
                    <th>Cohort</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Enrolled</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 500 }}>{e.workspaces?.name ?? e.workspace_id.slice(0, 8)}</td>
                      <td style={{ color: "var(--app-text-muted)" }}>{products.find(p => p.id === e.product_id)?.name ?? e.product_id}</td>
                      <td style={{ color: "var(--app-text-muted)" }}>{e.academy_cohorts?.name ?? "—"}</td>
                      <td><span className={`ac-chip ${e.access_type === "paid" ? "success" : "warn"}`}>{e.access_type}</span></td>
                      <td><span className={`ac-chip ${e.status === "active" ? "info" : e.status === "completed" ? "success" : ""}`}>{e.status}</span></td>
                      <td style={{ color: "var(--app-text-quiet)", fontSize: 12 }}>{new Date(e.enrolled_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {enrollments.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--app-text-quiet)" }}>No enrollments yet.</td></tr>
                  )}
                </tbody>
              </table></div>
            </div>
          )}

          {/* ── DISCOUNT CODES ────────────────────────────────────────────── */}
          {!openProduct && top === "codes" && (
            <div style={{ display: "grid", gap: 24, maxWidth: 860 }}>
              <form onSubmit={createCode} className="ac-card" style={{ padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Create discount code</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label className="ac-label">Code (blank = auto-generate)</label>
                    <input value={codeForm.code} onChange={e => setCodeForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="ac-input" placeholder="e.g. LAUNCH50" style={{ textTransform: "uppercase" }} />
                  </div>
                  <div>
                    <label className="ac-label">Course (blank = all)</label>
                    <select value={codeForm.product_id} onChange={e => setCodeForm(f => ({ ...f, product_id: e.target.value }))} className="ac-select">
                      <option value="">All courses</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="ac-label">Discount type</label>
                    <select value={codeForm.discount_type} onChange={e => setCodeForm(f => ({ ...f, discount_type: e.target.value }))} className="ac-select">
                      <option value="percent">Percent (%)</option>
                      <option value="fixed_ngn">Fixed (₦)</option>
                    </select>
                  </div>
                  <div>
                    <label className="ac-label">Value ({codeForm.discount_type === "percent" ? "%" : "₦"})</label>
                    <input type="number" value={codeForm.discount_value} onChange={e => setCodeForm(f => ({ ...f, discount_value: e.target.value }))} className="ac-input" required />
                  </div>
                  <div>
                    <label className="ac-label">Max uses (blank = unlimited)</label>
                    <input type="number" value={codeForm.max_uses} onChange={e => setCodeForm(f => ({ ...f, max_uses: e.target.value }))} className="ac-input" />
                  </div>
                  <div>
                    <label className="ac-label">Expires at</label>
                    <input type="datetime-local" value={codeForm.expires_at} onChange={e => setCodeForm(f => ({ ...f, expires_at: e.target.value }))} className="ac-input" />
                  </div>
                </div>
                <button type="submit" className="app-btn app-btn-primary" style={{ marginTop: 16 }}>Create code</button>
              </form>

              <div className="ac-card" style={{ overflow: "hidden" }}>
                <div className="ac-table-scroll"><table className="ac-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Discount</th>
                      <th>Course</th>
                      <th>Uses</th>
                      <th>Expires</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 600, color: "var(--app-accent)" }}>{c.code}</td>
                        <td>{c.discount_value}{c.discount_type === "percent" ? "%" : "₦"}</td>
                        <td style={{ color: "var(--app-text-muted)" }}>{c.product_id ? products.find(p => p.id === c.product_id)?.name : "All"}</td>
                        <td style={{ color: "var(--app-text-muted)", fontVariantNumeric: "tabular-nums" }}>{c.uses_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
                        <td style={{ color: "var(--app-text-muted)" }}>{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}</td>
                        <td style={{ textAlign: "right" }}>
                          <button onClick={() => toggleCode(c.id, !c.is_active)} className={`ac-chip ${c.is_active ? "success" : ""}`} style={{ cursor: "pointer" }}>
                            {c.is_active ? "Active" : "Off"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {codes.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--app-text-quiet)" }}>No codes yet.</td></tr>
                    )}
                  </tbody>
                </table></div>
              </div>
            </div>
          )}

          {/* ── ACCESS / COMING SOON ──────────────────────────────────────── */}
          {!openProduct && top === "access" && (
            <div style={{ display: "grid", gap: 20, maxWidth: 640 }}>
              {comingSoon == null ? (
                <div style={{ padding: 32, textAlign: "center", color: "var(--app-text-quiet)" }}>Loading access settings…</div>
              ) : (
                <>
                  <div className="ac-card" style={{ padding: 20 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                      <div>
                        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text)" }}>Coming-soon mode</h3>
                        <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: 4, lineHeight: 1.5 }}>
                          When ON, users see the &ldquo;Coming Soon&rdquo; overlay instead of the academy. Beta workspaces below bypass it.
                        </p>
                      </div>
                      <button
                        onClick={() => saveComingSoon({ ...comingSoon, enabled: !comingSoon.enabled })}
                        disabled={accessSaving}
                        style={{
                          position: "relative",
                          display: "inline-flex", alignItems: "center",
                          width: 38, height: 22,
                          borderRadius: 999,
                          border: "none",
                          cursor: accessSaving ? "not-allowed" : "pointer",
                          background: comingSoon.enabled ? "var(--app-accent)" : "#34d399",
                          opacity: accessSaving ? 0.5 : 1,
                          flexShrink: 0,
                          transition: "background var(--app-dur) var(--app-ease)",
                        }}
                        aria-label="Toggle coming soon"
                      >
                        <span style={{
                          display: "inline-block",
                          width: 16, height: 16,
                          borderRadius: "50%",
                          background: "#fff",
                          transform: comingSoon.enabled ? "translateX(3px)" : "translateX(19px)",
                          transition: "transform var(--app-dur) var(--app-ease)",
                        }} />
                      </button>
                    </div>
                    <div style={{
                      marginTop: 16,
                      fontSize: 13, fontWeight: 500,
                      color: comingSoon.enabled ? "var(--app-accent)" : "#34d399",
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <HugeiconsIcon icon={comingSoon.enabled ? LockedIcon : CheckmarkCircle02Icon} size={14} strokeWidth={1.8} />
                      {comingSoon.enabled
                        ? "Academy is hidden — coming-soon overlay is active"
                        : "Academy is live — all users can access it"}
                    </div>
                  </div>

                  <div className="ac-card" style={{ padding: 20 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text)" }}>Beta access</h3>
                    <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: 4, marginBottom: 16, lineHeight: 1.5 }}>
                      These workspaces bypass the coming-soon overlay regardless of the global toggle.
                    </p>

                    {(() => {
                      const betaList = comingSoon.beta_workspaces;
                      const filtered = allWorkspaces.filter(
                        w => !betaList.includes(w.id) &&
                          (!wsSearch ||
                            w.name.toLowerCase().includes(wsSearch.toLowerCase()) ||
                            w.id.toLowerCase().includes(wsSearch.toLowerCase()))
                      );
                      return (
                        <div style={{
                          marginBottom: 14,
                          border: "1px solid var(--app-border)",
                          borderRadius: "var(--app-radius)",
                          overflow: "hidden",
                        }}>
                          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--app-border)", background: "var(--app-surface)" }}>
                            <input
                              value={wsSearch}
                              onChange={e => setWsSearch(e.target.value)}
                              placeholder="Filter workspaces…"
                              style={{
                                width: "100%", background: "transparent",
                                fontSize: 13, color: "var(--app-text)",
                                border: "none", outline: "none",
                              }}
                            />
                          </div>
                          <div style={{ maxHeight: 220, overflowY: "auto" }}>
                            {filtered.length === 0 ? (
                              <p style={{ padding: "14px 16px", fontSize: 13, color: "var(--app-text-quiet)" }}>
                                {allWorkspaces.length === 0 ? "Loading…" : "No matching workspaces"}
                              </p>
                            ) : (
                              filtered.slice(0, 50).map(w => (
                                <button
                                  key={w.id}
                                  onClick={() => addBetaWorkspace(w.id)}
                                  disabled={accessSaving}
                                  style={{
                                    width: "100%", textAlign: "left",
                                    padding: "10px 14px", fontSize: 13,
                                    background: "transparent", border: "none",
                                    borderBottom: "1px solid var(--app-border)",
                                    cursor: "pointer",
                                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                                    color: "var(--app-text)",
                                    transition: "background var(--app-dur) var(--app-ease)",
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background = "var(--app-surface)")}
                                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                >
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
                                  <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, color: "var(--app-text-quiet)", flexShrink: 0 }}>
                                    {w.id.slice(0, 8)}…
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {comingSoon.beta_workspaces.length === 0 ? (
                      <p style={{ fontSize: 12, color: "var(--app-text-quiet)" }}>No workspaces exempted yet.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {comingSoon.beta_workspaces.map(id => {
                          const ws = allWorkspaces.find(w => w.id === id);
                          return (
                            <div key={id} style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              background: "var(--app-surface)",
                              borderRadius: "var(--app-radius)",
                              padding: "10px 14px",
                            }}>
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: 13, color: "var(--app-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ws?.name ?? "Unknown workspace"}</p>
                                <p style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 10, color: "var(--app-text-quiet)" }}>{id}</p>
                              </div>
                              <button onClick={() => removeBetaWorkspace(id)} style={{
                                fontSize: 12, color: "var(--app-text-quiet)",
                                background: "transparent", border: "none",
                                cursor: "pointer", flexShrink: 0, marginLeft: 12,
                              }}
                                onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                                onMouseLeave={e => (e.currentTarget.style.color = "var(--app-text-quiet)")}
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── CHALLENGE BUILDER / ANALYTICS ─────────────────────────────── */}
          {openProduct && product && product.product_type === "challenge" && (
            <div>
              <div style={{ display: "flex", gap: 4, padding: "0 24px", borderBottom: "1px solid var(--app-border)" }}>
                {([
                  { key: "builder",   label: "Builder",   icon: GitBranchIcon },
                  { key: "analytics", label: "Analytics", icon: ChartBarLineIcon },
                ] as { key: ChallengeView; label: string; icon: typeof GitBranchIcon }[]).map(v => {
                  const active = challengeView === v.key;
                  return (
                    <button
                      key={v.key}
                      onClick={() => setChallengeView(v.key)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "11px 4px", marginRight: 18,
                        fontSize: 13, fontWeight: active ? 600 : 400,
                        color: active ? "var(--app-text)" : "var(--app-text-muted)",
                        background: "transparent", border: "none",
                        borderBottom: `2px solid ${active ? "var(--app-accent)" : "transparent"}`,
                        cursor: "pointer",
                      }}
                    >
                      <HugeiconsIcon icon={v.icon} size={14} strokeWidth={1.8} />
                      {v.label}
                    </button>
                  );
                })}
              </div>
              {challengeView === "builder" ? (
                <ChallengeBuilder
                  product={{
                    id: product.id,
                    name: product.name,
                    slug: product.slug,
                    is_published: product.is_published,
                    product_type: "challenge",
                    challenge_config: product.challenge_config ?? null,
                    price_ngn: product.price_ngn,
                    compare_price_ngn: product.compare_price_ngn,
                  }}
                  onSave={async (updates) => { await saveProductFields(product.id, updates); }}
                  onToast={notify}
                />
              ) : (
                <ChallengeAnalytics productId={product.id} productName={product.name} onToast={notify} />
              )}
            </div>
          )}

          {/* ── COURSE DETAIL (Kajabi-style) ──────────────────────────────── */}
          {openProduct && product && product.product_type !== "challenge" && (
            <div className="acad-detail" style={{ display: "flex", minHeight: "calc(100vh - 84px)" }}>
              {/* Left rail */}
              <aside className="acad-detail-rail" style={{
                width: 220, flexShrink: 0,
                borderRight: "1px solid var(--app-border)",
                background: "var(--app-bg-sunken)",
                padding: "20px 12px",
              }}>
                {([
                  { key: "curriculum", label: "Curriculum",      icon: BookOpen02Icon },
                  { key: "details",    label: "Banner & details", icon: ImageAdd02Icon },
                  { key: "pricing",    label: "Pricing & access", icon: CreditCardIcon },
                  { key: "settings",   label: "Settings",         icon: Settings02Icon },
                ] as { key: CourseView; label: string; icon: typeof BookOpen02Icon }[]).map(v => {
                  const active = courseView === v.key;
                  return (
                    <button
                      key={v.key}
                      onClick={() => setCourseView(v.key)}
                      style={{
                        width: "100%",
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 12px",
                        fontSize: 13,
                        fontWeight: active ? 500 : 400,
                        color: active ? "var(--app-text)" : "var(--app-text-muted)",
                        background: active ? "var(--app-surface)" : "transparent",
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all var(--app-dur) var(--app-ease)",
                      }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--app-surface)"; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                    >
                      <HugeiconsIcon icon={v.icon} size={15} strokeWidth={1.8} />
                      {v.label}
                    </button>
                  );
                })}

                <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--app-border)" }}>
                  <p style={{ fontSize: 10, color: "var(--app-text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 12, paddingLeft: 12 }}>
                    Status
                  </p>
                  <div style={{ paddingLeft: 12, display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--app-text-muted)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: product.is_published ? "#34d399" : "var(--app-text-quiet)" }} />
                      {product.is_published ? "Published" : "Draft"}
                    </div>
                    <div>{productEnrollments.length} learners</div>
                    <div>{productCohorts.length} cohorts</div>
                  </div>
                </div>
              </aside>

              {/* Right pane */}
              <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
                {courseView === "curriculum" && (
                  <div className="acad-curriculum-split" style={{ display: "flex", height: "calc(100vh - 84px)" }}>
                    {/* Section + lesson tree */}
                    <div className="acad-curriculum-tree" style={{
                      width: 300, flexShrink: 0,
                      borderRight: "1px solid var(--app-border)",
                      display: "flex", flexDirection: "column",
                    }}>
                      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--app-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--app-text-quiet)" }}>
                          Curriculum
                        </span>
                        <button onClick={addSection} className="app-btn app-btn-ghost" style={{ fontSize: 12 }}>
                          <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
                          Section
                        </button>
                      </div>
                      <div style={{ flex: 1, overflowY: "auto" }}>
                        <SortableList
                          items={productSections}
                          onReorder={reorderSections}
                          renderItem={(sec, handle) => {
                            const open = selectedSection === sec.id;
                            return (
                              <div>
                                <div
                                  onClick={() => setSelectedSection(sec.id)}
                                  className="group"
                                  style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "10px 14px",
                                    cursor: "pointer",
                                    background: open ? "var(--app-surface)" : "transparent",
                                    borderBottom: "1px solid var(--app-border)",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                                    <DragHandle listeners={handle.listeners} label="Reorder section" />
                                    <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: open ? "var(--app-text)" : "var(--app-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {sec.title}
                                    </span>
                                  </div>
                                  <button
                                    onClick={e => { e.stopPropagation(); deleteSection(sec.id); }}
                                    style={{
                                      background: "transparent", border: "none",
                                      color: "var(--app-text-quiet)",
                                      cursor: "pointer", padding: 2,
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                                    onMouseLeave={e => (e.currentTarget.style.color = "var(--app-text-quiet)")}
                                    aria-label="Delete section"
                                  >
                                    <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.8} />
                                  </button>
                                </div>
                                {open && (
                                  <>
                                    <div style={{ padding: "10px 14px", background: "var(--app-bg)", borderBottom: "1px solid var(--app-border)" }}>
                                      <SectionSettingsEditor
                                        sectionId={sec.id}
                                        initialCta={{
                                          text: (sec as unknown as { cta_text?: string | null }).cta_text ?? null,
                                          url:  (sec as unknown as { cta_url?:  string | null }).cta_url  ?? null,
                                        }}
                                        onSaved={next => {
                                          setSections(prev => prev.map(s => s.id === sec.id ? { ...s, ...next } as typeof s : s));
                                        }}
                                      />
                                    </div>
                                    <SortableList
                                      items={lessons.filter(l => l.section_id === sec.id)}
                                      onReorder={next => reorderLessons(sec.id, next)}
                                      renderItem={(lesson, lessonHandle) => {
                                        const Icon = LESSON_ICON[lesson.lesson_type] ?? DocumentValidationIcon;
                                        const active = selectedLesson?.id === lesson.id;
                                        return (
                                          <div
                                            onClick={() => openLesson(lesson)}
                                            style={{
                                              display: "flex", alignItems: "center", gap: 8,
                                              padding: "8px 14px 8px 24px",
                                              cursor: "pointer",
                                              fontSize: 13,
                                              background: active ? "var(--app-accent-soft)" : "transparent",
                                              color: active ? "var(--app-accent)" : "var(--app-text-muted)",
                                              borderLeft: active ? "2px solid var(--app-accent)" : "2px solid transparent",
                                              transition: "all var(--app-dur) var(--app-ease)",
                                            }}
                                            onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--app-surface)"; }}
                                            onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                                          >
                                            <DragHandle listeners={lessonHandle.listeners} label="Reorder lesson" />
                                            <HugeiconsIcon icon={Icon} size={13} strokeWidth={1.8} style={{ flexShrink: 0, opacity: 0.7 }} />
                                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson.title}</span>
                                            {!lesson.is_published && <span className="ac-chip warn" style={{ fontSize: 9, padding: "1px 6px" }}>draft</span>}
                                            {lesson.mux_playback_id && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", flexShrink: 0 }} aria-label="Video ready" />}
                                          </div>
                                        );
                                      }}
                                    />
                                    <div style={{ padding: "8px 14px 12px 24px", display: "flex", gap: 4 }}>
                                      {(["video","text","live","assignment"] as const).map(t => (
                                        <button key={t} onClick={() => addLesson(t)} className="app-btn app-btn-ghost" style={{ fontSize: 11, flex: 1 }}>
                                          + {t}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          }}
                        />
                        {productSections.length === 0 && (
                          <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>
                            No sections yet. Click <em>+ Section</em> to start.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Lesson editor */}
                    <div style={{ flex: 1, overflowY: "auto", padding: 28 }}>
                      {!selectedLesson ? (
                        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--app-text-quiet)", fontSize: 13, textAlign: "center" }}>
                          <div>
                            <p>Select a lesson from the curriculum to edit,</p>
                            <p>or create one inside a section.</p>
                          </div>
                        </div>
                      ) : (
                        <div style={{ maxWidth: 700 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--app-text)" }}>{selectedLesson.title}</h2>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => deleteLesson(selectedLesson.id)} className="app-btn app-btn-ghost" style={{ color: "#f87171" }}>
                                <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.8} />
                                Delete
                              </button>
                              <button onClick={saveLesson} className="app-btn app-btn-primary">Save</button>
                            </div>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                            <div>
                              <label className="ac-label">Title</label>
                              <input value={editingLesson.title ?? ""}
                                onChange={e => setEditingLesson(l => ({ ...l, title: e.target.value }))}
                                className="ac-input" />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                              <div>
                                <label className="ac-label">Type</label>
                                <select value={editingLesson.lesson_type ?? "video"}
                                  onChange={e => setEditingLesson(l => ({ ...l, lesson_type: e.target.value }))}
                                  className="ac-select">
                                  <option value="video">Video</option>
                                  <option value="text">Text / article</option>
                                  <option value="live">Live session</option>
                                  <option value="assignment">Assignment</option>
                                </select>
                              </div>
                              <div>
                                <label className="ac-label">Drip</label>
                                <select value={editingLesson.drip_type ?? "immediate"}
                                  onChange={e => setEditingLesson(l => ({ ...l, drip_type: e.target.value }))}
                                  className="ac-select">
                                  <option value="immediate">Immediate</option>
                                  <option value="days_after_enrollment">Days after enrollment</option>
                                  <option value="days_after_cohort_start">Days after cohort start</option>
                                  <option value="on_date">Specific date</option>
                                  <option value="manual">Manual unlock</option>
                                </select>
                              </div>
                            </div>

                            {(editingLesson.drip_type === "days_after_enrollment" || editingLesson.drip_type === "days_after_cohort_start") && (
                              <div>
                                <label className="ac-label">Unlock after (days)</label>
                                <input type="number" min={0} value={editingLesson.drip_value ?? 0}
                                  onChange={e => setEditingLesson(l => ({ ...l, drip_value: parseInt(e.target.value) || 0 }))}
                                  className="ac-input" style={{ maxWidth: 160 }} />
                              </div>
                            )}
                            {editingLesson.drip_type === "on_date" && (
                              <div>
                                <label className="ac-label">Unlock date</label>
                                <input type="datetime-local" value={editingLesson.drip_date?.slice(0, 16) ?? ""}
                                  onChange={e => setEditingLesson(l => ({ ...l, drip_date: e.target.value }))}
                                  className="ac-input" />
                              </div>
                            )}

                            <div>
                              <label className="ac-label">Description / lesson brief</label>
                              <textarea rows={4} value={editingLesson.description ?? ""}
                                onChange={e => setEditingLesson(l => ({ ...l, description: e.target.value }))}
                                className="ac-textarea" />
                            </div>

                            <div style={{ display: "flex", gap: 20 }}>
                              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                                <input type="checkbox" checked={editingLesson.is_free_preview ?? false}
                                  onChange={e => setEditingLesson(l => ({ ...l, is_free_preview: e.target.checked }))} />
                                <span style={{ fontSize: 13, color: "var(--app-text-muted)" }}>Free preview</span>
                              </label>
                              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                                <input type="checkbox" checked={editingLesson.is_published ?? false}
                                  onChange={e => setEditingLesson(l => ({ ...l, is_published: e.target.checked }))} />
                                <span style={{ fontSize: 13, color: "var(--app-text-muted)" }}>Published</span>
                              </label>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                              <div>
                                <label className="ac-label">CTA text (optional)</label>
                                <input
                                  value={(editingLesson as Record<string, unknown>).cta_text as string ?? ""}
                                  onChange={e => setEditingLesson(l => ({ ...l, cta_text: e.target.value }) as typeof editingLesson)}
                                  placeholder="Download workbook"
                                  className="ac-input"
                                />
                              </div>
                              <div>
                                <label className="ac-label">CTA URL (optional)</label>
                                <input
                                  value={(editingLesson as Record<string, unknown>).cta_url as string ?? ""}
                                  onChange={e => setEditingLesson(l => ({ ...l, cta_url: e.target.value }) as typeof editingLesson)}
                                  placeholder="https://… or /academy/…"
                                  className="ac-input"
                                />
                              </div>
                            </div>

                            {(editingLesson.lesson_type ?? selectedLesson.lesson_type) === "video" && (
                              <div style={{
                                border: "1px dashed var(--app-border-strong)",
                                borderRadius: "var(--app-radius-lg)",
                                padding: 18,
                              }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--app-text)" }}>Video</span>
                                  {selectedLesson.mux_playback_id && (
                                    <span className="ac-chip success">
                                      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={11} strokeWidth={2} />
                                      Ready · {dur(selectedLesson.duration_secs)}
                                    </span>
                                  )}
                                </div>

                                {uploadState === "idle" && (
                                  <>
                                    <input ref={fileRef} type="file" accept="video/*" style={{ display: "none" }}
                                      onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f); }} />
                                    <button onClick={() => fileRef.current?.click()} className="app-btn app-btn-secondary" style={{ width: "100%" }}>
                                      {selectedLesson.mux_playback_id ? "Replace video" : "Upload video"}
                                    </button>
                                  </>
                                )}
                                {uploadState === "uploading" && (
                                  <div>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--app-text-muted)", marginBottom: 6 }}>
                                      <span>Uploading…</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{uploadPct}%</span>
                                    </div>
                                    <div style={{ height: 6, background: "var(--app-surface)", borderRadius: 999, overflow: "hidden" }}>
                                      <div style={{ height: "100%", background: "var(--app-accent)", width: `${uploadPct}%`, transition: "width var(--app-dur) var(--app-ease)" }} />
                                    </div>
                                  </div>
                                )}
                                {uploadState === "processing" && (
                                  <p style={{ fontSize: 13, color: "#fbbf24" }}>Processing video… this may take a few minutes.</p>
                                )}
                                {uploadState === "done" && (
                                  <p style={{ fontSize: 13, color: "#34d399" }}>Video ready — playback ID saved.</p>
                                )}
                                {uploadState === "error" && (
                                  <p style={{ fontSize: 13, color: "#f87171" }}>Upload failed. Try again.</p>
                                )}
                              </div>
                            )}

                            {selectedLesson.id && (
                              <LessonContentEditor lessonId={selectedLesson.id} />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Banner & details */}
                {courseView === "details" && (
                  <div style={{ padding: 28, maxWidth: 700 }}>
                    <CourseBannerEditor
                      productId={product.id}
                      initial={product as unknown as {
                        banner_image_url: string | null;
                        banner_headline:  string | null;
                        banner_sub:       string | null;
                        banner_cta_text:  string | null;
                        banner_cta_url:   string | null;
                      }}
                      onSaved={next => {
                        setProducts(prev => prev.map(x => x.id === product.id ? { ...x, ...next } : x));
                      }}
                    />
                  </div>
                )}

                {/* Pricing & access */}
                {courseView === "pricing" && (
                  <div style={{ padding: 28, maxWidth: 700 }}>
                    <ProductPricingForm
                      product={product}
                      edit={editProduct.id === product.id ? editProduct : null}
                      onEdit={() => setEditProduct({ ...product })}
                      onCancel={() => setEditProduct({})}
                      onChange={patch => setEditProduct(ep => ({ ...ep, ...patch }))}
                      onSave={saveProduct}
                    />
                  </div>
                )}

                {/* Settings */}
                {courseView === "settings" && (
                  <div style={{ padding: 28, maxWidth: 700, display: "flex", flexDirection: "column", gap: 20 }}>
                    <div className="ac-card" style={{ padding: 20 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Cohorts on this course</h3>
                      {productCohorts.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--app-text-quiet)" }}>No cohorts on this course yet — create one from the global Cohorts tab.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {productCohorts.map(c => (
                            <div key={c.id} style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "10px 14px",
                              background: "var(--app-surface)",
                              borderRadius: "var(--app-radius)",
                              fontSize: 13,
                            }}>
                              <div>
                                <p style={{ color: "var(--app-text)", fontWeight: 500 }}>{c.name}</p>
                                <p style={{ color: "var(--app-text-quiet)", fontSize: 11, marginTop: 2 }}>
                                  {new Date(c.starts_at).toLocaleDateString()} · {c.enrolled_count}{c.max_seats ? ` / ${c.max_seats}` : ""} seats
                                </p>
                              </div>
                              <span className={`ac-chip ${c.status === "active" ? "success" : c.status === "upcoming" ? "info" : ""}`}>{c.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="ac-card" style={{ padding: 20 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Learners ({productEnrollments.length})</h3>
                      {productEnrollments.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--app-text-quiet)" }}>No enrollments yet.</p>
                      ) : (
                        <div style={{ maxHeight: 320, overflowY: "auto" }}>
                          <div className="ac-table-scroll"><table className="ac-table">
                            <thead>
                              <tr>
                                <th>Workspace</th>
                                <th>Cohort</th>
                                <th>Status</th>
                                <th>Enrolled</th>
                              </tr>
                            </thead>
                            <tbody>
                              {productEnrollments.map(e => (
                                <tr key={e.id}>
                                  <td style={{ fontWeight: 500 }}>{e.workspaces?.name ?? e.workspace_id.slice(0, 8)}</td>
                                  <td style={{ color: "var(--app-text-muted)" }}>{e.academy_cohorts?.name ?? "—"}</td>
                                  <td><span className={`ac-chip ${e.status === "active" ? "info" : e.status === "completed" ? "success" : ""}`}>{e.status}</span></td>
                                  <td style={{ color: "var(--app-text-quiet)", fontSize: 11 }}>{new Date(e.enrolled_at).toLocaleDateString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table></div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      )}
      {dialog.node}
    </div>
  );
}

// ─── Courses gallery ──────────────────────────────────────────────────────────

function CoursesGallery({ products, onOpen, onCreateChallenge, creatingChallenge }: {
  products: Product[];
  onOpen: (id: string) => void;
  onCreateChallenge: () => void;
  creatingChallenge: boolean;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button
          onClick={onCreateChallenge}
          disabled={creatingChallenge}
          className="app-btn app-btn-primary"
          style={{ opacity: creatingChallenge ? 0.6 : 1, cursor: creatingChallenge ? "default" : "pointer" }}
        >
          <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={1.8} />
          {creatingChallenge ? "Creating…" : "New challenge"}
        </button>
      </div>
      {products.length === 0 ? (
        <div className="ac-card" style={{ padding: 60, textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--app-text-muted)" }}>No courses yet.</p>
          <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: 6 }}>
            Add a product row in the academy_products table to get started — courses are bootstrapped via migration.
          </p>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}>
          {products.map(p => {
            const isChallenge = p.product_type === "challenge";
            return (
              <button
                key={p.id}
                onClick={() => onOpen(p.id)}
                className="ac-card"
                style={{
                  textAlign: "left",
                  padding: 0,
                  overflow: "hidden",
                  cursor: "pointer",
                  transition: "all var(--app-dur) var(--app-ease)",
                  border: `1px solid ${isChallenge ? "var(--app-accent-line)" : "var(--app-border)"}`,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--app-border-strong)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = isChallenge ? "var(--app-accent-line)" : "var(--app-border)"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <div style={{
                  aspectRatio: "16 / 9",
                  background: isChallenge
                    ? "linear-gradient(135deg, var(--app-accent-soft), var(--app-surface-strong))"
                    : "linear-gradient(135deg, rgba(96,165,250,0.12), var(--app-surface-strong))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: isChallenge ? "var(--app-accent)" : "#60A5FA",
                  borderBottom: "1px solid var(--app-border)",
                }}>
                  <HugeiconsIcon icon={isChallenge ? GitBranchIcon : BookOpen02Icon} size={36} strokeWidth={1.4} />
                </div>
                <div style={{ padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </h3>
                    <span className={`ac-chip ${p.is_published ? "success" : ""}`}>{p.is_published ? "Live" : "Draft"}</span>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--app-text-quiet)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", marginBottom: 12 }}>
                    {p.slug} {isChallenge && <span style={{ color: "var(--app-accent)" }}>· Challenge</span>}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--app-text-muted)" }}>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(p.price_ngn)}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--app-accent)" }}>
                      Open
                      <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={1.8} />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Pricing form ─────────────────────────────────────────────────────────────

function ProductPricingForm({
  product, edit, onEdit, onCancel, onChange, onSave,
}: {
  product: Product;
  edit: Partial<Product> | null;
  onEdit: () => void;
  onCancel: () => void;
  onChange: (patch: Partial<Product>) => void;
  onSave: () => void;
}) {
  const editing = !!edit;
  const ep = edit ?? {};
  return (
    <div className="ac-card" style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--app-text)" }}>Pricing & access</h3>
          <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: 4 }}>
            Controls the checkout price, what enrolled learners receive, and completion threshold.
          </p>
        </div>
        {!editing ? (
          <button onClick={onEdit} className="app-btn app-btn-secondary">
            <HugeiconsIcon icon={PencilEdit02Icon} size={13} strokeWidth={1.8} />
            Edit
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onCancel} className="app-btn app-btn-ghost">
              <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.8} />
              Cancel
            </button>
            <button onClick={onSave} className="app-btn app-btn-primary">Save</button>
          </div>
        )}
      </div>

      {!editing ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, fontSize: 13 }}>
          <Stat label="Price"        value={fmt(product.price_ngn)} />
          <Stat label="Compare price" value={product.compare_price_ngn ? fmt(product.compare_price_ngn) : "—"} />
          <Stat label="Credits granted" value={product.credits_grant.toLocaleString()} />
          <Stat label="Leadash months"  value={`${product.leadash_months}mo`} />
          <Stat label="Completion threshold" value={`${product.completion_threshold_pct}%`} />
          <Stat label="Certificate"    value={product.certificate_enabled ? "Enabled" : "Off"} />
          <Stat label="Status"         value={product.is_published ? "Published" : "Draft"} />
          <Stat label="Active"         value={product.is_active ? "Yes" : "No"} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label className="ac-label">Price (₦)</label>
              <input type="number" value={ep.price_ngn ?? 0}
                onChange={e => onChange({ price_ngn: parseInt(e.target.value) || 0 })}
                className="ac-input" />
            </div>
            <div>
              <label className="ac-label">Compare price (₦)</label>
              <input type="number" value={ep.compare_price_ngn ?? ""}
                onChange={e => onChange({ compare_price_ngn: e.target.value ? parseInt(e.target.value) : null })}
                className="ac-input" />
            </div>
            <div>
              <label className="ac-label">Credits granted on enroll</label>
              <input type="number" value={ep.credits_grant ?? 0}
                onChange={e => onChange({ credits_grant: parseInt(e.target.value) || 0 })}
                className="ac-input" />
            </div>
            <div>
              <label className="ac-label">Leadash access (months)</label>
              <input type="number" value={ep.leadash_months ?? 0}
                onChange={e => onChange({ leadash_months: parseInt(e.target.value) || 0 })}
                className="ac-input" />
            </div>
            <div>
              <label className="ac-label">Completion threshold (%)</label>
              <input type="number" min={1} max={100} value={ep.completion_threshold_pct ?? 80}
                onChange={e => onChange({ completion_threshold_pct: parseInt(e.target.value) || 80 })}
                className="ac-input" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={ep.is_active ?? true} onChange={e => onChange({ is_active: e.target.checked })} />
              <span style={{ fontSize: 13, color: "var(--app-text-muted)" }}>Active</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={ep.is_published ?? true} onChange={e => onChange({ is_published: e.target.checked })} />
              <span style={{ fontSize: 13, color: "var(--app-text-muted)" }}>Published</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={ep.certificate_enabled ?? true} onChange={e => onChange({ certificate_enabled: e.target.checked })} />
              <span style={{ fontSize: 13, color: "var(--app-text-muted)" }}>Certificates</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--app-text-quiet)", fontWeight: 600, marginBottom: 4 }}>{label}</p>
      <p style={{ color: "var(--app-text)", fontSize: 14, fontWeight: 500 }}>{value}</p>
    </div>
  );
}
