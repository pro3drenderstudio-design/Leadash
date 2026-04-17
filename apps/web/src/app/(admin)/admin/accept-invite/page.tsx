"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function AcceptInviteInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error,  setError]  = useState<string | null>(null);
  const [role,   setRole]   = useState<string>("");

  useEffect(() => {
    if (!token) { setStatus("error"); setError("No invite token found in URL."); return; }
    setStatus("loading");
    fetch("/api/admin/team/accept", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then((d: { ok?: boolean; error?: string; role?: string }) => {
        if (d.ok) { setRole(d.role ?? ""); setStatus("success"); }
        else      { setError(d.error ?? "Failed to accept invitation"); setStatus("error"); }
      })
      .catch(() => { setError("Network error. Please try again."); setStatus("error"); });
  }, [token]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-white/60 text-sm">Accepting invitation…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-xl">
        {status === "success" ? (
          <>
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Welcome to the team!</h1>
            <p className="text-slate-500 dark:text-white/50 text-sm mb-6">
              You now have <span className="font-semibold text-orange-500">{role}</span> access to the Leadash admin panel.
            </p>
            <button
              onClick={() => router.push("/admin/dashboard")}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-xl transition-colors text-sm"
            >
              Go to Dashboard →
            </button>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Invitation error</h1>
            <p className="text-slate-500 dark:text-white/50 text-sm mb-6">{error ?? "Unknown error"}</p>
            <button
              onClick={() => router.push("/admin/dashboard")}
              className="w-full py-2.5 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-white/70 font-semibold rounded-xl transition-colors text-sm"
            >
              Back to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return <Suspense><AcceptInviteInner /></Suspense>;
}
