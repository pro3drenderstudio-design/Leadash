"use client";
import { useEffect, useState } from "react";

function ComingSoonOverlay() {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0a0d]">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-orange-500/5 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] rounded-full bg-indigo-500/5 blur-3xl" />
      </div>

      <div className="relative z-10 text-center px-6 max-w-lg">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          <span className="text-orange-400 text-xs font-semibold uppercase tracking-widest">Coming Soon</span>
        </div>

        <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
          Leadash Academy
        </h1>

        <p className="text-white/50 text-base leading-relaxed mb-10">
          Step-by-step courses and live challenges designed to help Nigerian professionals land foreign clients and earn in dollars.
        </p>

        <p className="text-white/25 text-sm">
          We're putting the finishing touches on this. Check back soon.
        </p>
      </div>
    </div>
  );
}

export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  const [accessible, setAccessible] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/academy/access", { credentials: "include" })
      .then(r => r.json())
      .then(d => setAccessible(d.accessible === true))
      .catch(() => setAccessible(false));
  }, []);

  // Still checking — show nothing (avoids flash)
  if (accessible === null) return null;

  if (!accessible) return <ComingSoonOverlay />;

  return <>{children}</>;
}
