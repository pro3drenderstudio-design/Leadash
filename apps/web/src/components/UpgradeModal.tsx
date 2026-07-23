"use client";
import { useRouter } from "next/navigation";

/**
 * "Pick a plan" popup shown when a trial/free workspace tries to do something
 * that needs a paid plan (e.g. activating a sequence). Kept deliberately small
 * — it explains why and sends them to the billing page to choose a plan.
 */
export default function UpgradeModal({
  open,
  onClose,
  title = "Pick a plan to continue",
  message = "You can build everything on the free trial — activating your sequence to start sending needs a plan.",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
}) {
  const router = useRouter();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#16161a] p-6 text-center shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/15 border border-orange-500/30 text-2xl">🚀</div>
        <h2 className="text-lg font-bold text-white mb-2">{title}</h2>
        <p className="text-sm text-white/55 leading-relaxed mb-6">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-white/50 hover:text-white/80 transition-colors">
            Not now
          </button>
          <button
            onClick={() => router.push("/settings?tab=billing")}
            className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold transition-colors shadow-sm shadow-orange-500/20"
          >
            See plans →
          </button>
        </div>
      </div>
    </div>
  );
}
