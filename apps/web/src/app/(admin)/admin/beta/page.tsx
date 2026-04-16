"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Enrollment {
  id: string;
  user_id: string;
  workspace_id: string;
  email: string;
  name: string | null;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  pending:  "bg-amber-500/15 text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-400",
  rejected: "bg-red-500/15 text-red-400",
};

export default function AdminBetaPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [reviewing, setReviewing]     = useState<string | null>(null);
  const [reviewNote, setReviewNote]   = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/beta?status=${statusFilter}`);
    const data = await res.json() as { enrollments?: Enrollment[] };
    setEnrollments(data.enrollments ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAction(id: string, action: "approve" | "reject") {
    setActionLoading(true);
    await fetch(`/api/admin/beta/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, review_note: reviewNote || undefined }),
    });
    setActionLoading(false);
    setReviewing(null);
    setReviewNote("");
    load();
  }

  const counts = { pending: 0, approved: 0, rejected: 0 };
  // Will be real from server — show what we have
  const pendingCount = enrollments.filter(e => e.status === "pending").length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Beta Programme</h1>
          <p className="text-sm text-slate-400 dark:text-white/40 mt-0.5">Review and approve beta testing applications</p>
        </div>
        {pendingCount > 0 && (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-500 border border-amber-500/20">
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-white/5 rounded-xl p-1 w-fit">
        {(["pending", "approved", "rejected", "all"] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
              statusFilter === s
                ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-slate-100 dark:bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      ) : enrollments.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-white/30">
          <p className="font-medium">No {statusFilter !== "all" ? statusFilter : ""} applications</p>
        </div>
      ) : (
        <div className="space-y-3">
          {enrollments.map(e => (
            <div key={e.id} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-sm font-bold text-orange-400 flex-shrink-0">
                  {(e.name ?? e.email)[0]?.toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">{e.name ?? "—"}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${STATUS_STYLE[e.status]}`}>
                      {e.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-white/40 mt-0.5">{e.email}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 dark:text-white/30">
                    <Link href={`/admin/workspaces/${e.workspace_id}`} className="hover:text-orange-500 transition-colors">
                      View workspace →
                    </Link>
                    <span>{new Date(e.created_at).toLocaleDateString()}</span>
                  </div>
                  {e.reason && (
                    <p className="mt-2 text-xs text-slate-600 dark:text-white/50 bg-slate-50 dark:bg-white/5 rounded-lg px-3 py-2 line-clamp-3">
                      {e.reason}
                    </p>
                  )}
                  {e.review_note && (
                    <p className="mt-2 text-xs text-slate-400 dark:text-white/30 italic">Note: {e.review_note}</p>
                  )}
                </div>

                {/* Actions */}
                {e.status === "pending" && reviewing !== e.id && (
                  <button
                    onClick={() => setReviewing(e.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 transition-colors flex-shrink-0"
                  >
                    Review
                  </button>
                )}
              </div>

              {/* Review panel */}
              {reviewing === e.id && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/10 space-y-3">
                  <div>
                    <label className="text-xs text-slate-500 dark:text-white/40 block mb-1">Note (optional — sent to applicant if rejected)</label>
                    <input
                      type="text"
                      value={reviewNote}
                      onChange={ev => setReviewNote(ev.target.value)}
                      placeholder="e.g. We've reached capacity for this round"
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(e.id, "approve")}
                      disabled={actionLoading}
                      className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50"
                    >
                      {actionLoading ? "…" : "Approve & Upgrade"}
                    </button>
                    <button
                      onClick={() => handleAction(e.id, "reject")}
                      disabled={actionLoading}
                      className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => { setReviewing(null); setReviewNote(""); }}
                      className="px-4 py-2 text-sm text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
