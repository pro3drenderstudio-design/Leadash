"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ImpersonationInfo {
  targetEmail: string;
  adminEmail: string;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function ImpersonationBanner() {
  const router = useRouter();
  const [info, setInfo] = useState<ImpersonationInfo | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const raw = getCookie("admin_impersonating");
    if (!raw) return;
    try {
      setInfo(JSON.parse(raw));
    } catch {
      // malformed cookie — ignore
    }
  }, []);

  if (!info) return null;

  async function handleExit() {
    setExiting(true);
    window.location.href = "/api/admin/impersonate/exit";
  }

  return (
    <div className="fixed top-0 inset-x-0 z-[9999] bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm font-medium shadow-lg">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span>
          You are impersonating <strong>{info.targetEmail}</strong>
          <span className="opacity-75 font-normal"> (signed in as {info.adminEmail})</span>
        </span>
      </div>
      <button
        onClick={handleExit}
        disabled={exiting}
        className="ml-4 flex-shrink-0 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors disabled:opacity-60"
      >
        {exiting ? "Returning…" : "Exit Impersonation →"}
      </button>
    </div>
  );
}
