"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function ConnectInner() {
  const params   = useSearchParams();
  const token    = params.get("token");
  const [status, setStatus] = useState<"idle" | "connecting" | "done" | "error" | "noauth">("idle");
  const [err,    setErr]    = useState("");

  useEffect(() => {
    // If not logged in, redirect to login then come back
    fetch("/api/settings/profile", { credentials: "include" })
      .then(r => { if (r.status === 401) setStatus("noauth"); })
      .catch(() => {});
  }, []);

  async function connect() {
    if (!token) { setErr("Missing connection token. Please try again from the extension."); return; }
    setStatus("connecting");
    try {
      const res  = await fetch("/api/extension/connect", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setErr(e instanceof Error ? e.message : "Failed to connect. Please try again.");
    }
  }

  if (status === "noauth") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-white/60 text-sm">You need to be logged in to connect the extension.</p>
        <a
          href={`/login?redirect=${encodeURIComponent(`/extension/auth?token=${token ?? ""}`)}`}
          className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Log in to Leadash
        </a>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
          <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
          </svg>
        </div>
        <h2 className="text-white font-bold text-xl">Extension connected!</h2>
        <p className="text-white/50 text-sm max-w-xs">
          The Leadash Chrome extension is now linked to your account. You can close this tab.
        </p>
        <button
          onClick={() => window.close()}
          className="mt-2 px-5 py-2 bg-white/8 hover:bg-white/12 border border-white/10 text-white/70 text-sm rounded-xl transition-colors"
        >
          Close tab
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-orange-500/15 flex items-center justify-center">
        <svg className="w-7 h-7 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/>
        </svg>
      </div>
      <div>
        <h1 className="text-white font-bold text-2xl">Connect Chrome Extension</h1>
        <p className="text-white/50 text-sm mt-2 max-w-sm">
          Click below to link the Leadash Chrome extension to your account. This creates a secure API key automatically.
        </p>
      </div>

      {!token && (
        <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-amber-300 text-sm">
          No connection token found. Please initiate the connection from within the Chrome extension.
        </div>
      )}

      {err && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-300 text-sm">
          {err}
        </div>
      )}

      {token && (
        <button
          onClick={connect}
          disabled={status === "connecting"}
          className="px-8 py-3 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm"
        >
          {status === "connecting" ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Connecting…
            </span>
          ) : "Connect Extension"}
        </button>
      )}

      <p className="text-white/25 text-xs max-w-xs">
        This will create or update a &ldquo;Chrome Extension&rdquo; API key in your Leadash account.
        You can revoke it at any time from Settings → API Keys.
      </p>
    </div>
  );
}

export default function ExtensionAuthPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white/4 border border-white/8 rounded-3xl p-8">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <img src="/Logo_Icon_Colored.svg" alt="Leadash" className="w-7 h-7" />
          <span className="text-white font-bold text-lg">Leadash</span>
        </div>
        <Suspense fallback={null}>
          <ConnectInner />
        </Suspense>
      </div>
    </div>
  );
}
