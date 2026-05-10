"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { wsGet, wsPost } from "@/lib/workspace/client";
import type { AcademyModule, AcademyEnrollment, AcademyCohort } from "@/types/academy";

interface ModuleWithState extends AcademyModule {
  unlocked: boolean;
  completed: boolean;
}

interface ModulesResponse {
  modules: ModuleWithState[];
  enrollment: (AcademyEnrollment & { cohort: AcademyCohort | null }) | null;
}

function LockIcon() {
  return (
    <svg className="w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  );
}

function unlockLabel(module: ModuleWithState, cohortStart: string | null): string {
  if (!cohortStart || module.unlock_offset_hours === 0) return "";
  const unlockAt = new Date(new Date(cohortStart).getTime() + module.unlock_offset_hours * 3_600_000);
  return `Unlocks ${unlockAt.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

export default function ProductPage() {
  const { product } = useParams<{ product: string }>();
  const router = useRouter();
  const [data, setData]       = useState<ModulesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);

  useEffect(() => {
    wsGet<ModulesResponse>(`/api/academy/modules?product_id=${product}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [product]);

  async function markComplete(moduleId: string) {
    setMarking(moduleId);
    try {
      await wsPost("/api/academy/progress", { module_id: moduleId, product_id: product });
      setData(prev => prev ? {
        ...prev,
        modules: prev.modules.map(m => m.id === moduleId ? { ...m, completed: true } : m),
      } : prev);
    } catch { /* ignore */ } finally {
      setMarking(null);
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-3">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-20 bg-white/4 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  if (!data?.enrollment) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center py-20">
        <p className="text-white/40 mb-4">You are not enrolled in this course.</p>
        <Link href={`/academy/enroll/${product}`} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl transition-colors text-sm">
          Enroll Now
        </Link>
      </div>
    );
  }

  const { modules, enrollment } = data;
  const cohortStart = enrollment.cohort?.starts_at ?? null;
  const completedCount = modules.filter(m => m.completed).length;
  const pct = modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      {/* Back + header */}
      <div className="mb-6">
        <button onClick={() => router.push("/academy")} className="flex items-center gap-1.5 text-white/30 hover:text-white/60 text-sm transition-colors mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Academy
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{product === "challenge" ? "5-Day Foreign Job Challenge" : "Leadash $10k Academy"}</h1>
            <p className="text-white/40 text-sm mt-1">
              {completedCount} of {modules.length} days complete · {pct}%
            </p>
          </div>
          {enrollment.status === "completed" && (
            <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex-shrink-0">
              Completed
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-4">
          <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Module list */}
      <div className="space-y-3">
        {modules.map((m, i) => {
          const isNext = !m.completed && m.unlocked && modules.slice(0, i).every(prev => prev.completed);
          return (
            <div
              key={m.id}
              className={`rounded-2xl border p-5 transition-all ${
                m.completed
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : m.unlocked
                    ? "border-white/10 bg-white/4 hover:border-orange-500/30"
                    : "border-white/5 bg-white/2 opacity-60"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Day badge */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                  m.completed ? "bg-emerald-500/20 text-emerald-400" :
                  m.unlocked  ? "bg-orange-500/20 text-orange-400"  :
                  "bg-white/6 text-white/20"
                }`}>
                  {m.completed ? <CheckIcon /> : m.unlocked ? String(m.day_number) : <LockIcon />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">Day {m.day_number}</p>
                    {isNext && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400">Up next</span>
                    )}
                  </div>
                  <h3 className={`font-semibold text-base leading-snug ${m.unlocked ? "text-white" : "text-white/30"}`}>
                    {m.title}
                  </h3>
                  {m.description && m.unlocked && (
                    <p className="text-white/40 text-sm mt-1 leading-relaxed">{m.description}</p>
                  )}
                  {m.daily_action && m.unlocked && (
                    <div className="mt-2 flex items-start gap-2 p-2.5 bg-orange-500/8 border border-orange-500/20 rounded-xl">
                      <svg className="w-3.5 h-3.5 text-orange-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <p className="text-orange-300/80 text-xs font-medium">Today&apos;s action: {m.daily_action}</p>
                    </div>
                  )}
                  {!m.unlocked && cohortStart && (
                    <p className="text-white/25 text-xs mt-1">{unlockLabel(m, cohortStart)}</p>
                  )}
                </div>

                {/* Right actions */}
                <div className="flex-shrink-0">
                  {m.completed ? (
                    <span className="text-xs text-emerald-400/60 font-medium">Done</span>
                  ) : m.unlocked ? (
                    <button
                      onClick={() => markComplete(m.id)}
                      disabled={marking === m.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/8 hover:bg-orange-500/20 hover:text-orange-300 text-white/60 text-xs font-semibold rounded-xl transition-colors disabled:opacity-40"
                    >
                      {marking === m.id ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                      ) : (
                        <PlayIcon />
                      )}
                      {marking === m.id ? "Saving…" : m.mux_playback_id ? "Watch" : "Mark done"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Completed state */}
      {enrollment.status === "completed" && (
        <div className="mt-6 p-6 bg-emerald-500/8 border border-emerald-500/20 rounded-2xl text-center">
          <p className="text-emerald-300 font-bold text-lg">Challenge Complete!</p>
          <p className="text-emerald-400/60 text-sm mt-1">
            You&apos;ve finished all 5 days. Check out the $10k Academy to go deeper.
          </p>
          {product === "challenge" && (
            <Link href="/academy/enroll/academy" className="mt-4 inline-block px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl transition-colors text-sm">
              Join the Academy
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
