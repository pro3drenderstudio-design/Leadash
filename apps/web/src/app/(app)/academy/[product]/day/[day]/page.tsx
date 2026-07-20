"use client";
import "@/v2-app/v2-app.css";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { wsGet, wsPost } from "@/lib/workspace/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChallengeConfig {
  duration_days?: number;
  week_titles?: string[];
}

interface ChallengeTask {
  id: string;
  day: number;
  task_type: string;
  title: string;
  points: number;
  is_published: boolean;
  unlocked: boolean;
  completed: boolean;
  lesson_id?: string | null;
  // Optional extended fields from API
  description?: string | null;
  live_session?: {
    scheduled_at: string;
    platform: string;
    join_url: string;
  } | null;
  metric_target?: number | null;
  metric_current?: number | null;
  metric_source?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  video_playback_id?: string | null;
  quiz_question_count?: number | null;
}

interface ChallengeState {
  product: { id: string; name: string; challenge_config: ChallengeConfig | null; slug: string };
  enrollment: { id: string; enrolled_at: string };
  cohort: { name: string; starts_at: string } | null;
  gamification: {
    points: number;
    streak_days: number;
    last_active_date: string | null;
    reported_earnings_cents: number;
    grace_days_used: number;
  } | null;
  tasks: ChallengeTask[];
  days_completed: number[];
  offer_unlocked: boolean;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const TASK_COLORS: Record<string, string> = {
  lesson:     "#60A5FA",
  proof:      "#F97316",
  self_check: "#34D399",
  metric:     "#A78BFA",
  live:       "#F472B6",
  quiz:       "#FBBF24",
};

function taskColor(type: string) { return TASK_COLORS[type] ?? "#9A9AA8"; }

const TASK_ICONS: Record<string, string> = {
  lesson:     "▶",
  proof:      "📸",
  self_check: "✅",
  metric:     "📊",
  live:       "📡",
  quiz:       "❓",
};

function weekTitle(weekNum: number, cfg: ChallengeConfig | null): string {
  const titles = cfg?.week_titles;
  if (titles && titles[weekNum - 1]) return titles[weekNum - 1];
  const defaults = ["Foundation", "Outreach blitz", "Close & deliver", "Scale & retain"];
  return defaults[weekNum - 1] ?? `Week ${weekNum}`;
}

function introText(types: string[]): string {
  if (types.includes("lesson") && types.includes("proof")) {
    return "Today is about building a skill and immediately putting it into practice. Watch the lesson, complete the task, and submit your proof. Accountability is what separates earners from watchers.";
  }
  if (types.includes("metric")) {
    return "Today is a pure execution day. Your Leadash outbox tracks progress automatically — just go do the work and the numbers will update.";
  }
  if (types.includes("live")) {
    return "Today includes a live session. Show up, ask questions, and get your blockers cleared. These calls are where the real breakthroughs happen.";
  }
  if (types.includes("lesson")) {
    return "Today is about absorbing a key concept. Watch the lesson fully before moving to the task — the nuances matter.";
  }
  return "Today's tasks are designed to move you one step closer to your $2,500 goal. Complete each one in order.";
}

// ─── Inline toast ─────────────────────────────────────────────────────────────

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div style={{
      position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)",
      background: "#34D399", color: "#07070A", fontWeight: 700, fontSize: 14,
      padding: "12px 24px", borderRadius: 999, zIndex: 300,
      boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      animation: "fadeUp 0.3s ease",
    }}>
      {message}
      <style>{`@keyframes fadeUp { from { opacity:0; transform:translate(-50%,10px); } to { opacity:1; transform:translate(-50%,0); } }`}</style>
    </div>
  );
}

// ─── Proof upload card ────────────────────────────────────────────────────────

function ProofCard({ task, done, onComplete }: { task: ChallengeTask; done: boolean; onComplete: () => void }) {
  const color = taskColor("proof");
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(done);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (submitted) return;
    setSubmitting(true);
    try {
      await wsPost("/api/academy/task-completion", { task_id: task.id, proof_link: link || null, proof_note: note || null });
      setSubmitted(true);
      onComplete();
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ background: "rgba(249,115,22,0.08)", border: `1px solid ${color}40`, borderRadius: "var(--app-radius)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 18 }}>✅</span>
        <span style={{ fontSize: 13, color: "#34D399", fontWeight: 600 }}>Proof submitted</span>
      </div>
    );
  }

  return (
    <div>
      {/* Drag zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? color : "rgba(255,255,255,0.12)"}`,
          borderRadius: "var(--app-radius)",
          padding: "28px 20px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? `${color}0A` : "transparent",
          marginBottom: 10,
          transition: "all 0.2s",
        }}>
        <p style={{ fontSize: 13, color: file ? color : "var(--app-text-muted)", marginBottom: 4 }}>
          {file ? `📎 ${file.name}` : "Drop a screenshot or file here"}
        </p>
        <p style={{ fontSize: 11, color: "var(--app-text-quiet)" }}>or click to browse · PNG, JPG, PDF, MP4</p>
        <input ref={fileRef} type="file" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
      </div>
      <input
        type="text"
        value={link}
        onChange={e => setLink(e.target.value)}
        placeholder="Or paste a link (Loom, screenshot URL, etc.)"
        style={{ width: "100%", background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius)", padding: "10px 12px", color: "var(--app-text)", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
      />
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Add a note about what you did (optional but encouraged)"
        rows={2}
        style={{ width: "100%", background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius)", padding: "10px 12px", color: "var(--app-text)", fontSize: 13, marginBottom: 10, resize: "vertical", boxSizing: "border-box" }}
      />
      <button onClick={submit} disabled={submitting || (!file && !link)}
        style={{
          background: color, color: "#07070A", fontWeight: 700, fontSize: 13, padding: "10px 20px",
          borderRadius: "var(--app-radius)", border: "none", cursor: (submitting || (!file && !link)) ? "default" : "pointer",
          opacity: (submitting || (!file && !link)) ? 0.55 : 1,
        }}>
        {submitting ? "Submitting…" : "Submit proof"}
      </button>
    </div>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({ task, done }: { task: ChallengeTask; done: boolean }) {
  const color = taskColor("metric");
  const current = task.metric_current ?? 0;
  const target = task.metric_target ?? 20;
  const pct = Math.min(current / target, 1);
  const remaining = Math.max(0, target - current);
  // has_inbox / has_plan complete automatically the moment the action is done
  // in Leadash — show a direct link to do it rather than a progress-farming bar.
  const isAuto = task.metric_source === "has_inbox" || task.metric_source === "has_plan";
  const trackLabel = isAuto ? "Detected automatically by Leadash" : "Auto-tracked from Leadash outbox";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: "var(--app-text-muted)" }}>{trackLabel}</span>
        <span style={{ fontSize: 20, fontWeight: 800, color: done ? "#34D399" : color }}>{current}<span style={{ fontSize: 13, fontWeight: 400, color: "var(--app-text-muted)" }}>/{target}</span></span>
      </div>
      <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ height: "100%", width: `${pct * 100}%`, background: done ? "#34D399" : color, borderRadius: 999, transition: "width 0.5s ease" }} />
      </div>
      <p style={{ fontSize: 12, color: done ? "#34D399" : "var(--app-text-muted)", marginBottom: isAuto && !done ? 12 : 0 }}>
        {done ? "✅ Done — nice work!" : isAuto ? "Do this in Leadash and it checks off on its own." : `${remaining} more to complete`}
      </p>
      {isAuto && !done && task.cta_url && (
        <Link href={task.cta_url}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: color, color: "#07070A", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: "var(--app-radius)", textDecoration: "none" }}>
          {task.cta_label ?? "Do it now"} →
        </Link>
      )}
    </div>
  );
}

// ─── Self-check card ──────────────────────────────────────────────────────────

function SelfCheckCard({ task, done, onComplete }: { task: ChallengeTask; done: boolean; onComplete: () => void }) {
  const color = taskColor("self_check");
  const [checked, setChecked] = useState(done);
  const [submitting, setSubmitting] = useState(false);

  async function toggle() {
    if (checked || submitting) return;
    setSubmitting(true);
    try {
      await wsPost("/api/academy/task-completion", { task_id: task.id });
      setChecked(true);
      onComplete();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: checked ? "default" : "pointer", userSelect: "none" }}>
      <div onClick={toggle}
        style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          background: checked ? color : "transparent",
          border: `2px solid ${checked ? color : "rgba(255,255,255,0.2)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s",
          cursor: checked ? "default" : "pointer",
        }}>
        {checked && <span style={{ color: "#07070A", fontSize: 13, fontWeight: 700 }}>✓</span>}
      </div>
      <span style={{ fontSize: 13, color: checked ? color : "var(--app-text-muted)", fontWeight: checked ? 600 : 400 }}>
        {checked ? "Completed ✓" : "I completed this task today"}
      </span>
    </label>
  );
}

// ─── Live session card ────────────────────────────────────────────────────────

function LiveCard({ task }: { task: ChallengeTask }) {
  const color = taskColor("live");
  const session = task.live_session;
  if (!session) {
    return <p style={{ fontSize: 13, color: "var(--app-text-muted)" }}>Live session details coming soon. Check back closer to the call time.</p>;
  }
  const dt = new Date(session.scheduled_at);
  return (
    <div style={{ background: `${color}10`, border: `1px solid ${color}30`, borderRadius: "var(--app-radius)", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)", marginBottom: 2 }}>
          {dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at {dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </p>
        <p style={{ fontSize: 12, color: "var(--app-text-muted)" }}>via {session.platform}</p>
      </div>
      <a href={session.join_url} target="_blank" rel="noreferrer noopener"
        style={{ background: color, color: "#07070A", fontWeight: 700, fontSize: 12, padding: "9px 16px", borderRadius: "var(--app-radius)", textDecoration: "none", flexShrink: 0 }}>
        Join call →
      </a>
    </div>
  );
}

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({ task, done, onComplete, productSlug }: { task: ChallengeTask; done: boolean; onComplete: () => void; productSlug: string }) {
  const color = taskColor(task.task_type);
  const icon = TASK_ICONS[task.task_type] ?? "●";

  return (
    <div style={{ background: "var(--app-surface)", border: `1px solid ${done ? color + "40" : "var(--app-border)"}`, borderRadius: "var(--app-radius-lg)", padding: "20px 18px", marginBottom: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
            {task.task_type.replace(/_/g, " ")}
          </p>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text)", lineHeight: 1.3 }}>{task.title}</p>
        </div>
        {done && (
          <span style={{ background: "#34D39922", border: "1px solid #34D39940", color: "#34D399", fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, textTransform: "uppercase", flexShrink: 0 }}>Done</span>
        )}
      </div>

      {/* Type-specific body */}
      {task.task_type === "lesson" && (
        task.lesson_id ? (
          <Link href={`/academy/${productSlug}/learn/${task.lesson_id}`}
            style={{ background: "#07070A", borderRadius: "var(--app-radius)", aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, position: "relative", overflow: "hidden", textDecoration: "none" }}>
            <div style={{ width: 52, height: 52, borderRadius: 999, background: color + "22", border: `2px solid ${color}60`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>▶</div>
            <p style={{ position: "absolute", bottom: 8, right: 10, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Watch lesson →</p>
          </Link>
        ) : (
          <div style={{ background: "#07070A", borderRadius: "var(--app-radius)", aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, position: "relative", overflow: "hidden" }}>
            <div style={{ width: 52, height: 52, borderRadius: 999, background: color + "22", border: `2px solid ${color}60`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>▶</div>
          </div>
        )
      )}

      {task.task_type === "proof" && (
        <ProofCard task={task} done={done} onComplete={onComplete} />
      )}

      {task.task_type === "metric" && (
        <MetricCard task={task} done={done} />
      )}

      {task.task_type === "self_check" && (
        <SelfCheckCard task={task} done={done} onComplete={onComplete} />
      )}

      {task.task_type === "live" && (
        <LiveCard task={task} />
      )}

      {task.task_type === "quiz" && (
        <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.18)", borderRadius: "var(--app-radius)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>❓</span>
          <span style={{ fontSize: 13, color: "var(--app-text-muted)" }}>
            Quiz · {task.quiz_question_count ?? "?"} questions — available after the lesson
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChallengeDayPage() {
  const { product: slug, day: dayParam } = useParams<{ product: string; day: string }>();
  const dayNum = parseInt(dayParam, 10);

  const [state, setState] = useState<ChallengeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskDone, setTaskDone] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    wsGet<ChallengeState>(`/api/academy/challenge?product_slug=${slug}`)
      .then(d => {
        setState(d);
        // Pre-populate done state from API
        const done: Record<string, boolean> = {};
        for (const t of d.tasks) { done[t.id] = t.completed; }
        setTaskDone(done);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--app-text-muted)", fontSize: 13 }}>Loading…</div>
    </div>
  );
  if (!state) return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--app-text-muted)" }}>Challenge not found.</div>
    </div>
  );

  const cfg = state.product.challenge_config;
  const dayTasks = state.tasks.filter(t => t.day === dayNum && t.is_published);
  const weekNum = Math.ceil(dayNum / 7);
  const totalPoints = dayTasks.reduce((a, t) => a + t.points, 0);
  const types = [...new Set(dayTasks.map(t => t.task_type))];
  const dayIsDone = state.days_completed.includes(dayNum);
  const allIndividuallyDone = dayTasks.every(t => taskDone[t.id]);

  // Guard against deep-linking to a day that hasn't unlocked yet per its drip
  // schedule — without this, a learner could complete future days early.
  const dayIsLocked = !dayIsDone && dayTasks.length > 0 && !dayTasks.every(t => t.unlocked);
  if (dayIsLocked) return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", padding: "22px 22px 90px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--app-text)", marginBottom: 8 }}>Day {dayNum} hasn&apos;t unlocked yet</h1>
        <p style={{ fontSize: 13, color: "var(--app-text-muted)", marginBottom: 24 }}>
          Come back once your previous days are complete — one day at a time keeps the streak meaningful.
        </p>
        <Link href={`/academy/${slug}/learn`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--app-accent)", textDecoration: "none" }}>
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );

  function markTaskDone(taskId: string) {
    setTaskDone(prev => ({ ...prev, [taskId]: true }));
  }

  async function markDayComplete() {
    if (submitting || dayIsDone) return;
    setSubmitting(true);
    const undone = dayTasks.filter(t => !taskDone[t.id]);
    try {
      // Use the API's own response for streak/points/gamification — never the
      // possibly-stale (or, for a learner's very first completion, still-null)
      // local `state.gamification`.
      let lastResult: { gamification: ChallengeState["gamification"]; streak_days: number; points_awarded: number } | null = null;
      for (const t of undone) {
        lastResult = await wsPost("/api/academy/task-completion", { task_id: t.id });
      }
      const newStreak = lastResult?.streak_days ?? (state?.gamification?.streak_days ?? 0) + 1;
      setToast(`+${totalPoints} points · 🔥 ${newStreak}-day streak!`);
      setState(prev => prev ? {
        ...prev,
        days_completed: [...prev.days_completed, dayNum],
        gamification: lastResult?.gamification ?? prev.gamification,
      } : prev);
      setTaskDone(prev => {
        const next = { ...prev };
        for (const t of dayTasks) next[t.id] = true;
        return next;
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", padding: "22px 22px 90px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Back link */}
        <Link href={`/academy/${slug}/learn`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--app-text-muted)", textDecoration: "none", marginBottom: 24, transition: "color 0.15s" }}>
          ← Back to dashboard
        </Link>

        {/* Day header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ background: "var(--app-accent)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>Day {dayNum}</span>
              <span style={{ fontSize: 13, color: "var(--app-text-muted)" }}>Week {weekNum} · {weekTitle(weekNum, cfg)}</span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--app-text)", lineHeight: 1.25, marginBottom: 0 }}>
              {dayTasks[0]?.title ?? `Day ${dayNum}`}
            </h1>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <p style={{ fontSize: 11, color: "var(--app-text-muted)", marginBottom: 2 }}>Reward</p>
            <p style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "var(--app-accent)" }}>+{totalPoints} pts</p>
          </div>
        </div>

        {/* Intro paragraph */}
        <p style={{ fontSize: 14, color: "var(--app-text-muted)", lineHeight: 1.65, marginBottom: 24, maxWidth: 640 }}>
          {introText(types)}
        </p>

        {/* Task cards */}
        {dayTasks.length === 0 ? (
          <div style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius-lg)", padding: "32px 20px", textAlign: "center" }}>
            <p style={{ color: "var(--app-text-muted)", fontSize: 14 }}>No tasks yet for this day — check back soon.</p>
          </div>
        ) : (
          dayTasks.map(task => (
            <TaskCard key={task.id} task={task} done={taskDone[task.id] ?? false} onComplete={() => markTaskDone(task.id)} productSlug={slug} />
          ))
        )}

        {/* Footer CTA */}
        {dayTasks.length > 0 && (
          <div style={{ background: "var(--app-surface)", border: `1px solid ${dayIsDone ? "rgba(52,211,153,0.25)" : "var(--app-border-strong)"}`, borderRadius: "var(--app-radius-lg)", padding: "20px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: dayIsDone ? "#34D399" : "var(--app-text)", marginBottom: 3 }}>
                {dayIsDone ? "Day complete ✅" : `Complete Day ${dayNum}`}
              </p>
              <p style={{ fontSize: 12, color: "var(--app-text-muted)" }}>
                {dayIsDone ? "Great work! Keep the streak alive tomorrow." : `Locks in +${totalPoints} points and extends your streak`}
              </p>
            </div>
            {!dayIsDone && (
              <button onClick={markDayComplete} disabled={submitting}
                style={{
                  background: allIndividuallyDone ? "var(--app-accent)" : "rgba(249,115,22,0.35)",
                  color: "#fff", fontWeight: 700, fontSize: 14, padding: "11px 22px",
                  borderRadius: "var(--app-radius)", border: "none",
                  cursor: submitting ? "default" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                  transition: "background 0.2s",
                }}>
                {submitting ? "Saving…" : "Mark day complete"}
              </button>
            )}
          </div>
        )}
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
