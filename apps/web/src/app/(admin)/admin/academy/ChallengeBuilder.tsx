"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import LessonContentEditor from "./LessonContentEditor";
import {
  Settings02Icon,
  Calendar03Icon,
  Award01Icon,
  ChartIcon,
  ShoppingBag01Icon,
  Notification01Icon,
  PlusSignIcon,
  Delete02Icon,
  Copy01Icon,
  FloppyDiskIcon,
  PlayCircleIcon,
  DocumentValidationIcon,
  CheckmarkCircle02Icon,
  Activity01Icon,
  Video01Icon,
  BookOpen02Icon,
  AlertCircleIcon,
  ArrowRight01Icon,
  PencilEdit02Icon,
  Award03Icon,
  Medal01Icon,
  Mortarboard01Icon,
  Mail01Icon,
  SmartPhone01Icon,
  BoltIcon,
} from "@hugeicons/core-free-icons";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChallengeConfig {
  tagline?: string;
  duration_days?: number;
  cadence?: "daily" | "weekly";
  start_mode?: "enrollment" | "cohort";
  grace_days?: number;
  catchup_enabled?: boolean;
  leaderboard_enabled?: boolean;
  points_board_enabled?: boolean;
  earnings_board_enabled?: boolean;
  earnings_require_proof?: boolean;
  earnings_reset?: "all_time" | "weekly" | "daily";
  auto_advance_offer?: {
    enabled: boolean;
    trigger: string;
    trigger_day?: number;
    window_hours: number;
    target_product_id?: string;
    discount_type: string;
    discount_value: number;
  };
  reminders?: {
    email: boolean;
    whatsapp: boolean;
    daily_unlock_time: string;
    timezone: string;
    nudge_missed: boolean;
  };
}

interface ProofConfig {
  accepts: Array<"image" | "file" | "link" | "text">;
  prompt: string;
}

interface MetricConfig {
  // has_inbox / has_plan are auto-detected by Leadash (completes when the
  // workspace has a connected inbox / is on a paid plan).
  source: "leadash_outbox" | "manual" | "has_inbox" | "has_plan";
  metric: string;
  target: number;
  cta_label?: string;
  cta_url?: string;
}

interface QuizConfig {
  questions: Array<{ q: string; a: string }>;
}

interface SelfCheckConfig {
  prompt: string;
}

interface ChallengeTask {
  id: string;
  product_id: string;
  day: number;
  position: number;
  task_type: "lesson" | "proof" | "self_check" | "metric" | "live" | "quiz";
  title: string;
  points: number;
  is_published: boolean;
  lesson_id?: string | null;
  proof_config?: ProofConfig | null;
  metric_config?: MetricConfig | null;
  live_session_id?: string | null;
  quiz_config?: QuizConfig | null;
  self_check_config?: SelfCheckConfig | null;
}

interface AcademyLessonOption {
  id: string;
  title: string;
  lesson_type: string;
  mux_playback_id: string | null;
}

interface LiveSessionOption {
  id: string;
  lesson_id: string;
  scheduled_at: string;
  duration_mins: number;
  platform: string;
  join_url: string;
  lesson_title?: string;
}

const DEFAULT_PROOF_CONFIG: ProofConfig = { accepts: ["image", "link"], prompt: "" };
const DEFAULT_METRIC_CONFIG: MetricConfig = { source: "leadash_outbox", metric: "messages_sent", target: 20 };
const DEFAULT_QUIZ_CONFIG: QuizConfig = { questions: [{ q: "", a: "" }] };
const DEFAULT_SELF_CHECK_CONFIG: SelfCheckConfig = { prompt: "" };

interface ChallengeBuilderProps {
  product: {
    id: string;
    name: string;
    slug: string;
    is_published: boolean;
    product_type: "challenge";
    challenge_config: ChallengeConfig | null;
    price_ngn: number;
    compare_price_ngn: number | null;
    pricing_type?: string;
    certificate_enabled?: boolean;
    completion_threshold_pct?: number;
  };
  onSave: (updates: Record<string, unknown>) => Promise<void>;
  onToast: (msg: string) => void;
}

type ChallengeTab = "setup" | "schedule" | "rewards" | "leaderboard" | "offers" | "reminders" | "settings";

// ── Constants ─────────────────────────────────────────────────────────────────

const TASK_COLORS: Record<string, string> = {
  lesson:     "#60A5FA",
  proof:      "#F97316",
  self_check: "#34D399",
  metric:     "#A78BFA",
  live:       "#F472B6",
  quiz:       "#FBBF24",
};

const TASK_LABELS: Record<string, string> = {
  lesson:     "Watch lesson",
  proof:      "Submit proof",
  self_check: "Self-check",
  metric:     "Hit metric",
  live:       "Live session",
  quiz:       "Quiz",
};

const TASK_ICONS: Record<string, typeof PlayCircleIcon> = {
  lesson:     PlayCircleIcon,
  proof:      DocumentValidationIcon,
  self_check: CheckmarkCircle02Icon,
  metric:     Activity01Icon,
  live:       Video01Icon,
  quiz:       BookOpen02Icon,
};

const WEEK_NAMES: Record<number, string> = {
  1: "Foundation & First Outreach",
  2: "Volume & Replies",
  3: "Calls & Closing",
  4: "Scale to $2,500",
};

// Seed task schedule for 30-day challenge
type SeedDay = { types: Array<"lesson" | "proof" | "self_check" | "metric" | "live" | "quiz">; pts: number; title: string };

function buildSeedDays(): SeedDay[] {
  const seed: Array<{ day: number; types: SeedDay["types"]; pts: number; title: string }> = [
    { day: 1,  types: ["lesson", "self_check"], pts: 30,  title: "Your first cold message" },
    { day: 2,  types: ["lesson", "metric"],     pts: 40,  title: "Prospect 10 leads" },
    { day: 3,  types: ["proof", "metric"],      pts: 50,  title: "Send 10 DMs" },
    { day: 4,  types: ["metric"],               pts: 50,  title: "Send 20 DMs" },
    { day: 5,  types: ["live"],                 pts: 30,  title: "Live Q&A — Week 1" },
    { day: 6,  types: ["lesson", "proof"],      pts: 40,  title: "Follow-up scripts" },
    { day: 7,  types: ["self_check"],           pts: 20,  title: "Week 1 reflection" },
    { day: 8,  types: ["lesson", "metric"],     pts: 40,  title: "LinkedIn optimization" },
    { day: 9,  types: ["proof", "metric"],      pts: 50,  title: "50 connection requests" },
    { day: 10, types: ["metric"],               pts: 50,  title: "Track replies" },
    { day: 11, types: ["lesson", "proof"],      pts: 40,  title: "First reply nurture" },
    { day: 12, types: ["live"],                 pts: 30,  title: "Accountability check" },
    { day: 13, types: ["quiz"],                 pts: 30,  title: "Week 2 knowledge check" },
    { day: 14, types: ["self_check"],           pts: 20,  title: "Week 2 reflection" },
    { day: 15, types: ["lesson", "metric"],     pts: 50,  title: "Book your first call" },
    { day: 16, types: ["proof"],                pts: 60,  title: "Call booked — screenshot" },
    { day: 17, types: ["lesson", "self_check"], pts: 40,  title: "Discovery call framework" },
    { day: 18, types: ["proof"],                pts: 60,  title: "Call happened — debrief" },
    { day: 19, types: ["live"],                 pts: 30,  title: "Live pitch review" },
    { day: 20, types: ["metric"],               pts: 60,  title: "Send proposal" },
    { day: 21, types: ["self_check"],           pts: 20,  title: "Week 3 reflection" },
    { day: 22, types: ["lesson", "metric"],     pts: 50,  title: "Close your first client" },
    { day: 23, types: ["proof"],                pts: 80,  title: "First payment received" },
    { day: 24, types: ["metric"],               pts: 60,  title: "Outreach to 5 more" },
    { day: 25, types: ["lesson"],               pts: 30,  title: "Referral system setup" },
    { day: 26, types: ["live"],                 pts: 30,  title: "Winners Q&A live" },
    { day: 27, types: ["proof", "metric"],      pts: 80,  title: "Report your earnings" },
    { day: 28, types: ["metric"],               pts: 60,  title: "Hit $1k milestone" },
    { day: 29, types: ["quiz", "self_check"],   pts: 40,  title: "Final knowledge test" },
    { day: 30, types: ["proof"],                pts: 100, title: "Submit $2.5k proof" },
  ];
  return seed.map((d) => ({ types: d.types, pts: d.pts, title: d.title }));
}

const SEED_DAYS = buildSeedDays();

const DEFAULT_CONFIG: ChallengeConfig = {
  tagline: "Go from $0 to $2,500 in 30 days",
  duration_days: 30,
  cadence: "daily",
  grace_days: 1,
  catchup_enabled: true,
  leaderboard_enabled: true,
  points_board_enabled: true,
  earnings_board_enabled: true,
  earnings_require_proof: true,
  earnings_reset: "all_time",
  auto_advance_offer: {
    enabled: false,
    trigger: "day_complete",
    trigger_day: 1,
    window_hours: 48,
    discount_type: "percent",
    discount_value: 20,
  },
  reminders: {
    email: true,
    whatsapp: true,
    daily_unlock_time: "08:00",
    timezone: "Africa/Lagos",
    nudge_missed: true,
  },
};

// ── Shared style helpers ──────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--app-bg-elevated)",
  border: "1px solid var(--app-border)",
  borderRadius: 12,
};

const inputStyle: React.CSSProperties = {
  background: "var(--app-bg)",
  border: "1px solid var(--app-border-strong)",
  borderRadius: 8,
  padding: "9px 12px",
  color: "var(--app-text)",
  fontSize: 13.5,
  fontFamily: "inherit",
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  color: "var(--app-text-quiet)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 600,
  marginBottom: 6,
};

const btnPrimary: React.CSSProperties = {
  background: "var(--app-accent)",
  color: "#fff",
  border: "none",
  borderRadius: 9,
  padding: "8px 14px",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const btnDefault: React.CSSProperties = {
  background: "var(--app-surface-strong)",
  border: "1px solid var(--app-border-strong)",
  color: "var(--app-text)",
  borderRadius: 9,
  padding: "7px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const btnGhost: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--app-text-muted)",
  padding: "7px 12px",
  borderRadius: 9,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12.5,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-label="Toggle"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: 40,
        height: 23,
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        background: on ? "var(--app-accent)" : "var(--app-surface-strong)",
        flexShrink: 0,
        transition: "background 0.18s ease",
        outline: "none",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 17,
          height: 17,
          borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          left: on ? "calc(100% - 20px)" : 3,
          transition: "left 0.18s ease",
        }}
      />
    </button>
  );
}

// ── ChallengeBuilder ──────────────────────────────────────────────────────────

export default function ChallengeBuilder({ product, onSave, onToast }: ChallengeBuilderProps) {
  const [tab, setTab] = useState<ChallengeTab>("schedule");
  const [tasks, setTasks] = useState<ChallengeTask[]>([]);
  const [selectedDay, setSelectedDay] = useState(1);
  const [config, setConfig] = useState<ChallengeConfig>(product.challenge_config ?? DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Settings tab — access & pricing, completion, certificate (persisted on academy_products, not challenge_config)
  const [settingsPricingType, setSettingsPricingType] = useState(product.pricing_type ?? (product.price_ngn > 0 ? "one_time" : "free"));
  const [settingsPriceNgn, setSettingsPriceNgn] = useState(product.price_ngn);
  const [settingsCompareAtNgn, setSettingsCompareAtNgn] = useState(product.compare_price_ngn ?? 0);
  const [settingsCompletionPct, setSettingsCompletionPct] = useState(product.completion_threshold_pct ?? 100);
  const [settingsCertificate, setSettingsCertificate] = useState(product.certificate_enabled ?? true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Day editor state
  const [dayTitle, setDayTitle] = useState("");
  const [dayTaskTypes, setDayTaskTypes] = useState<string[]>([]);
  const [dayPoints, setDayPoints] = useState(30);
  const [savingDay, setSavingDay] = useState(false);

  // Per-type detail config — re-synced from the matching task whenever selectedDay/tasks change
  const [dayLessonId, setDayLessonId] = useState<string>("");
  const [dayProofConfig, setDayProofConfig] = useState<ProofConfig>(DEFAULT_PROOF_CONFIG);
  const [dayMetricConfig, setDayMetricConfig] = useState<MetricConfig>(DEFAULT_METRIC_CONFIG);
  const [dayLiveSessionId, setDayLiveSessionId] = useState<string>("");
  const [dayQuizConfig, setDayQuizConfig] = useState<QuizConfig>(DEFAULT_QUIZ_CONFIG);
  const [daySelfCheckConfig, setDaySelfCheckConfig] = useState<SelfCheckConfig>(DEFAULT_SELF_CHECK_CONFIG);

  // Video upload state for the lesson task panel
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const videoFileRef = useRef<HTMLInputElement | null>(null);

  // Lessons + live sessions available to link from this product (for the lesson/live pickers)
  const [lessons, setLessons] = useState<AcademyLessonOption[]>([]);
  const [liveSessionOptions, setLiveSessionOptions] = useState<LiveSessionOption[]>([]);
  const [creatingLesson, setCreatingLesson] = useState(false);
  const [creatingLiveSession, setCreatingLiveSession] = useState(false);
  const [showLiveForm, setShowLiveForm] = useState(false);
  const [liveForm, setLiveForm] = useState({ title: "", scheduled_at: "", duration_mins: 60, platform: "zoom", join_url: "" });

  // Load tasks on mount
  useEffect(() => {
    setLoadingTasks(true);
    fetch(`/api/admin/academy/challenge-tasks?product_id=${product.id}`)
      .then(r => r.json())
      .then(d => { setTasks(d.tasks ?? []); })
      .catch(() => {})
      .finally(() => setLoadingTasks(false));
  }, [product.id]);

  // Load lessons + live sessions available to link (for the lesson/live task-type pickers)
  const reloadLessons = useCallback(() => {
    fetch(`/api/admin/academy/lessons?product_id=${product.id}`)
      .then(r => r.json())
      .then(d => setLessons((d.lessons ?? []).map((l: { id: string; title: string; lesson_type: string; mux_playback_id?: string | null }) => ({ id: l.id, title: l.title, lesson_type: l.lesson_type, mux_playback_id: l.mux_playback_id ?? null }))))
      .catch(() => {});
  }, [product.id]);
  const reloadLiveSessions = useCallback(() => {
    fetch(`/api/admin/academy/live-sessions?product_id=${product.id}`)
      .then(r => r.json())
      .then(d => setLiveSessionOptions(d.sessions ?? []))
      .catch(() => {});
  }, [product.id]);
  useEffect(() => { reloadLessons(); reloadLiveSessions(); }, [reloadLessons, reloadLiveSessions]);

  // Sync day editor when day changes — reads each task's config by its OWN
  // task_type (not array index), so a day with e.g. ["lesson","metric"] correctly
  // restores the lesson_id on the lesson task and the metric_config on the metric task.
  useEffect(() => {
    const dayTasks = tasks.filter(t => t.day === selectedDay);
    if (dayTasks.length > 0) {
      setDayTitle(dayTasks[0].title || `Day ${selectedDay}`);
      setDayTaskTypes(dayTasks.map(t => t.task_type));
      setDayPoints(dayTasks.reduce((s, t) => s + t.points, 0));

      const lessonTask = dayTasks.find(t => t.task_type === "lesson");
      setDayLessonId(lessonTask?.lesson_id ?? "");

      const proofTask = dayTasks.find(t => t.task_type === "proof");
      setDayProofConfig(proofTask?.proof_config ?? DEFAULT_PROOF_CONFIG);

      const metricTask = dayTasks.find(t => t.task_type === "metric");
      setDayMetricConfig(metricTask?.metric_config ?? DEFAULT_METRIC_CONFIG);

      const liveTask = dayTasks.find(t => t.task_type === "live");
      setDayLiveSessionId(liveTask?.live_session_id ?? "");

      const quizTask = dayTasks.find(t => t.task_type === "quiz");
      setDayQuizConfig(quizTask?.quiz_config ?? DEFAULT_QUIZ_CONFIG);

      const selfCheckTask = dayTasks.find(t => t.task_type === "self_check");
      setDaySelfCheckConfig(selfCheckTask?.self_check_config ?? DEFAULT_SELF_CHECK_CONFIG);
    } else {
      // Use seed data (only for the legacy 30-day challenge)
      const seed = (config.duration_days ?? 30) >= 30 ? SEED_DAYS[selectedDay - 1] : undefined;
      setDayProofConfig(DEFAULT_PROOF_CONFIG);
      setDayMetricConfig(DEFAULT_METRIC_CONFIG);
      setDayLiveSessionId("");
      setDayQuizConfig(DEFAULT_QUIZ_CONFIG);
      setDaySelfCheckConfig(DEFAULT_SELF_CHECK_CONFIG);
      setDayLessonId("");
      if (seed) {
        setDayTitle(seed.title);
        setDayTaskTypes(seed.types);
        setDayPoints(seed.pts);
      } else {
        setDayTitle(`Day ${selectedDay}`);
        setDayTaskTypes(["lesson"]);
        setDayPoints(30);
      }
    }
  }, [selectedDay, tasks]);

  const saveConfig = useCallback(async () => {
    setSaving(true);
    try {
      await onSave({ challenge_config: config });
      onToast("Config saved");
    } finally {
      setSaving(false);
    }
  }, [config, onSave, onToast]);

  // Settings tab — saves both the academy_products columns (pricing, completion,
  // certificate) and the challenge_config's start_mode in one action.
  const saveSettings = useCallback(async () => {
    setSavingSettings(true);
    try {
      await onSave({
        pricing_type: settingsPricingType,
        price_ngn: settingsPricingType === "free" ? 0 : settingsPriceNgn,
        compare_price_ngn: settingsCompareAtNgn > 0 ? settingsCompareAtNgn : null,
        completion_threshold_pct: settingsCompletionPct,
        certificate_enabled: settingsCertificate,
        challenge_config: config,
      });
      onToast("Settings saved");
    } finally {
      setSavingSettings(false);
    }
  }, [onSave, onToast, settingsPricingType, settingsPriceNgn, settingsCompareAtNgn, settingsCompletionPct, settingsCertificate, config]);

  // Per-type config to persist for the currently selected day's task types.
  function configFor(type: string): Record<string, unknown> {
    if (type === "lesson") return { lesson_id: dayLessonId || null };
    if (type === "proof") return { proof_config: dayProofConfig };
    if (type === "metric") return { metric_config: dayMetricConfig };
    if (type === "live") return { live_session_id: dayLiveSessionId || null };
    if (type === "quiz") return { quiz_config: dayQuizConfig };
    if (type === "self_check") return { self_check_config: daySelfCheckConfig };
    return {};
  }

  // Reconciles the day's tasks against `dayTaskTypes` by TYPE (not array index),
  // so adding/removing a task type actually creates/deletes the right row instead
  // of silently dropping the change and reverting on the next tasks-sync.
  async function saveTask() {
    setSavingDay(true);
    try {
      const dayTasks = tasks.filter(t => t.day === selectedDay);
      const existingTypes = new Set<string>(dayTasks.map(t => t.task_type));
      const wantedTypes = new Set(dayTaskTypes);
      const ptsEach = Math.floor(dayPoints / (dayTaskTypes.length || 1));

      const toUpdate = dayTasks.filter(t => wantedTypes.has(t.task_type));
      const toDelete = dayTasks.filter(t => !wantedTypes.has(t.task_type));
      const toCreate = dayTaskTypes.filter(type => !existingTypes.has(type));

      const [updated, , created] = await Promise.all([
        Promise.all(toUpdate.map(t =>
          fetch("/api/admin/academy/challenge-tasks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: t.id, title: dayTitle, points: ptsEach, ...configFor(t.task_type) }),
          }).then(r => r.json())
        )),
        Promise.all(toDelete.map(t =>
          fetch(`/api/admin/academy/challenge-tasks?id=${t.id}`, { method: "DELETE" })
        )),
        Promise.all(toCreate.map((type, i) =>
          fetch("/api/admin/academy/challenge-tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              product_id: product.id,
              day: selectedDay,
              task_type: type,
              title: dayTitle,
              points: ptsEach,
              position: toUpdate.length + i,
              is_published: true,
              ...configFor(type),
            }),
          }).then(r => r.json())
        )),
      ]);

      const deletedIds = new Set(toDelete.map(t => t.id));
      setTasks(prev => {
        let next = prev.filter(t => !deletedIds.has(t.id));
        for (const r of updated) if (r.task) next = next.map(x => x.id === r.task.id ? r.task : x);
        for (const r of created) if (r.task) next = [...next, r.task];
        return next;
      });
      onToast(`Day ${selectedDay} saved`);
    } finally {
      setSavingDay(false);
    }
  }

  async function deleteDay() {
    const dayTasks = tasks.filter(t => t.day === selectedDay);
    if (dayTasks.length === 0) return;
    await Promise.all(dayTasks.map(t =>
      fetch(`/api/admin/academy/challenge-tasks?id=${t.id}`, { method: "DELETE" })
    ));
    setTasks(prev => prev.filter(t => t.day !== selectedDay));
    onToast(`Day ${selectedDay} cleared`);
  }

  async function duplicateDay() {
    const dayTasks = tasks.filter(t => t.day === selectedDay);
    if (dayTasks.length === 0) return;
    // Find next empty day
    const existingDays = new Set(tasks.map(t => t.day));
    let nextDay = selectedDay + 1;
    while (existingDays.has(nextDay)) nextDay++;
    for (let i = 0; i < dayTasks.length; i++) {
      const t = dayTasks[i];
      const res = await fetch("/api/admin/academy/challenge-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          day: nextDay,
          task_type: t.task_type,
          title: t.title,
          points: t.points,
          position: i,
          is_published: t.is_published,
        }),
      }).then(r => r.json());
      if (res.task) setTasks(prev => [...prev, res.task]);
    }
    setSelectedDay(nextDay);
    onToast(`Duplicated to Day ${nextDay}`);
  }

  async function createLesson() {
    setCreatingLesson(true);
    try {
      let sectionId: string | undefined;
      const sectionsRes = await fetch(`/api/admin/academy/sections?product_id=${product.id}`).then(r => r.json());
      sectionId = sectionsRes.sections?.[0]?.id;
      if (!sectionId) {
        const newSection = await fetch("/api/admin/academy/sections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: product.id, title: "Challenge lessons" }),
        }).then(r => r.json());
        sectionId = newSection.section?.id;
      }
      if (!sectionId) { onToast("Could not create a section for this lesson"); return; }

      const res = await fetch("/api/admin/academy/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_id: sectionId,
          product_id: product.id,
          title: dayTitle || `Day ${selectedDay}`,
          lesson_type: "video",
        }),
      }).then(r => r.json());

      if (res.lesson) {
        setDayLessonId(res.lesson.id);
        reloadLessons();
        onToast("Lesson created — upload its video below");
      } else {
        onToast(res.error ?? "Failed to create lesson");
      }
    } finally {
      setCreatingLesson(false);
    }
  }

  async function createLiveSession(form: { title: string; scheduled_at: string; duration_mins: number; platform: string; join_url: string }) {
    setCreatingLiveSession(true);
    try {
      const res = await fetch("/api/admin/academy/live-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: product.id, ...form }),
      }).then(r => r.json());
      if (res.session) {
        setDayLiveSessionId(res.session.id);
        reloadLiveSessions();
        onToast("Live session created");
      } else {
        onToast(res.error ?? "Failed to create live session");
      }
    } finally {
      setCreatingLiveSession(false);
    }
  }

  async function uploadVideoForLesson(lessonId: string, file: File) {
    setVideoUploading(true);
    setVideoProgress(0);
    try {
      const { upload_id, url } = await fetch(`/api/admin/academy/lessons/${lessonId}/upload-url`, {
        method: "POST",
      }).then(r => r.json());
      if (!url) throw new Error("Could not get upload URL");

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setVideoProgress(Math.round((e.loaded / e.total) * 88));
        };
        xhr.onload = () => (xhr.status < 400 ? resolve() : reject(new Error(`Upload HTTP ${xhr.status}`)));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.open("PUT", url);
        xhr.send(file);
      });

      setVideoProgress(92);

      // Poll until Mux processes the video and writes back mux_playback_id
      let attempts = 0;
      let playbackId: string | null = null;
      while (attempts < 60 && !playbackId) {
        await new Promise(r => setTimeout(r, 5000));
        const res = await fetch(`/api/admin/academy/lessons/${lessonId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mux_upload_id: upload_id }),
        }).then(r => r.json());
        playbackId = res.lesson?.mux_playback_id ?? null;
        attempts++;
      }

      if (playbackId) {
        setLessons(prev => prev.map(l => l.id === lessonId ? { ...l, mux_playback_id: playbackId } : l));
        setVideoProgress(100);
        onToast("Video ready!");
      } else {
        onToast("Upload sent — video is still processing, check back soon");
      }
    } catch (err) {
      onToast("Upload failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setVideoUploading(false);
    }
  }

  async function addDay() {
    const maxDay = tasks.length > 0 ? Math.max(...tasks.map(t => t.day)) : 0;
    const nextDay = maxDay + 1;
    const seed = (config.duration_days ?? 30) >= 30 ? SEED_DAYS[nextDay - 1] : undefined;
    const res = await fetch("/api/admin/academy/challenge-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: product.id,
        day: nextDay,
        task_type: seed?.types[0] ?? "lesson",
        title: seed?.title ?? `Day ${nextDay}`,
        points: seed?.pts ?? 30,
        position: 0,
        is_published: true,
      }),
    }).then(r => r.json());
    if (res.task) {
      setTasks(prev => [...prev, res.task]);
      setSelectedDay(nextDay);
      onToast(`Day ${nextDay} added`);
    }
  }

  // Always show every day of the challenge (1..duration_days) so days without
  // tasks yet still appear as empty "Draft" days to fill in — plus any task days
  // beyond that. The 30-day $0→$2.5k SEED_DAYS content only makes sense for the
  // legacy 30-day challenge, so it's suppressed for shorter challenges.
  const durationDays = config.duration_days ?? 30;
  const useSeed = durationDays >= 30;
  const uniqueDays = loadingTasks
    ? Array.from({ length: durationDays }, (_, i) => i + 1)
    : (() => {
        const s = new Set<number>(tasks.map(t => t.day));
        for (let d = 1; d <= durationDays; d++) s.add(d);
        return [...s].sort((a, b) => a - b);
      })();

  const totalTasks = tasks.length || (useSeed ? uniqueDays.length : 0);
  const totalPoints = tasks.reduce((s, t) => s + t.points, 0) || (useSeed ? SEED_DAYS.reduce((s, d) => s + d.pts, 0) : 0);
  const liveSessions = tasks.filter(t => t.task_type === "live").length || (useSeed ? SEED_DAYS.filter(d => d.types.includes("live")).length : 0);

  // ── Tab definitions ────────────────────────────────────────────────────────
  const TABS: { key: ChallengeTab; label: string; icon: typeof Settings02Icon }[] = [
    { key: "setup",       label: "Setup",            icon: Settings02Icon },
    { key: "schedule",    label: "Schedule",          icon: Calendar03Icon },
    { key: "rewards",     label: "Rewards & Points",  icon: Award01Icon },
    { key: "leaderboard", label: "Leaderboard",       icon: ChartIcon },
    { key: "offers",      label: "Funnel & Offers",   icon: ShoppingBag01Icon },
    { key: "reminders",   label: "Reminders",         icon: Notification01Icon },
    { key: "settings",    label: "Settings",          icon: Settings02Icon },
  ];

  return (
    <div className="v2-app" style={{ color: "var(--app-text)" }}>
      {/* Tab bar */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid var(--app-border)",
        marginBottom: 24,
        gap: 0,
        overflowX: "auto",
      }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? "var(--app-text)" : "var(--app-text-muted)",
                background: "transparent",
                border: "none",
                borderBottom: active ? "2px solid var(--app-accent)" : "2px solid transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                marginBottom: -1,
                transition: "color 0.15s ease",
              }}
            >
              <HugeiconsIcon icon={t.icon} size={14} strokeWidth={1.8} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── SETUP tab ──────────────────────────────────────────────────────── */}
      {tab === "setup" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>
          {/* Basics card */}
          <div style={{ ...cardStyle, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>Basics</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>Challenge name</label>
                <input
                  style={inputStyle}
                  defaultValue={product.name}
                  placeholder="30-Day Client Acquisition Challenge"
                />
              </div>
              <div>
                <label style={labelStyle}>Tagline</label>
                <input
                  style={inputStyle}
                  value={config.tagline ?? ""}
                  onChange={e => setConfig(c => ({ ...c, tagline: e.target.value }))}
                  placeholder="Go from $0 to $2,500 in 30 days"
                />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" }}
                  placeholder="What challengers will achieve…"
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Duration (days)</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={config.duration_days ?? 30}
                    onChange={e => setConfig(c => ({ ...c, duration_days: parseInt(e.target.value) || 30 }))}
                    min={1}
                    max={365}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Cadence</label>
                  <select
                    style={inputStyle}
                    value={config.cadence ?? "daily"}
                    onChange={e => setConfig(c => ({ ...c, cadence: e.target.value as "daily" | "weekly" }))}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <button style={btnPrimary} onClick={saveConfig} disabled={saving}>
                <HugeiconsIcon icon={FloppyDiskIcon} size={13} strokeWidth={2} />
                {saving ? "Saving…" : "Save basics"}
              </button>
            </div>
          </div>

          {/* Cover card */}
          <div style={{ ...cardStyle, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>Cover &amp; trailer</h3>
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
              <div style={{
                width: 200,
                height: 118,
                borderRadius: 10,
                background: "linear-gradient(135deg, #1a1a2e 0%, #0e0e13 100%)",
                border: "1px solid var(--app-border)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: "#F97316", fontFamily: "ui-monospace, monospace" }}>$0→$2.5k</span>
                <span style={{ fontSize: 10, color: "var(--app-text-quiet)", marginTop: 4 }}>Cover image</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button style={btnDefault}>
                  Replace cover
                </button>
                <button style={btnDefault}>
                  <HugeiconsIcon icon={PlayCircleIcon} size={13} strokeWidth={1.8} />
                  Add trailer
                </button>
                <p style={{ fontSize: 11, color: "var(--app-text-quiet)", lineHeight: 1.5 }}>
                  Recommended: 1280×720px, JPG or PNG.<br />
                  Trailer: MP4, max 2 minutes.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SCHEDULE tab ───────────────────────────────────────────────────── */}
      {tab === "schedule" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Summary strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            {[
              { label: "Duration",    value: `${config.duration_days ?? 30} days` },
              { label: "Cadence",     value: config.cadence === "weekly" ? "Weekly" : "Daily" },
              { label: "Total tasks", value: totalTasks.toString() },
              { label: "Total points", value: totalPoints.toLocaleString() },
              { label: "Live sessions", value: liveSessions.toString() },
            ].map(s => (
              <div key={s.label} style={{ ...cardStyle, padding: "14px 16px" }}>
                <p style={{ fontSize: 10, color: "var(--app-text-quiet)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 6 }}>{s.label}</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: "var(--app-text)", fontVariantNumeric: "tabular-nums" }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Two-column layout */}
          <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, alignItems: "start" }}>
            {/* LEFT: Day list */}
            <div style={{ ...cardStyle, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--app-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Schedule</span>
                <button style={btnDefault} onClick={addDay}>
                  <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
                  Add day
                </button>
              </div>
              <div style={{ maxHeight: 600, overflowY: "auto" }}>
                {loadingTasks ? (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>Loading…</div>
                ) : (
                  (() => {
                    const weeks: Record<number, number[]> = {};
                    uniqueDays.forEach(d => {
                      const w = Math.ceil(d / 7);
                      if (!weeks[w]) weeks[w] = [];
                      weeks[w].push(d);
                    });
                    return Object.entries(weeks).map(([weekNum, days]) => (
                      <div key={weekNum}>
                        <div style={{
                          padding: "8px 14px",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--app-text-quiet)",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          background: "var(--app-bg-sunken)",
                          borderBottom: "1px solid var(--app-border)",
                        }}>
                          WEEK {weekNum} · {WEEK_NAMES[parseInt(weekNum)] ?? ""}
                        </div>
                        {days.map(d => {
                          const dayTasks = tasks.filter(t => t.day === d);
                          const seed = useSeed ? SEED_DAYS[d - 1] : undefined;
                          const types = dayTasks.length > 0 ? dayTasks.map(t => t.task_type) : (seed?.types ?? ["lesson"]);
                          const pts = dayTasks.reduce((s, t) => s + t.points, 0) || seed?.pts || 0;
                          const isSelected = selectedDay === d;
                          const hasRealData = dayTasks.length > 0;
                          return (
                            <button
                              key={d}
                              onClick={() => setSelectedDay(d)}
                              style={{
                                width: "100%",
                                textAlign: "left",
                                padding: "10px 14px",
                                background: isSelected ? "var(--app-accent-soft)" : "transparent",
                                border: "none",
                                borderBottom: "1px solid var(--app-border)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                fontFamily: "inherit",
                                transition: "background 0.12s ease",
                              }}
                            >
                              {/* Day chip */}
                              <span style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                background: isSelected ? "var(--app-accent)" : "var(--app-surface-strong)",
                                color: isSelected ? "#fff" : "var(--app-text-muted)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}>{d}</span>
                              {/* Title */}
                              <span style={{
                                flex: 1,
                                fontSize: 12.5,
                                color: isSelected ? "var(--app-text)" : hasRealData ? "var(--app-text)" : "var(--app-text-muted)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}>
                                {dayTasks[0]?.title ?? seed?.title ?? `Day ${d}`}
                              </span>
                              {/* Type dots */}
                              <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                                {types.slice(0, 3).map((type, i) => (
                                  <span key={i} style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    background: TASK_COLORS[type] ?? "#9A9AA8",
                                  }} />
                                ))}
                              </span>
                              {/* Points badge */}
                              <span style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "var(--app-text-quiet)",
                                flexShrink: 0,
                              }}>{pts}pt</span>
                            </button>
                          );
                        })}
                      </div>
                    ));
                  })()
                )}
              </div>
            </div>

            {/* RIGHT: Day editor */}
            <div style={{ ...cardStyle, overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--app-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    background: "var(--app-accent)",
                    color: "#fff",
                    borderRadius: 8,
                    padding: "3px 10px",
                    fontSize: 13,
                    fontWeight: 700,
                  }}>Day {selectedDay}</span>
                  <span style={{ fontSize: 11, color: "var(--app-text-quiet)" }}>
                    Week {Math.ceil(selectedDay / 7)} · {WEEK_NAMES[Math.ceil(selectedDay / 7)] ?? ""}
                  </span>
                </div>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: tasks.filter(t => t.day === selectedDay).length > 0
                    ? "rgba(52,211,153,0.1)" : "var(--app-surface-strong)",
                  color: tasks.filter(t => t.day === selectedDay).length > 0
                    ? "var(--app-success)" : "var(--app-text-quiet)",
                  border: "1px solid",
                  borderColor: tasks.filter(t => t.day === selectedDay).length > 0
                    ? "rgba(52,211,153,0.2)" : "var(--app-border)",
                }}>
                  {tasks.filter(t => t.day === selectedDay).length > 0 ? "Published" : "Draft"}
                </span>
              </div>

              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
                {/* Day title */}
                <div>
                  <label style={labelStyle}>Day title</label>
                  <input
                    style={inputStyle}
                    value={dayTitle}
                    onChange={e => setDayTitle(e.target.value)}
                    placeholder="What happens today?"
                  />
                </div>

                {/* Task type picker */}
                <div>
                  <label style={labelStyle}>Task types</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {(["lesson", "proof", "self_check", "metric", "live", "quiz"] as const).map(type => {
                      const active = dayTaskTypes.includes(type);
                      const Icon = TASK_ICONS[type];
                      return (
                        <button
                          key={type}
                          onClick={() => {
                            setDayTaskTypes(prev =>
                              prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                            );
                          }}
                          style={{
                            padding: "10px 8px",
                            borderRadius: 8,
                            border: `1.5px solid ${active ? TASK_COLORS[type] : "var(--app-border)"}`,
                            background: active ? `${TASK_COLORS[type]}14` : "var(--app-surface)",
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 6,
                            fontFamily: "inherit",
                            transition: "all 0.12s ease",
                          }}
                        >
                          <HugeiconsIcon icon={Icon} size={16} strokeWidth={1.8} color={active ? TASK_COLORS[type] : "var(--app-text-quiet)"} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: active ? TASK_COLORS[type] : "var(--app-text-quiet)" }}>
                            {TASK_LABELS[type]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Per-type detail editors — what each enabled task type actually needs configured */}
                {dayTaskTypes.includes("lesson") && (
                  <div style={{ ...cardStyle, padding: 14, background: "var(--app-bg)" }}>
                    <label style={labelStyle}>Lesson video</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <select
                        style={{ ...inputStyle, cursor: "pointer" }}
                        value={dayLessonId}
                        onChange={e => setDayLessonId(e.target.value)}
                      >
                        <option value="">Select a lesson…</option>
                        {lessons.map(l => (
                          <option key={l.id} value={l.id}>{l.title}</option>
                        ))}
                      </select>
                      <button style={btnDefault} onClick={createLesson} disabled={creatingLesson}>
                        <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
                        {creatingLesson ? "Creating…" : "New"}
                      </button>
                    </div>
                    {dayLessonId && (() => {
                      const sel = lessons.find(l => l.id === dayLessonId);
                      return (
                        <div style={{ marginTop: 12 }}>
                          <label style={{ ...labelStyle, marginBottom: 6 }}>Video</label>
                          {sel?.mux_playback_id ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 12, color: "#34D399", display: "flex", alignItems: "center", gap: 5 }}>
                                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={2} color="#34D399" />
                                Video ready
                              </span>
                              <button style={btnDefault} onClick={() => videoFileRef.current?.click()} disabled={videoUploading}>
                                Replace video
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 12, color: "var(--app-text-muted)" }}>No video uploaded yet</span>
                              <button style={btnDefault} onClick={() => videoFileRef.current?.click()} disabled={videoUploading}>
                                <HugeiconsIcon icon={Video01Icon} size={13} strokeWidth={1.8} />
                                {videoUploading ? `Uploading ${videoProgress}%` : "Upload video"}
                              </button>
                            </div>
                          )}
                          {videoUploading && (
                            <div style={{ marginTop: 8, height: 4, background: "var(--app-border)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${videoProgress}%`, background: "var(--app-accent)", borderRadius: 2, transition: "width 0.3s ease" }} />
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <input
                      ref={videoFileRef}
                      type="file"
                      accept="video/*"
                      style={{ display: "none" }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file && dayLessonId) uploadVideoForLesson(dayLessonId, file);
                        e.target.value = "";
                      }}
                    />
                    {dayLessonId && (
                      <div style={{ marginTop: 14, borderTop: "1px solid var(--app-border)", paddingTop: 14 }}>
                        <LessonContentEditor lessonId={dayLessonId} />
                      </div>
                    )}
                  </div>
                )}

                {dayTaskTypes.includes("self_check") && (
                  <div style={{ ...cardStyle, padding: 14, background: "var(--app-bg)" }}>
                    <label style={labelStyle}>Self-check</label>
                    <label style={{ ...labelStyle, marginBottom: 4 }}>Prompt shown to learner</label>
                    <textarea
                      style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
                      value={daySelfCheckConfig.prompt}
                      onChange={e => setDaySelfCheckConfig({ prompt: e.target.value })}
                      placeholder="e.g. Did you complete your practice session today? Reflect on what went well and what you'll do differently."
                    />
                    <p style={{ fontSize: 11, color: "var(--app-text-quiet)", marginTop: 6, lineHeight: 1.5 }}>
                      The learner marks this complete themselves — no external validation required.
                    </p>
                  </div>
                )}

                {dayTaskTypes.includes("proof") && (
                  <div style={{ ...cardStyle, padding: 14, background: "var(--app-bg)" }}>
                    <label style={labelStyle}>Proof submission</label>
                    <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
                      {(["image", "file", "link", "text"] as const).map(kind => {
                        const checked = dayProofConfig.accepts.includes(kind);
                        return (
                          <label key={kind} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--app-text)", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setDayProofConfig(prev => ({
                                ...prev,
                                accepts: checked ? prev.accepts.filter(a => a !== kind) : [...prev.accepts, kind],
                              }))}
                            />
                            {kind[0].toUpperCase() + kind.slice(1)}
                          </label>
                        );
                      })}
                    </div>
                    <label style={labelStyle}>Prompt shown to learner</label>
                    <textarea
                      style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
                      value={dayProofConfig.prompt}
                      onChange={e => setDayProofConfig(prev => ({ ...prev, prompt: e.target.value }))}
                      placeholder="e.g. Screenshot proof that you sent your 20 messages"
                    />
                  </div>
                )}

                {dayTaskTypes.includes("metric") && (
                  <div style={{ ...cardStyle, padding: 14, background: "var(--app-bg)" }}>
                    <label style={labelStyle}>Hit metric</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4 }}>Source</label>
                        <select
                          style={{ ...inputStyle, cursor: "pointer" }}
                          value={dayMetricConfig.source}
                          onChange={e => setDayMetricConfig(prev => ({ ...prev, source: e.target.value as MetricConfig["source"] }))}
                        >
                          <option value="leadash_outbox">Leadash outbox (auto)</option>
                          <option value="has_inbox">Inbox connected (auto)</option>
                          <option value="has_plan">Plan selected (auto)</option>
                          <option value="manual">Manual self-report</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4 }}>Metric</label>
                        <input
                          style={inputStyle}
                          value={dayMetricConfig.metric}
                          onChange={e => setDayMetricConfig(prev => ({ ...prev, metric: e.target.value }))}
                          placeholder="messages_sent"
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4 }}>Target</label>
                        <input
                          type="number"
                          style={inputStyle}
                          value={dayMetricConfig.target}
                          onChange={e => setDayMetricConfig(prev => ({ ...prev, target: parseInt(e.target.value) || 0 }))}
                          min={1}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {dayTaskTypes.includes("live") && (
                  <div style={{ ...cardStyle, padding: 14, background: "var(--app-bg)" }}>
                    <label style={labelStyle}>Live session</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <select
                        style={{ ...inputStyle, cursor: "pointer" }}
                        value={dayLiveSessionId}
                        onChange={e => setDayLiveSessionId(e.target.value)}
                      >
                        <option value="">Select a session…</option>
                        {liveSessionOptions.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.lesson_title || "Live session"} · {new Date(s.scheduled_at).toLocaleString()}
                          </option>
                        ))}
                      </select>
                      <button style={btnDefault} onClick={() => setShowLiveForm(v => !v)}>
                        <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
                        New
                      </button>
                    </div>
                    {showLiveForm && (
                      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--app-border)", paddingTop: 12 }}>
                        <input style={inputStyle} placeholder="Session title" value={liveForm.title}
                          onChange={e => setLiveForm(f => ({ ...f, title: e.target.value }))} />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8 }}>
                          <input type="datetime-local" style={inputStyle} value={liveForm.scheduled_at}
                            onChange={e => setLiveForm(f => ({ ...f, scheduled_at: e.target.value }))} />
                          <input type="number" style={inputStyle} placeholder="Mins" value={liveForm.duration_mins}
                            onChange={e => setLiveForm(f => ({ ...f, duration_mins: parseInt(e.target.value) || 60 }))} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8 }}>
                          <select style={{ ...inputStyle, cursor: "pointer" }} value={liveForm.platform}
                            onChange={e => setLiveForm(f => ({ ...f, platform: e.target.value }))}>
                            <option value="zoom">Zoom</option>
                            <option value="meet">Google Meet</option>
                            <option value="custom">Custom</option>
                          </select>
                          <input style={inputStyle} placeholder="Join URL" value={liveForm.join_url}
                            onChange={e => setLiveForm(f => ({ ...f, join_url: e.target.value }))} />
                        </div>
                        <button
                          style={btnPrimary}
                          disabled={creatingLiveSession || !liveForm.title || !liveForm.scheduled_at || !liveForm.join_url}
                          onClick={async () => { await createLiveSession(liveForm); setShowLiveForm(false); }}
                        >
                          {creatingLiveSession ? "Creating…" : "Create session"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {dayTaskTypes.includes("quiz") && (
                  <div style={{ ...cardStyle, padding: 14, background: "var(--app-bg)" }}>
                    <label style={labelStyle}>Quiz questions</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {dayQuizConfig.questions.map((q, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                            <input
                              style={inputStyle}
                              placeholder={`Question ${i + 1}`}
                              value={q.q}
                              onChange={e => setDayQuizConfig(prev => ({
                                questions: prev.questions.map((x, j) => j === i ? { ...x, q: e.target.value } : x),
                              }))}
                            />
                            <input
                              style={inputStyle}
                              placeholder="Answer"
                              value={q.a}
                              onChange={e => setDayQuizConfig(prev => ({
                                questions: prev.questions.map((x, j) => j === i ? { ...x, a: e.target.value } : x),
                              }))}
                            />
                          </div>
                          <button
                            style={{ ...btnGhost, color: "var(--app-danger)", marginTop: 4 }}
                            onClick={() => setDayQuizConfig(prev => ({ questions: prev.questions.filter((_, j) => j !== i) }))}
                          >
                            <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.8} />
                          </button>
                        </div>
                      ))}
                      <button
                        style={btnGhost}
                        onClick={() => setDayQuizConfig(prev => ({ questions: [...prev.questions, { q: "", a: "" }] }))}
                      >
                        <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
                        Add question
                      </button>
                    </div>
                  </div>
                )}

                {/* Points + unlocks */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Total points for this day</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={dayPoints}
                      onChange={e => setDayPoints(parseInt(e.target.value) || 0)}
                      min={0}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Unlocks</label>
                    <div style={{
                      ...inputStyle,
                      background: "var(--app-surface)",
                      color: "var(--app-text-muted)",
                      cursor: "default",
                    }}>
                      {selectedDay === 1 ? "On enrollment" : `After Day ${selectedDay - 1}`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer actions */}
              <div style={{
                padding: "14px 20px",
                borderTop: "1px solid var(--app-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={btnGhost} onClick={duplicateDay}>
                    <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.8} />
                    Duplicate
                  </button>
                  <button
                    style={{ ...btnGhost, color: "var(--app-danger)" }}
                    onClick={deleteDay}
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.8} />
                    Clear day
                  </button>
                </div>
                <button style={btnPrimary} onClick={saveTask} disabled={savingDay}>
                  <HugeiconsIcon icon={FloppyDiskIcon} size={13} strokeWidth={2} />
                  {savingDay ? "Saving…" : "Save day"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REWARDS tab ────────────────────────────────────────────────────── */}
      {tab === "rewards" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>
          {/* Points engine */}
          <div style={{ ...cardStyle, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Points engine</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { label: "Complete daily task",      value: "Task value",  color: "var(--app-info)" },
                { label: "Streak bonus per day",     value: "+10 pts",     color: "var(--app-success)" },
                { label: "Submit proof on time",     value: "+15 pts",     color: "var(--app-accent)" },
                { label: "First to finish the day",  value: "+25 pts",     color: "var(--app-warning)" },
                { label: "Miss a day",               value: "Streak resets", color: "var(--app-danger)" },
              ].map((rule, i) => (
                <div key={i} style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 0",
                  borderBottom: i < 4 ? "1px solid var(--app-border)" : "none",
                }}>
                  <span style={{ fontSize: 13.5, color: "var(--app-text)" }}>{rule.label}</span>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: rule.color,
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: "ui-monospace, monospace",
                  }}>{rule.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Badges */}
          <div style={{ ...cardStyle, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Badges</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { name: "Fast Starter",  desc: "Complete Day 3 with a streak",        color: "#34D399", icon: BoltIcon },
                { name: "Week Warrior",  desc: "7-day unbroken streak",               color: "#F97316", icon: Award01Icon },
                { name: "First Dollar",  desc: "Report first earnings",                color: "#FBBF24", icon: Award03Icon },
                { name: "Closer",        desc: "Prove $500+ earned",                   color: "#A78BFA", icon: Medal01Icon },
                { name: "Graduate",      desc: "Complete all 30 days",                 color: "#60A5FA", icon: Mortarboard01Icon },
              ].map(badge => {
                const Icon = badge.icon;
                return (
                  <div key={badge.name} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: 14,
                    background: "var(--app-surface)",
                    border: "1px solid var(--app-border)",
                    borderRadius: 10,
                  }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: `${badge.color}1a`,
                      border: `1px solid ${badge.color}33`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <HugeiconsIcon icon={Icon} size={18} strokeWidth={1.8} color={badge.color} />
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)" }}>{badge.name}</p>
                      <p style={{ fontSize: 11, color: "var(--app-text-quiet)", marginTop: 2 }}>{badge.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prizes */}
          <div style={{ ...cardStyle, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Prizes</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { rank: 1, medal: "🥇", color: "#FBBF24", prize: "3 months Academy access + ₦50,000 cash" },
                { rank: 2, medal: "🥈", color: "#9CA3AF", prize: "2 months Academy access + ₦25,000 cash" },
                { rank: 3, medal: "🥉", color: "#D97706", prize: "1 month Academy access + Leadash Pro" },
              ].map(p => (
                <div key={p.rank} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  background: "var(--app-surface)",
                  border: "1px solid var(--app-border)",
                  borderRadius: 10,
                }}>
                  <span style={{ fontSize: 22 }}>{p.medal}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "var(--app-text)" }}>{p.prize}</span>
                  <button style={btnGhost}>
                    <HugeiconsIcon icon={PencilEdit02Icon} size={13} strokeWidth={1.8} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── LEADERBOARD tab ────────────────────────────────────────────────── */}
      {tab === "leaderboard" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 600 }}>
          {/* Toggle card */}
          <div style={{ ...cardStyle, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text)" }}>Show the leaderboard to learners</p>
                <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: 4 }}>
                  Challengers can see rankings during the live challenge.
                </p>
              </div>
              <Toggle
                on={config.leaderboard_enabled ?? true}
                onChange={v => setConfig(c => ({ ...c, leaderboard_enabled: v }))}
              />
            </div>
          </div>

          {/* Boards */}
          <div style={{ ...cardStyle, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Boards</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(249,115,22,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <HugeiconsIcon icon={Award01Icon} size={16} strokeWidth={1.8} color="var(--app-accent)" />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>Points board</p>
                    <p style={{ fontSize: 11, color: "var(--app-text-quiet)" }}>Ranked by accumulated challenge points</p>
                  </div>
                </div>
                <Toggle
                  on={config.points_board_enabled ?? true}
                  onChange={v => setConfig(c => ({ ...c, points_board_enabled: v }))}
                />
              </div>
              <div style={{ height: 1, background: "var(--app-border)" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(52,211,153,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <HugeiconsIcon icon={Activity01Icon} size={16} strokeWidth={1.8} color="var(--app-success)" />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>Earnings board</p>
                    <p style={{ fontSize: 11, color: "var(--app-text-quiet)" }}>Ranked by self-reported USD earnings</p>
                  </div>
                </div>
                <Toggle
                  on={config.earnings_board_enabled ?? true}
                  onChange={v => setConfig(c => ({ ...c, earnings_board_enabled: v }))}
                />
              </div>
            </div>
          </div>

          {/* Earnings verification */}
          <div style={{ ...cardStyle, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Earnings verification</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>Require proof for reported earnings</p>
                  <p style={{ fontSize: 11, color: "var(--app-text-quiet)", marginTop: 2 }}>
                    Challengers must upload a screenshot before earnings count.
                  </p>
                </div>
                <Toggle
                  on={config.earnings_require_proof ?? true}
                  onChange={v => setConfig(c => ({ ...c, earnings_require_proof: v }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Reset frequency</label>
                <select
                  style={inputStyle}
                  value={config.earnings_reset ?? "all_time"}
                  onChange={e => setConfig(c => ({ ...c, earnings_reset: e.target.value as "all_time" | "weekly" | "daily" }))}
                >
                  <option value="all_time">All-time (never reset)</option>
                  <option value="weekly">Reset weekly</option>
                  <option value="daily">Reset daily</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button style={btnPrimary} onClick={saveConfig} disabled={saving}>
              <HugeiconsIcon icon={FloppyDiskIcon} size={13} strokeWidth={2} />
              {saving ? "Saving…" : "Save leaderboard settings"}
            </button>
          </div>
        </div>
      )}

      {/* ── OFFERS tab ─────────────────────────────────────────────────────── */}
      {tab === "offers" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 680 }}>
          {/* Funnel map card */}
          <div style={{ ...cardStyle, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>This challenge sits in a funnel</h3>
            {/* Chain */}
            <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", paddingBottom: 4 }}>
              {[
                { label: "Free opt-in",       sub: "Lead magnet",      highlight: false },
                { label: "Free course",        sub: "Email sequence",   highlight: false },
                { label: "30-Day Challenge",   sub: "₦10,000",          highlight: true  },
                { label: "Academy Package",    sub: "₦135,000",         highlight: false },
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center" }}>
                  <div style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: step.highlight ? "var(--app-accent-soft)" : "var(--app-surface)",
                    border: `1px solid ${step.highlight ? "var(--app-accent-line)" : "var(--app-border)"}`,
                    textAlign: "center",
                    minWidth: 110,
                  }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: step.highlight ? "var(--app-accent)" : "var(--app-text)" }}>{step.label}</p>
                    <p style={{ fontSize: 11, color: "var(--app-text-quiet)", marginTop: 3 }}>{step.sub}</p>
                  </div>
                  {i < 3 && (
                    <div style={{ padding: "0 8px", color: "var(--app-text-quiet)" }}>
                      <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.8} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <button style={{ ...btnGhost, paddingLeft: 0, color: "var(--app-accent)", fontSize: 13 }}>
                Open funnel map
                <HugeiconsIcon icon={ArrowRight01Icon} size={13} strokeWidth={1.8} />
              </button>
            </div>
          </div>

          {/* Auto-advance */}
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>Auto-advance to the Academy Package</p>
                <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: 4 }}>
                  Automatically surface a discounted upgrade offer at a key moment.
                </p>
              </div>
              <Toggle
                on={config.auto_advance_offer?.enabled ?? false}
                onChange={v => setConfig(c => ({
                  ...c,
                  auto_advance_offer: {
                    ...(c.auto_advance_offer ?? { trigger: "day_complete", trigger_day: 1, window_hours: 48, discount_type: "percent", discount_value: 20 }),
                    enabled: v,
                  },
                }))}
              />
            </div>

            {config.auto_advance_offer?.enabled && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 16, borderTop: "1px solid var(--app-border)" }}>
                <div style={{ display: "grid", gridTemplateColumns: config.auto_advance_offer?.trigger === "day_complete" ? "1fr 140px" : "1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Trigger</label>
                    <select
                      style={inputStyle}
                      value={config.auto_advance_offer?.trigger ?? "day_complete"}
                      onChange={e => setConfig(c => ({
                        ...c,
                        auto_advance_offer: { ...c.auto_advance_offer!, trigger: e.target.value },
                      }))}
                    >
                      <option value="day_complete">After a specific day completed</option>
                      <option value="first_earnings">First earnings reported</option>
                      <option value="graduate">Challenge graduated</option>
                    </select>
                  </div>
                  {config.auto_advance_offer?.trigger === "day_complete" && (
                    <div>
                      <label style={labelStyle}>Day</label>
                      <input
                        type="number"
                        style={inputStyle}
                        min={1}
                        max={config.duration_days ?? 30}
                        value={config.auto_advance_offer?.trigger_day ?? 1}
                        onChange={e => setConfig(c => ({
                          ...c,
                          auto_advance_offer: { ...c.auto_advance_offer!, trigger_day: parseInt(e.target.value) || 1 },
                        }))}
                      />
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Offer window (hours)</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={config.auto_advance_offer?.window_hours ?? 48}
                      onChange={e => setConfig(c => ({
                        ...c,
                        auto_advance_offer: { ...c.auto_advance_offer!, window_hours: parseInt(e.target.value) || 48 },
                      }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Discount type</label>
                    <select
                      style={inputStyle}
                      value={config.auto_advance_offer?.discount_type ?? "percent"}
                      onChange={e => setConfig(c => ({
                        ...c,
                        auto_advance_offer: { ...c.auto_advance_offer!, discount_type: e.target.value },
                      }))}
                    >
                      <option value="percent">Percent (%)</option>
                      <option value="fixed_ngn">Fixed (₦)</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Discount value</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={config.auto_advance_offer?.discount_value ?? 20}
                      onChange={e => setConfig(c => ({
                        ...c,
                        auto_advance_offer: { ...c.auto_advance_offer!, discount_value: parseInt(e.target.value) || 0 },
                      }))}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button style={btnPrimary} onClick={saveConfig} disabled={saving}>
              <HugeiconsIcon icon={FloppyDiskIcon} size={13} strokeWidth={2} />
              {saving ? "Saving…" : "Save offer settings"}
            </button>
          </div>
        </div>
      )}

      {/* ── REMINDERS tab ──────────────────────────────────────────────────── */}
      {tab === "reminders" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 620 }}>
          {/* Channels */}
          <div style={{ ...cardStyle, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Channels</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Email */}
              <div style={{
                padding: 16,
                borderRadius: 10,
                border: `1.5px solid ${config.reminders?.email ? "rgba(96,165,250,0.4)" : "var(--app-border)"}`,
                background: config.reminders?.email ? "rgba(96,165,250,0.06)" : "var(--app-surface)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <HugeiconsIcon icon={Mail01Icon} size={18} strokeWidth={1.8} color={config.reminders?.email ? "#60A5FA" : "var(--app-text-quiet)"} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: config.reminders?.email ? "#60A5FA" : "var(--app-text-muted)" }}>Email</span>
                </div>
                <Toggle
                  on={config.reminders?.email ?? true}
                  onChange={v => setConfig(c => ({ ...c, reminders: { ...DEFAULT_CONFIG.reminders!, ...c.reminders, email: v } }))}
                />
              </div>
              {/* WhatsApp */}
              <div style={{
                padding: 16,
                borderRadius: 10,
                border: `1.5px solid ${config.reminders?.whatsapp ? "rgba(52,211,153,0.4)" : "var(--app-border)"}`,
                background: config.reminders?.whatsapp ? "rgba(52,211,153,0.06)" : "var(--app-surface)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <HugeiconsIcon icon={SmartPhone01Icon} size={18} strokeWidth={1.8} color={config.reminders?.whatsapp ? "#34D399" : "var(--app-text-quiet)"} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: config.reminders?.whatsapp ? "#34D399" : "var(--app-text-muted)" }}>WhatsApp</span>
                </div>
                <Toggle
                  on={config.reminders?.whatsapp ?? true}
                  onChange={v => setConfig(c => ({ ...c, reminders: { ...DEFAULT_CONFIG.reminders!, ...c.reminders, whatsapp: v } }))}
                />
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div style={{ ...cardStyle, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Schedule</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>Daily unlock time</p>
                  <p style={{ fontSize: 11, color: "var(--app-text-quiet)", marginTop: 2 }}>When new days unlock for challengers</p>
                </div>
                <span style={{
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: "ui-monospace, monospace",
                  color: "var(--app-accent)",
                }}>08:00 WAT</span>
              </div>
              <div>
                <label style={labelStyle}>Timezone</label>
                <select
                  style={inputStyle}
                  value={config.reminders?.timezone ?? "Africa/Lagos"}
                  onChange={e => setConfig(c => ({ ...c, reminders: { ...DEFAULT_CONFIG.reminders!, ...c.reminders, timezone: e.target.value } }))}
                >
                  <option value="Africa/Lagos">Africa/Lagos (WAT, UTC+1)</option>
                  <option value="Africa/Abidjan">Africa/Abidjan (GMT, UTC+0)</option>
                  <option value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>Nudge learners who miss a day</p>
                  <p style={{ fontSize: 11, color: "var(--app-text-quiet)", marginTop: 2 }}>Send a reminder 4 hours before midnight</p>
                </div>
                <Toggle
                  on={config.reminders?.nudge_missed ?? true}
                  onChange={v => setConfig(c => ({ ...c, reminders: { ...DEFAULT_CONFIG.reminders!, ...c.reminders, nudge_missed: v } }))}
                />
              </div>
            </div>
          </div>

          {/* Sequence preview */}
          <div style={{ ...cardStyle, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Reminder sequence</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { time: "08:00", event: "Day unlock",      desc: "New tasks are available — get started!" },
                { time: "14:00", event: "Midday nudge",    desc: "Halfway through the day — have you checked in?" },
                { time: "20:00", event: "Evening reminder", desc: "A few hours left — don't break your streak." },
                { time: "23:00", event: "Midnight warning", desc: "Last chance! Complete today before midnight." },
              ].map((row, i) => (
                <div key={i} style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "12px 0",
                  borderBottom: i < 3 ? "1px solid var(--app-border)" : "none",
                }}>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: "ui-monospace, monospace",
                    color: "var(--app-accent)",
                    flexShrink: 0,
                    width: 46,
                  }}>{row.time}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)" }}>{row.event}</p>
                    <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: 3 }}>{row.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button style={btnPrimary} onClick={saveConfig} disabled={saving}>
              <HugeiconsIcon icon={FloppyDiskIcon} size={13} strokeWidth={2} />
              {saving ? "Saving…" : "Save reminder settings"}
            </button>
          </div>
        </div>
      )}

      {/* ── SETTINGS tab ───────────────────────────────────────────────────── */}
      {tab === "settings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 680 }}>
          {/* Access & pricing */}
          <div style={{ ...cardStyle, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Access &amp; pricing</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { value: "free",       label: "Free",        desc: "Anyone can join" },
                { value: "one_time",   label: "Paid",        desc: "One-time purchase" },
                { value: "cohort_only", label: "Cohort only", desc: "Admin assigns access" },
              ].map(opt => {
                const active = settingsPricingType === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setSettingsPricingType(opt.value)}
                    style={{
                      padding: 14,
                      borderRadius: 10,
                      border: `1.5px solid ${active ? "var(--app-accent-line)" : "var(--app-border)"}`,
                      background: active ? "var(--app-accent-soft)" : "var(--app-surface)",
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: `2px solid ${active ? "var(--app-accent)" : "var(--app-border-strong)"}`,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        {active && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--app-accent)" }} />}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: active ? "var(--app-accent)" : "var(--app-text)" }}>{opt.label}</span>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--app-text-quiet)", paddingLeft: 22 }}>{opt.desc}</p>
                  </button>
                );
              })}
            </div>
            {settingsPricingType !== "free" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Price (₦)</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={settingsPriceNgn}
                    onChange={e => setSettingsPriceNgn(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Compare-at price (₦)</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={settingsCompareAtNgn || ""}
                    onChange={e => setSettingsCompareAtNgn(parseInt(e.target.value) || 0)}
                    placeholder="Optional"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Streaks & flexibility */}
          <div style={{ ...cardStyle, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Streaks &amp; flexibility</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>Allow catch-up mode</p>
                  <p style={{ fontSize: 11, color: "var(--app-text-quiet)", marginTop: 2 }}>
                    Challengers can complete past days without losing streak permanently.
                  </p>
                </div>
                <Toggle
                  on={config.catchup_enabled ?? true}
                  onChange={v => setConfig(c => ({ ...c, catchup_enabled: v }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Grace days (0–5)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    value={config.grace_days ?? 1}
                    onChange={e => setConfig(c => ({ ...c, grace_days: parseInt(e.target.value) }))}
                    style={{ flex: 1 }}
                  />
                  <span style={{
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: "ui-monospace, monospace",
                    color: "var(--app-accent)",
                    width: 24,
                    textAlign: "center",
                    flexShrink: 0,
                  }}>{config.grace_days ?? 1}</span>
                </div>
                <p style={{ fontSize: 11, color: "var(--app-text-quiet)", marginTop: 6 }}>
                  Days a challenger can miss before their streak resets.
                </p>
              </div>
            </div>
          </div>

          {/* Cohorts & completion */}
          <div style={{ ...cardStyle, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Cohorts &amp; completion</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Start mode</label>
                <select
                  style={inputStyle}
                  value={config.start_mode ?? "enrollment"}
                  onChange={e => setConfig(c => ({ ...c, start_mode: e.target.value as ChallengeConfig["start_mode"] }))}
                >
                  <option value="enrollment">Rolling (starts on enrollment)</option>
                  <option value="cohort">Fixed cohort start date</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Completion threshold</label>
                <select
                  style={inputStyle}
                  value={settingsCompletionPct}
                  onChange={e => setSettingsCompletionPct(parseInt(e.target.value))}
                >
                  <option value="100">100% — all {config.duration_days ?? 30} days</option>
                  <option value="90">90% — {Math.ceil((config.duration_days ?? 30) * 0.9)}+ days</option>
                  <option value="80">80% — {Math.ceil((config.duration_days ?? 30) * 0.8)}+ days</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>Issue completion certificate</p>
                  <p style={{ fontSize: 11, color: "var(--app-text-quiet)", marginTop: 2 }}>PDF certificate when challenge is completed</p>
                </div>
                <Toggle on={settingsCertificate} onChange={setSettingsCertificate} />
              </div>
            </div>
          </div>

          {/* Refund window */}
          <div style={{
            ...cardStyle,
            padding: 20,
            border: "1px solid rgba(248,113,113,0.2)",
            background: "rgba(248,113,113,0.04)",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flexShrink: 0, marginTop: 1 }}>
                <HugeiconsIcon icon={AlertCircleIcon} size={18} strokeWidth={1.8} color="var(--app-danger)" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--app-danger)" }}>Refund window</p>
                <p style={{ fontSize: 12, color: "var(--app-text-muted)", marginTop: 6, lineHeight: 1.6 }}>
                  Refunds for academy purchases are handled platform-wide from billing settings, not per-challenge.
                  Refunding a purchase there revokes the learner&apos;s enrollment and removes them from the leaderboard.
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button style={btnPrimary} onClick={saveSettings} disabled={savingSettings}>
              <HugeiconsIcon icon={FloppyDiskIcon} size={13} strokeWidth={2} />
              {savingSettings ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
