"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { wsGet, wsPost } from "@/lib/workspace/client";
import type { SectionWithLessons, LessonWithState, AcademyComment, AcademyNote, AcademyEnrollment } from "@/types/academy";
import { lessonDuration } from "@/types/academy";
import MuxPlayer from "@mux/mux-player-react";

// ─── Comments ────────────────────────────────────────────────────────────────

function Comments({ lessonId, productId }: { lessonId: string; productId: string }) {
  const [comments, setComments] = useState<AcademyComment[]>([]);
  const [body, setBody]         = useState("");
  const [replyTo, setReplyTo]   = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    wsGet<{ comments: AcademyComment[] }>(`/api/academy/comments?lesson_id=${lessonId}`)
      .then(d => setComments(d.comments ?? []));
  }, [lessonId]);

  async function submit(parentId: string | null = null) {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const res = await wsPost<{ comment: AcademyComment }>("/api/academy/comments", {
        lesson_id: lessonId, product_id: productId, body, parent_id: parentId,
      });
      if (res.comment) {
        setComments(cs => parentId
          ? cs.map(c => c.id === parentId ? { ...c, replies: [...(c.replies ?? []), res.comment] } : c)
          : [...cs, { ...res.comment, replies: [] }]
        );
        setBody("");
        setReplyTo(null);
      }
    } finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-white/70">Discussion ({comments.length})</h4>

      {/* New comment */}
      <div className="flex gap-2">
        <textarea
          value={body} onChange={e => setBody(e.target.value)} rows={2}
          placeholder="Ask a question or share a win…"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 resize-none focus:outline-none focus:border-orange-500/40" />
        <button onClick={() => submit(replyTo)} disabled={submitting || !body.trim()}
          className="self-end bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          Post
        </button>
      </div>

      {/* Comment list */}
      {comments.map(c => (
        <div key={c.id} className={`${c.is_pinned ? "border-l-2 border-orange-500/40 pl-3" : ""}`}>
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60 flex-shrink-0">
              {c.user_name?.[0] ?? "?"}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-white/70">{c.user_name}</span>
                {c.is_pinned && <span className="text-[10px] text-orange-400">📌 Pinned</span>}
                <span className="text-[10px] text-white/25">{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-white/80 whitespace-pre-wrap">{c.body}</p>
              <button onClick={() => setReplyTo(c.id)} className="text-xs text-white/30 hover:text-white/60 mt-1 transition-colors">
                Reply
              </button>
              {replyTo === c.id && (
                <div className="flex gap-2 mt-2">
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={1}
                    placeholder="Your reply…"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/25 resize-none focus:outline-none focus:border-orange-500/40" />
                  <button onClick={() => submit(c.id)} disabled={submitting || !body.trim()}
                    className="self-end bg-white/10 hover:bg-white/15 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">
                    Post
                  </button>
                  <button onClick={() => { setReplyTo(null); setBody(""); }} className="self-end text-white/30 text-sm">✕</button>
                </div>
              )}
              {/* Replies */}
              {(c.replies ?? []).map(r => (
                <div key={r.id} className="flex items-start gap-2 mt-2 ml-4">
                  <div className="w-6 h-6 rounded-full bg-white/8 flex items-center justify-center text-[10px] text-white/50 flex-shrink-0">
                    {r.user_name?.[0] ?? "?"}
                  </div>
                  <div>
                    <span className="text-xs font-medium text-white/60 mr-2">{r.user_name}</span>
                    <span className="text-sm text-white/70">{r.body}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Notes ───────────────────────────────────────────────────────────────────

function Notes({ lessonId, productId }: { lessonId: string; productId: string }) {
  const [body, setBody]   = useState("");
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    wsGet<{ note: AcademyNote | null }>(`/api/academy/notes?lesson_id=${lessonId}`)
      .then(d => { if (d.note) setBody(d.note.body); });
  }, [lessonId]);

  const save = useCallback(async (text: string) => {
    await wsPost("/api/academy/notes", { lesson_id: lessonId, product_id: productId, body: text });
    setSaved(true);
  }, [lessonId, productId]);

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value);
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(e.target.value), 800);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-white/70">My Notes</h4>
        <span className={`text-xs transition-opacity ${saved ? "opacity-0" : "text-white/30"}`}>Saving…</span>
      </div>
      <textarea
        value={body} onChange={onChange} rows={10}
        placeholder="Take notes while you watch…"
        className="w-full bg-white/4 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 resize-none focus:outline-none focus:border-orange-500/30 leading-relaxed" />
    </div>
  );
}

// ─── Main lesson viewer ───────────────────────────────────────────────────────

export default function LessonViewer() {
  const { product: slug, lessonId } = useParams<{ product: string; lessonId: string }>();
  const router = useRouter();

  const [sections,    setSections]    = useState<SectionWithLessons[]>([]);
  const [lesson,      setLesson]      = useState<LessonWithState | null>(null);
  const [enrollment,  setEnrollment]  = useState<AcademyEnrollment | null>(null);
  const [token,       setToken]       = useState<string | null>(null);
  const [playbackId,  setPlaybackId]  = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [completing,  setCompleting]  = useState(false);
  const [navOpen,     setNavOpen]     = useState(false);
  const [rightTab,    setRightTab]    = useState<"notes" | "discussion">("notes");

  useEffect(() => {
    wsGet<{ sections: SectionWithLessons[]; enrollment: AcademyEnrollment | null }>(
      `/api/academy/lessons?product_id=${slug}`
    ).then(d => {
      setSections(d.sections ?? []);
      setEnrollment(d.enrollment);
      const found = d.sections?.flatMap(s => s.lessons).find(l => l.id === lessonId) ?? null;
      setLesson(found);
      if (found && !found.unlocked && !found.is_free_preview) {
        router.replace(`/academy/${slug}/learn`);
      }
    });

    // Get Mux signed token
    wsGet<{ token: string; playback_id: string }>(`/api/academy/lessons/${lessonId}/token`)
      .then(d => { setToken(d.token); setPlaybackId(d.playback_id); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug, lessonId, router]);

  const allLessons   = sections.flatMap(s => s.lessons);
  const currentIndex = allLessons.findIndex(l => l.id === lessonId);
  const nextLesson   = allLessons[currentIndex + 1] ?? null;
  const prevLesson   = allLessons[currentIndex - 1] ?? null;

  async function markComplete() {
    if (!lesson || !enrollment || completing) return;
    setCompleting(true);
    await wsPost("/api/academy/progress", {
      lesson_id:    lesson.id,
      product_id:   slug,
      watch_percent: 100,
    });
    setLesson(l => l ? { ...l, completed: true } : l);
    setSections(ss => ss.map(s => ({
      ...s,
      lessons: s.lessons.map(l => l.id === lessonId ? { ...l, completed: true } : l),
    })));
    setCompleting(false);
  }

  async function onVideoProgress(pct: number) {
    if (!lesson || pct < 85) return;
    if (lesson.completed) return;
    await wsPost("/api/academy/progress", {
      lesson_id:    lesson.id,
      product_id:   slug,
      watch_percent: Math.round(pct),
    });
    setLesson(l => l ? { ...l, completed: true } : l);
  }

  if (loading) return <div className="min-h-screen bg-[#0c0c0f] flex items-center justify-center"><div className="text-white/40">Loading…</div></div>;
  if (!lesson)  return <div className="min-h-screen bg-[#0c0c0f] flex items-center justify-center"><div className="text-white/40">Lesson not found.</div></div>;

  return (
    <div className="min-h-screen bg-[#0c0c0f] flex flex-col" style={{ height: "100vh" }}>
      {/* Top bar */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-white/8 flex-shrink-0">
        <button onClick={() => setNavOpen(v => !v)} className="lg:hidden text-white/50 hover:text-white">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <Link href={`/academy/${slug}/learn`} className="text-white/40 hover:text-white/70 text-sm flex items-center gap-1">
          ← Back
        </Link>
        <span className="text-white/20 text-sm hidden sm:block">/</span>
        <span className="text-white text-sm font-medium hidden sm:block truncate">{lesson.title}</span>
        {lesson.completed && <span className="ml-auto text-xs text-emerald-400 flex items-center gap-1">✓ Completed</span>}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left nav (course outline) */}
        <div className={`${navOpen ? "flex" : "hidden"} lg:flex flex-col w-72 border-r border-white/8 overflow-y-auto flex-shrink-0 bg-[#0c0c0f] absolute lg:relative z-10 h-full`}>
          <div className="p-4 border-b border-white/8">
            <p className="text-xs text-white/40 font-medium uppercase tracking-wide">Course Content</p>
          </div>
          {sections.map(section => (
            <div key={section.id}>
              <p className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-white/30">{section.title}</p>
              {section.lessons.map(l => (
                <Link key={l.id} href={`/academy/${slug}/learn/${l.id}`}
                  onClick={() => setNavOpen(false)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                    l.id === lessonId
                      ? "bg-orange-500/10 text-orange-300 border-r-2 border-orange-500"
                      : l.completed
                      ? "text-emerald-400/80 hover:bg-white/4"
                      : l.unlocked
                      ? "text-white/60 hover:bg-white/4"
                      : "text-white/25 cursor-not-allowed"
                  }`}>
                  <span className="flex-shrink-0 text-xs">
                    {l.completed ? "✓" : !l.unlocked ? "🔒" : l.lesson_type === "video" ? "▶" : "📝"}
                  </span>
                  <span className="truncate">{l.title}</span>
                  {l.duration_secs && <span className="ml-auto text-[10px] text-white/20 flex-shrink-0">{lessonDuration(l.duration_secs)}</span>}
                </Link>
              ))}
            </div>
          ))}
        </div>

        {/* Center: content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto">
            {/* Video */}
            {lesson.lesson_type === "video" && playbackId && token && (
              <div className="w-full aspect-video bg-black">
                <MuxPlayer
                  playbackId={playbackId}
                  tokens={{ playback: token }}
                  streamType="on-demand"
                  style={{ width: "100%", height: "100%" }}
                  onTimeUpdate={(e: React.SyntheticEvent<HTMLVideoElement>) => {
                    const v = e.currentTarget;
                    if (v.duration) onVideoProgress((v.currentTime / v.duration) * 100);
                  }}
                />
              </div>
            )}

            <div className="px-6 py-6">
              <h1 className="text-xl font-bold text-white mb-1">{lesson.title}</h1>
              {lesson.description && (
                <p className="text-white/50 text-sm leading-relaxed mt-3 mb-5 whitespace-pre-wrap">{lesson.description}</p>
              )}

              {/* Mark complete + navigation */}
              <div className="flex items-center gap-3 pt-2 pb-6 border-b border-white/8">
                {!lesson.completed ? (
                  <button onClick={markComplete} disabled={completing}
                    className="bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
                    {completing ? "Marking…" : "Mark Complete"}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    Completed
                  </div>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  {prevLesson?.unlocked && (
                    <Link href={`/academy/${slug}/learn/${prevLesson.id}`}
                      className="text-sm text-white/40 hover:text-white/70 px-3 py-2 rounded-lg hover:bg-white/5">
                      ← Prev
                    </Link>
                  )}
                  {nextLesson?.unlocked && (
                    <Link href={`/academy/${slug}/learn/${nextLesson.id}`}
                      className="text-sm bg-white/8 hover:bg-white/12 text-white px-4 py-2 rounded-lg transition-colors">
                      Next →
                    </Link>
                  )}
                </div>
              </div>

              {/* Mobile: notes + discussion below content */}
              <div className="lg:hidden mt-6 space-y-8">
                <Notes     lessonId={lessonId} productId={slug} />
                <Comments  lessonId={lessonId} productId={slug} />
              </div>
            </div>
          </div>
        </div>

        {/* Right panel: notes + discussion (desktop) */}
        <div className="hidden lg:flex flex-col w-80 border-l border-white/8 flex-shrink-0">
          <div className="flex border-b border-white/8">
            {(["notes","discussion"] as const).map(t => (
              <button key={t} onClick={() => setRightTab(t)}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  rightTab === t ? "text-orange-400 border-b-2 border-orange-500" : "text-white/30 hover:text-white/60"
                }`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {rightTab === "notes"
              ? <Notes     lessonId={lessonId} productId={slug} />
              : <Comments  lessonId={lessonId} productId={slug} />
            }
          </div>
        </div>
      </div>
    </div>
  );
}
