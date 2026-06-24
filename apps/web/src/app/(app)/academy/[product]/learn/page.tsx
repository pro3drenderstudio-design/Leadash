"use client";
import "@/v2-app/v2-app.css";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { wsGet } from "@/lib/workspace/client";
import type { SectionWithLessons, AcademyEnrollment, AcademyCohort } from "@/types/academy";
import { lessonDuration } from "@/types/academy";

export default function CourseDashboard() {
  const { product: slug } = useParams<{ product: string }>();
  const router = useRouter();

  const [sections,   setSections]   = useState<SectionWithLessons[]>([]);
  const [enrollment, setEnrollment] = useState<AcademyEnrollment | null>(null);
  const [cohort,     setCohort]     = useState<AcademyCohort | null>(null);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    wsGet<{ sections: SectionWithLessons[]; enrollment: AcademyEnrollment | null; cohort: AcademyCohort | null }>(
      `/api/academy/lessons?product_id=${slug}`
    ).then(d => {
      setSections(d.sections ?? []);
      setEnrollment(d.enrollment ?? null);
      setCohort(d.cohort ?? null);
      if (!d.enrollment) router.replace(`/academy/${slug}`);
    }).finally(() => setLoading(false));
  }, [slug, router]);

  const allLessons   = sections.flatMap(s => s.lessons);
  const completed    = allLessons.filter(l => l.completed).length;
  const total        = allLessons.length;
  const pct          = total ? Math.round((completed / total) * 100) : 0;

  // Find the first unlocked+incomplete lesson to resume
  const resumeLesson = allLessons.find(l => l.unlocked && !l.completed) ?? allLessons.find(l => l.unlocked);

  if (loading) return <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="text-white/40 text-sm">Loading…</div></div>;
  if (!enrollment) return null;

  return (
    <div className="v2-app max-w-3xl mx-auto px-6 py-10" style={{ minHeight: "100vh", background: "var(--app-bg)" }}>
      {/* Header */}
      <div className="mb-8">
        <Link href="/academy" className="text-sm text-white/40 hover:text-white/70 mb-4 inline-flex items-center gap-1">
          ← Academy
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {enrollment.status === "completed"
                ? <span className="badge-emerald">Completed</span>
                : <span className="badge-orange">In Progress</span>
              }
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Your Course</h1>
            {cohort && <p className="text-white/40 text-sm">Cohort: {cohort.name}</p>}
          </div>
          {resumeLesson && (
            <Link href={`/academy/${slug}/learn/${resumeLesson.id}`}
              className="flex-shrink-0 bg-orange-500 hover:bg-orange-400 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
              {completed > 0 ? "Continue" : "Start"}
            </Link>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-5 bg-white/4 border border-white/8 rounded-xl p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-white/70">{completed} of {total} lessons complete</span>
            <span className="text-white font-semibold">{pct}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Sections + Lessons */}
      <div className="space-y-6">
        {sections.map(section => (
          <div key={section.id}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3 px-1">{section.title}</h3>
            <div className="space-y-1">
              {section.lessons.map((lesson, i) => {
                const icon = lesson.completed ? "✓" :
                             !lesson.unlocked ? "🔒" :
                             lesson.lesson_type === "video" ? "▶" :
                             lesson.lesson_type === "live"  ? "📡" :
                             lesson.lesson_type === "text"  ? "📝" : "📋";
                return (
                  <div key={lesson.id}>
                    {lesson.unlocked ? (
                      <Link href={`/academy/${slug}/learn/${lesson.id}`}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${
                          lesson.completed
                            ? "bg-emerald-500/8 border border-emerald-500/15 hover:border-emerald-500/30"
                            : "bg-white/4 border border-white/8 hover:border-orange-500/30"
                        }`}>
                        <span className={`text-base flex-shrink-0 ${lesson.completed ? "text-emerald-400" : "text-white/60"}`}>{icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${lesson.completed ? "text-emerald-300" : "text-white group-hover:text-orange-100"}`}>
                            {lesson.title}
                          </p>
                          {lesson.progress && !lesson.completed && (
                            <div className="h-0.5 bg-white/10 rounded-full mt-1 overflow-hidden w-24">
                              <div className="h-full bg-orange-500 rounded-full" style={{ width: `${lesson.progress.watch_percent}%` }} />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {lesson.is_free_preview && <span className="text-[10px] text-white/30">preview</span>}
                          {lesson.duration_secs && <span className="text-xs text-white/30">{lessonDuration(lesson.duration_secs)}</span>}
                          <svg className="w-4 h-4 text-white/20 group-hover:text-orange-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/2 border border-white/5 opacity-50 cursor-not-allowed">
                        <span className="text-base text-white/30">{icon}</span>
                        <div className="flex-1">
                          <p className="text-sm text-white/40">{lesson.title}</p>
                          {lesson.drip_type === "days_after_cohort_start" && cohort && (
                            <p className="text-xs text-white/25 mt-0.5">
                              Unlocks {new Date(new Date(cohort.starts_at).getTime() + (lesson.drip_value ?? 0) * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Certificate CTA */}
      {enrollment.status === "completed" && (
        <Link href={`/academy/${slug}/certificate`}
          className="mt-8 flex items-center justify-between bg-gradient-to-r from-emerald-900/40 to-emerald-800/20 border border-emerald-500/25 rounded-2xl p-5">
          <div>
            <p className="text-emerald-400 font-semibold">🏆 You've completed this course!</p>
            <p className="text-emerald-300/60 text-sm mt-0.5">View and download your certificate</p>
          </div>
          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .badge-emerald { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; padding:2px 8px; border-radius:9999px; background:rgba(52,211,153,0.1); color:#34d399; border:1px solid rgba(52,211,153,0.2); }
        .badge-orange  { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; padding:2px 8px; border-radius:9999px; background:rgba(249,115,22,0.1); color:#fb923c; border:1px solid rgba(249,115,22,0.2); }
      ` }} />
    </div>
  );
}
