"use client";
import { useMemo, useState } from "react";
import { scoreMessage, gradeColor, gradeBg, type SpamResult } from "@/lib/outreach/spam-scorer";

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

const SEVERITY_COLOR: Record<SpamResult["issues"][number]["severity"], string> = {
  high:   "text-red-400 bg-red-500/10 border-red-500/20",
  medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  low:    "text-white/40 bg-white/5 border-white/10",
};

interface Props {
  subject: string;
  body: string;
  onFix?: () => void;
  fixLoading?: boolean;
}

export default function SpamCheckerPanel({ subject, body, onFix, fixLoading }: Props) {
  const result = useMemo<SpamResult>(() => {
    const plainBody = stripHtml(body);
    return scoreMessage(subject, plainBody);
  }, [subject, body]);

  const hasIssues = result.issues.length > 0;
  // Auto-expand when there are issues; collapse when clean
  const [expanded, setExpanded] = useState(hasIssues);
  useMemo(() => { if (hasIssues) setExpanded(true); }, [hasIssues]);
  const borderColor =
    result.grade === "A" || result.grade === "B" ? "border-emerald-500/20" :
    result.grade === "C" ? "border-amber-500/20" : "border-red-500/20";

  return (
    <div className={`rounded-lg border ${borderColor} bg-white/3 text-xs overflow-hidden`}>
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/3 transition-colors text-left"
      >
        {/* Shield icon */}
        <svg className="w-3.5 h-3.5 flex-shrink-0 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>

        <span className="text-white/40 font-medium">Spam Check</span>

        {/* Grade badge */}
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-bold ${gradeBg(result.grade)}`}>
          <span className={gradeColor(result.grade)}>Grade {result.grade}</span>
          <span className="text-white/30">{result.score.toFixed(1)}</span>
        </span>

        {/* Issues count or "passed" */}
        {hasIssues ? (
          <span className="text-white/35">
            {result.issues.length} issue{result.issues.length !== 1 ? "s" : ""}
          </span>
        ) : (
          <span className="text-emerald-400/70">No issues found</span>
        )}

        <div className="flex-1" />

        {/* Fix with AI button */}
        {onFix && !result.passed && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onFix(); }}
            disabled={fixLoading}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-violet-500/15 border border-violet-500/25 text-violet-400 hover:text-violet-300 hover:bg-violet-500/20 disabled:opacity-40 transition-colors"
          >
            {fixLoading ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            )}
            Fix with AI
          </button>
        )}

        {/* Expand chevron */}
        {hasIssues && (
          <svg
            className={`w-3.5 h-3.5 text-white/25 transition-transform flex-shrink-0 ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Issue list */}
      {expanded && hasIssues && (
        <div className="border-t border-white/8 divide-y divide-white/5">
          {result.issues.map((issue, idx) => (
            <div key={idx} className="flex items-start gap-2 px-3 py-2">
              <span className={`mt-0.5 px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 ${SEVERITY_COLOR[issue.severity]}`}>
                {issue.severity}
              </span>
              <span className="text-white/55 leading-relaxed">{issue.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
