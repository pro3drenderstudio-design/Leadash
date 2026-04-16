"use client";
import Link from "next/link";

interface Props {
  needed: number;
  have: number;
  onClose: () => void;
}

export default function InsufficientCreditsModal({ needed, have, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#0f1117] border border-white/10 rounded-2xl w-full max-w-sm mx-4 p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 mx-auto">
          <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <div className="text-center">
          <p className="text-white font-semibold text-base">Not enough credits</p>
          <p className="text-white/40 text-sm mt-1">
            This operation needs <span className="text-amber-400 font-semibold">{needed.toLocaleString()} credits</span> but your
            balance is <span className="text-white/60 font-semibold">{have.toLocaleString()}</span>.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm text-white/40 hover:text-white/70 border border-white/8 rounded-xl hover:border-white/15 transition-colors"
          >
            Cancel
          </button>
          <Link
            href="/settings?tab=billing"
            onClick={onClose}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors text-center"
          >
            Buy credits →
          </Link>
        </div>
      </div>
    </div>
  );
}
