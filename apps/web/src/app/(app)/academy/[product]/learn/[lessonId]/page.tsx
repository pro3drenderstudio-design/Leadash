"use client";
import "@/v2-app/v2-app.css";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { wsGet, wsPost } from "@/lib/workspace/client";
import type { SectionWithLessons, LessonWithState, AcademyComment, AcademyNote, AcademyEnrollment } from "@/types/academy";
import { lessonDuration } from "@/types/academy";
import { AdaptiveVideo } from "@/components/video/AdaptiveVideo";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  Menu02Icon,
  CheckmarkCircle02Icon,
  PlayCircleIcon,
  LockedIcon,
  DocumentValidationIcon,
  ArrowRight01Icon,
  PinIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h4 className="app-eyebrow">Discussion ({comments.length})</h4>

      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          value={body} onChange={e => setBody(e.target.value)} rows={2}
          placeholder="Ask a question or share a win…"
          className="app-textarea"
          style={{ flex: 1, resize: "none" }}
        />
        <button onClick={() => submit(replyTo)} disabled={submitting || !body.trim()}
          className="app-btn app-btn-primary"
          style={{ alignSelf: "flex-end" }}>
          Post
        </button>
      </div>

      {comments.map(c => (
        <div key={c.id} style={c.is_pinned ? {
          borderLeft: "2px solid var(--app-accent)",
          paddingLeft: 12,
        } : undefined}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "var(--app-surface)", border: "1px solid var(--app-border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, color: "var(--app-text-muted)", flexShrink: 0,
            }}>
              {c.user_name?.[0] ?? "?"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--app-text-muted)" }}>{c.user_name}</span>
                {c.is_pinned && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--app-accent)" }}>
                    <HugeiconsIcon icon={PinIcon} size={10} /> Pinned
                  </span>
                )}
                <span style={{ fontSize: 10, color: "var(--app-text-quiet)" }}>{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
              <p style={{ fontSize: 13, color: "var(--app-text)", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{c.body}</p>
              <button onClick={() => setReplyTo(c.id)} style={{
                fontSize: 11, color: "var(--app-text-quiet)", marginTop: 4,
                background: "transparent", border: "none", cursor: "pointer", padding: 0,
              }}>
                Reply
              </button>
              {replyTo === c.id && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={1}
                    placeholder="Your reply…"
                    className="app-textarea"
                    style={{ flex: 1, resize: "none" }} />
                  <button onClick={() => submit(c.id)} disabled={submitting || !body.trim()} className="app-btn app-btn-secondary" style={{ alignSelf: "flex-end" }}>
                    Post
                  </button>
                  <button onClick={() => { setReplyTo(null); setBody(""); }} style={{
                    alignSelf: "flex-end", background: "transparent", border: "none",
                    color: "var(--app-text-quiet)", cursor: "pointer",
                  }} aria-label="Cancel">
                    <HugeiconsIcon icon={Cancel01Icon} size={14} />
                  </button>
                </div>
              )}
              {(c.replies ?? []).map(r => (
                <div key={r.id} style={{ display: "flex", gap: 8, marginTop: 10, marginLeft: 16, alignItems: "flex-start" }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: "var(--app-surface)", border: "1px solid var(--app-border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, color: "var(--app-text-quiet)", flexShrink: 0,
                  }}>
                    {r.user_name?.[0] ?? "?"}
                  </div>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "var(--app-text-muted)", marginRight: 8 }}>{r.user_name}</span>
                    <span style={{ fontSize: 13, color: "var(--app-text)" }}>{r.body}</span>
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

function Notes({ lessonId, productId }: { lessonId: string; productId: string }) {
  const [body, setBody]   = useState("");
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(e.target.value), 800);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h4 className="app-eyebrow">My Notes</h4>
        <span style={{
          fontSize: 11, color: "var(--app-text-quiet)",
          opacity: saved ? 0 : 1, transition: "opacity var(--app-dur) var(--app-ease)",
        }}>
          Saving…
        </span>
      </div>
      <textarea
        value={body} onChange={onChange} rows={10}
        placeholder="Take notes while you watch…"
        className="app-textarea"
        style={{ width: "100%", resize: "none", lineHeight: 1.55 }} />
    </div>
  );
}

function LessonBlockView({ block }: { block: { block_type: "rich_text" | "callout" | "code"; content: string } }) {
  if (block.block_type === "callout") {
    return (
      <div
        style={{
          padding: "14px 16px",
          borderRadius: "var(--app-radius)",
          border: "1px solid var(--app-accent-line)",
          background: "var(--app-accent-soft)",
          color: "var(--app-text)",
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        {block.content}
      </div>
    );
  }
  if (block.block_type === "code") {
    return (
      <pre
        style={{
          padding: "14px 16px",
          borderRadius: "var(--app-radius)",
          background: "var(--app-bg-elevated)",
          border: "1px solid var(--app-border)",
          color: "var(--app-text)",
          fontSize: 13,
          lineHeight: 1.55,
          overflow: "auto",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        <code>{block.content}</code>
      </pre>
    );
  }
  return (
    <div
      className="lesson-rich"
      style={{ color: "var(--app-text)", fontSize: 14, lineHeight: 1.65 }}
      dangerouslySetInnerHTML={{ __html: block.content }}
    />
  );
}

function LessonResourceRow({ resource }: {
  resource: {
    resource_type: "file" | "link";
    label: string;
    description: string | null;
    url: string;
    file_mime: string | null;
    file_bytes: number | null;
  };
}) {
  const isFile = resource.resource_type === "file";
  const sizeLabel = resource.file_bytes
    ? resource.file_bytes > 1024 * 1024
      ? `${(resource.file_bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(resource.file_bytes / 1024).toFixed(0)} KB`
    : null;
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noreferrer noopener"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: "var(--app-radius)",
        border: "1px solid var(--app-border)",
        background: "var(--app-bg-elevated)",
        textDecoration: "none",
        transition: "border-color var(--app-dur) var(--app-ease)",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--app-border-strong)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--app-border)"; }}
    >
      <span
        style={{
          width: 30, height: 30, borderRadius: 6,
          background: "var(--app-surface)",
          border: "1px solid var(--app-border)",
          color: "var(--app-text-muted)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {isFile ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.71"/>
          </svg>
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--app-text)" }}>{resource.label}</p>
        {resource.description && (
          <p style={{ fontSize: 12, color: "var(--app-text-quiet)", marginTop: 2 }}>{resource.description}</p>
        )}
      </div>
      {sizeLabel && (
        <span style={{ fontSize: 11, color: "var(--app-text-quiet)", flexShrink: 0 }}>{sizeLabel}</span>
      )}
      <span aria-hidden style={{ color: "var(--app-text-quiet)", fontSize: 14, flexShrink: 0 }}>↗</span>
    </a>
  );
}

type LessonBlock = { id: string; position: number; block_type: "rich_text" | "callout" | "code"; content: string };
type LessonResource = {
  id: string;
  position: number;
  resource_type: "file" | "link";
  label: string;
  description: string | null;
  url: string;
  file_mime: string | null;
  file_bytes: number | null;
};

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
  const [blocks,      setBlocks]      = useState<LessonBlock[]>([]);
  const [resources,   setResources]   = useState<LessonResource[]>([]);

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

    wsGet<{ token: string; playback_id: string }>(`/api/academy/lessons/${lessonId}/token`)
      .then(d => { setToken(d.token); setPlaybackId(d.playback_id); })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`/api/academy/lessons/${lessonId}/content`)
      .then(r => r.ok ? r.json() : { blocks: [], resources: [] })
      .then((d: { blocks?: LessonBlock[]; resources?: LessonResource[] }) => {
        setBlocks(d.blocks ?? []);
        setResources(d.resources ?? []);
      })
      .catch(() => { setBlocks([]); setResources([]); });
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

  if (loading) return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--app-text-quiet)", fontSize: 13 }}>Loading…</div>
    </div>
  );
  if (!lesson) return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--app-text-quiet)", fontSize: 13 }}>Lesson not found.</div>
    </div>
  );

  return (
    <div className="v2-app flex flex-col" style={{ height: "100vh", background: "var(--app-bg)" }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "10px 16px",
        borderBottom: "1px solid var(--app-border)",
        background: "var(--app-bg-sunken)",
        flexShrink: 0,
      }}>
        <button onClick={() => setNavOpen(v => !v)}
          className="lg:hidden"
          style={{
            background: "transparent", border: "none",
            color: "var(--app-text-muted)", cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 32, borderRadius: 6,
          }}
          aria-label="Toggle nav"
        >
          <HugeiconsIcon icon={Menu02Icon} size={18} strokeWidth={1.8} />
        </button>
        <Link href={`/academy/${slug}/learn`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            color: "var(--app-text-muted)",
            fontSize: "var(--app-body-sm)",
            textDecoration: "none",
            transition: "color var(--app-dur) var(--app-ease)",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--app-text)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--app-text-muted)")}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.8} />
          Back to course
        </Link>
        <span style={{ color: "var(--app-border-strong)", fontSize: 13 }} className="hidden sm:block">/</span>
        <span style={{ color: "var(--app-text)", fontSize: "var(--app-body-sm)", fontWeight: 500 }} className="hidden sm:block truncate">{lesson.title}</span>
        {lesson.completed && (
          <span style={{
            marginLeft: "auto",
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: "var(--app-small)",
            color: "var(--app-success, #34d399)",
          }}>
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={1.8} />
            Completed
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left nav */}
        <div
          className={`${navOpen ? "flex" : "hidden"} lg:flex flex-col`}
          style={{
            width: 288,
            borderRight: "1px solid var(--app-border)",
            background: "var(--app-bg-sunken)",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <div style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--app-border)",
          }}>
            <p className="app-eyebrow">Course Content</p>
          </div>
          {sections.map(section => (
            <div key={section.id}>
              <p style={{
                padding: "12px 16px 6px",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--app-text-quiet)",
              }}>
                {section.title}
              </p>
              {section.lessons.map(l => {
                const active   = l.id === lessonId;
                const lockedSt = !l.unlocked && !l.is_free_preview;
                return (
                  <Link key={l.id} href={`/academy/${slug}/learn/${l.id}`}
                    aria-disabled={lockedSt}
                    onClick={e => {
                      // Locked future lessons: do nothing (don't navigate — otherwise
                      // the viewer's unlock guard bounces the user to the dashboard).
                      if (lockedSt) { e.preventDefault(); return; }
                      setNavOpen(false);
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 16px",
                      fontSize: "var(--app-body-sm)",
                      textDecoration: "none",
                      transition: "all var(--app-dur) var(--app-ease)",
                      background:  active ? "var(--app-accent-soft)" : "transparent",
                      color:       active ? "var(--app-accent)"
                                : l.completed ? "var(--app-success, #34d399)"
                                : lockedSt   ? "var(--app-text-quiet)"
                                : "var(--app-text-muted)",
                      borderLeft:  active ? "2px solid var(--app-accent)" : "2px solid transparent",
                      cursor: lockedSt ? "not-allowed" : "pointer",
                    }}
                    onMouseEnter={e => {
                      if (!active && !lockedSt) {
                        e.currentTarget.style.background = "var(--app-surface)";
                        e.currentTarget.style.color = "var(--app-text)";
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active && !lockedSt) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = l.completed ? "var(--app-success, #34d399)" : "var(--app-text-muted)";
                      }
                    }}
                  >
                    <HugeiconsIcon
                      icon={l.completed ? CheckmarkCircle02Icon : lockedSt ? LockedIcon : l.lesson_type === "video" ? PlayCircleIcon : DocumentValidationIcon}
                      size={14}
                      strokeWidth={1.8}
                      style={{ flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</span>
                    {l.duration_secs != null && (
                      <span style={{ fontSize: 10, color: "var(--app-text-quiet)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                        {lessonDuration(l.duration_secs)}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Center: content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto">
            {lesson.lesson_type === "video" && playbackId && token && (
              <div style={{ width: "100%", aspectRatio: "16 / 9", background: "#000" }}>
                <AdaptiveVideo
                  src={`https://stream.mux.com/${playbackId}.m3u8?token=${token}`}
                  onProgress={onVideoProgress}
                />
              </div>
            )}

            <div style={{ padding: "28px 28px 32px" }}>
              <h1 style={{ fontSize: "var(--app-title)", fontWeight: 600, color: "var(--app-text)", letterSpacing: "-0.01em" }}>{lesson.title}</h1>
              {lesson.description && (
                <p style={{ color: "var(--app-text-muted)", fontSize: "var(--app-body)", lineHeight: 1.6, marginTop: 12, marginBottom: 22, whiteSpace: "pre-wrap" }}>
                  {lesson.description}
                </p>
              )}

              {(lesson as unknown as { cta_text?: string | null; cta_url?: string | null }).cta_text &&
               (lesson as unknown as { cta_text?: string | null; cta_url?: string | null }).cta_url && (
                <div style={{ marginBottom: 22 }}>
                  <a
                    href={(lesson as unknown as { cta_url: string }).cta_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="app-btn app-btn-primary"
                  >
                    {(lesson as unknown as { cta_text: string }).cta_text}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M7 17L17 7"/><path d="M9 7h8v8"/>
                    </svg>
                  </a>
                </div>
              )}

              {blocks.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 28 }}>
                  {blocks.map(b => <LessonBlockView key={b.id} block={b} />)}
                </div>
              )}

              {resources.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <p className="app-eyebrow" style={{ marginBottom: 12 }}>Resources</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {resources.map(r => <LessonResourceRow key={r.id} resource={r} />)}
                  </div>
                </div>
              )}

              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                paddingTop: 8, paddingBottom: 24,
                borderBottom: "1px solid var(--app-border)",
              }}>
                {!lesson.completed ? (
                  <button onClick={markComplete} disabled={completing} className="app-btn app-btn-primary">
                    {completing ? "Marking…" : "Mark Complete"}
                  </button>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--app-body-sm)", color: "var(--app-success, #34d399)" }}>
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={15} strokeWidth={2} />
                    Completed
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                  {prevLesson?.unlocked && (
                    <Link href={`/academy/${slug}/learn/${prevLesson.id}`} className="app-btn app-btn-secondary">
                      <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.8} />
                      Prev
                    </Link>
                  )}
                  {nextLesson?.unlocked && (
                    <Link href={`/academy/${slug}/learn/${nextLesson.id}`} className="app-btn app-btn-secondary">
                      Next
                      <HugeiconsIcon icon={ArrowRight01Icon} size={13} strokeWidth={1.8} />
                    </Link>
                  )}
                </div>
              </div>

              {/* Mobile: notes + discussion below content */}
              <div className="lg:hidden" style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 32 }}>
                <Notes     lessonId={lessonId} productId={slug} />
                <Comments  lessonId={lessonId} productId={slug} />
              </div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="hidden lg:flex flex-col" style={{
          width: 320,
          borderLeft: "1px solid var(--app-border)",
          background: "var(--app-bg-sunken)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", borderBottom: "1px solid var(--app-border)" }}>
            {(["notes","discussion"] as const).map(t => {
              const active = rightTab === t;
              return (
                <button key={t} onClick={() => setRightTab(t)}
                  style={{
                    flex: 1,
                    padding: "12px 0",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: active ? "var(--app-accent)" : "var(--app-text-quiet)",
                    borderBottom: active ? "2px solid var(--app-accent)" : "2px solid transparent",
                    transition: "color var(--app-dur) var(--app-ease)",
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
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
