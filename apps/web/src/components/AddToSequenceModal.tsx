"use client";
import { useState, useEffect } from "react";
import { checkEnrollmentDuplicates, enrollLeads } from "@/lib/outreach/api";

// ─── Tier config ──────────────────────────────────────────────────────────────

interface Tier {
  id:          string;
  label:       string;
  sublabel:    string;
  statuses:    string[];
  dot:         string;
  ring:        string;
  selectable:  boolean;
  defaultOn:   boolean;
  warning?:    string;
}

const TIERS: Tier[] = [
  {
    id: "deliverable", label: "Deliverable", sublabel: "Safe & valid — confirmed deliverable",
    statuses: ["safe", "valid", "verified_external"],
    dot: "bg-emerald-500", ring: "border-emerald-500/30 bg-emerald-500/8",
    selectable: true, defaultOn: true,
  },
  {
    id: "catch_all", label: "Catch-all", sublabel: "Server accepts all mail — usually delivered",
    statuses: ["catch_all"],
    dot: "bg-amber-400", ring: "border-amber-400/30 bg-amber-500/8",
    selectable: true, defaultOn: true,
  },
  {
    id: "unknown", label: "Unknown", sublabel: "Couldn't be verified — outcome uncertain",
    statuses: ["unknown"],
    dot: "bg-white/30", ring: "border-white/10 bg-white/4",
    selectable: true, defaultOn: false,
  },
  {
    id: "unverified", label: "Unverified", sublabel: "Verification not yet run on these leads",
    statuses: ["pending"],
    dot: "bg-white/20", ring: "border-white/10 bg-white/4",
    selectable: true, defaultOn: false,
  },
  {
    id: "risky", label: "Risky", sublabel: "May increase bounce rate",
    statuses: ["risky"],
    dot: "bg-orange-400", ring: "border-orange-500/25 bg-orange-500/6",
    selectable: true, defaultOn: false,
    warning: "Including risky leads may hurt sender reputation",
  },
  {
    id: "unsafe", label: "Unsafe", sublabel: "Invalid, dangerous, disposable — always blocked",
    statuses: ["invalid", "dangerous", "disposable"],
    dot: "bg-red-500", ring: "border-red-500/20 bg-red-500/5",
    selectable: false, defaultOn: false,
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AddToSequenceModalProps {
  campaignId:  string;
  listIds:     string[];
  onClose:     () => void;
  onEnrolled:  (enrolled: number) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddToSequenceModal({
  campaignId, listIds, onClose, onEnrolled,
}: AddToSequenceModalProps) {
  const [loading,   setLoading]   = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const [statusCounts,           setStatusCounts]           = useState<Record<string, number>>({});
  const [alreadyEnrolledByStatus, setAlreadyEnrolledByStatus] = useState<Record<string, number>>({});
  const [selected, setSelected]  = useState<Set<string>>(
    () => new Set(TIERS.filter(t => t.defaultOn).map(t => t.id)),
  );

  useEffect(() => {
    checkEnrollmentDuplicates(campaignId, listIds)
      .then(d => {
        setStatusCounts(d.status_counts ?? {});
        setAlreadyEnrolledByStatus(d.already_enrolled_by_status ?? {});
      })
      .catch(() => setError("Failed to load lead counts"))
      .finally(() => setLoading(false));
  }, [campaignId, listIds]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(tierId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(tierId) ? next.delete(tierId) : next.add(tierId);
      return next;
    });
  }

  // Compute counts for a tier
  function tierTotal(tier: Tier)    { return tier.statuses.reduce((s, st) => s + (statusCounts[st] ?? 0), 0); }
  function tierEnrolled(tier: Tier) { return tier.statuses.reduce((s, st) => s + (alreadyEnrolledByStatus[st] ?? 0), 0); }

  // Net new leads for currently-selected tiers
  const newLeads = TIERS
    .filter(t => t.selectable && selected.has(t.id))
    .reduce((sum, t) => sum + Math.max(0, tierTotal(t) - tierEnrolled(t)), 0);

  const selectedStatuses = TIERS
    .filter(t => t.selectable && selected.has(t.id))
    .flatMap(t => t.statuses);

  async function handleEnroll() {
    if (!selectedStatuses.length || newLeads === 0) return;
    setEnrolling(true); setError(null);
    try {
      const res = await enrollLeads(campaignId, listIds, selectedStatuses);
      onEnrolled(res.enrolled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrollment failed");
      setEnrolling(false);
    }
  }

  const hasUnverified = (statusCounts["pending"] ?? 0) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#0e1017] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
          <div>
            <p className="text-white font-semibold text-base">Add leads to sequence</p>
            <p className="text-white/35 text-xs mt-0.5">Choose which leads to enroll</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-2.5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <svg className="w-5 h-5 animate-spin text-white/30" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : (
            <>
              {TIERS.map(tier => {
                const total    = tierTotal(tier);
                const enrolled = tierEnrolled(tier);
                const net      = Math.max(0, total - enrolled);
                const on       = tier.selectable && selected.has(tier.id);

                if (!tier.selectable) {
                  // Blocked tier — show only if has leads
                  if (!total) return null;
                  return (
                    <div key={tier.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/15 bg-red-500/4 opacity-60 cursor-not-allowed">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${tier.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-white/50 text-sm font-medium">{tier.label}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded font-medium">Blocked</span>
                        </div>
                        <p className="text-white/25 text-xs mt-0.5">{tier.sublabel}</p>
                      </div>
                      <span className="text-white/30 text-sm font-semibold tabular-nums flex-shrink-0">{total.toLocaleString()}</span>
                    </div>
                  );
                }

                if (!total) return null;

                return (
                  <button
                    key={tier.id}
                    onClick={() => toggle(tier.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                      on ? `${tier.ring} border-opacity-100` : "border-white/8 bg-white/2 hover:bg-white/4"
                    }`}
                  >
                    {/* Checkbox */}
                    <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-all ${
                      on ? "bg-orange-500 border-orange-500" : "border-white/20 bg-transparent"
                    }`}>
                      {on && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>

                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${tier.dot}`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${on ? "text-white" : "text-white/60"}`}>{tier.label}</span>
                        {tier.warning && on && (
                          <span className="text-[10px] text-orange-400/80">⚠ {tier.warning}</span>
                        )}
                      </div>
                      <p className="text-white/25 text-xs mt-0.5">{tier.sublabel}</p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-semibold tabular-nums ${on ? "text-white" : "text-white/40"}`}>
                        {total.toLocaleString()}
                      </p>
                      {enrolled > 0 && (
                        <p className="text-white/25 text-[10px] tabular-nums">{enrolled.toLocaleString()} enrolled</p>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Unverified warning */}
              {hasUnverified && !selected.has("unverified") && (
                <p className="text-white/30 text-xs px-1">
                  {(statusCounts["pending"] ?? 0).toLocaleString()} unverified leads excluded —{" "}
                  <button className="text-orange-400/70 hover:text-orange-400 underline underline-offset-2 transition-colors" onClick={() => toggle("unverified")}>
                    include anyway
                  </button>{" "}
                  or verify first in the Leads Pool.
                </p>
              )}

              {error && (
                <p className="text-red-400 text-xs px-1">{error}</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-2 border-t border-white/8 flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-white/6 hover:bg-white/10 text-white/50 text-sm rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleEnroll}
            disabled={loading || enrolling || newLeads === 0 || !selectedStatuses.length}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {enrolling && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {enrolling
              ? "Enrolling…"
              : newLeads === 0
                ? "No new leads to add"
                : `Add ${newLeads.toLocaleString()} leads →`}
          </button>
        </div>
      </div>
    </div>
  );
}
