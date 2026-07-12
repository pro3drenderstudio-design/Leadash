"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Status = "checking" | "needs_signup" | "needs_login" | "wrong_email" | "accepting" | "success" | "error";

interface InviteCheck {
  valid:          boolean;
  reason?:        "missing_token" | "not_found" | "already_used" | "expired";
  email?:         string;
  role?:          string;
  exists_as_user?: boolean;
}

function AcceptInviteInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get("token") ?? "";

  const [status,     setStatus]     = useState<Status>("checking");
  const [error,      setError]      = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [inviteRole,  setInviteRole]  = useState<string>("");
  const [signedInEmail, setSignedInEmail] = useState<string>("");

  useEffect(() => {
    if (!token) { setStatus("error"); setError("No invite token found in URL."); return; }

    (async () => {
      // ── Step 1: check the invite + probe the signed-in user in parallel ────
      const [checkRes, sessionRes] = await Promise.all([
        fetch(`/api/admin/team/invite-check?token=${encodeURIComponent(token)}`, {
          credentials: "same-origin",
        }).then(r => r.json() as Promise<InviteCheck>).catch((): InviteCheck => ({ valid: false, reason: "not_found" })),
        createClient().auth.getSession(),
      ]);

      const currentUserEmail = sessionRes.data.session?.user.email?.toLowerCase() ?? "";
      setSignedInEmail(currentUserEmail);

      if (!checkRes.valid) {
        setStatus("error");
        setError(
          checkRes.reason === "expired"      ? "This invitation has expired. Ask an admin to send a new one."
        : checkRes.reason === "already_used" ? "This invitation has already been accepted. Try signing in instead."
        : checkRes.reason === "not_found"    ? "This invitation link isn't valid. Ask an admin to send a new one."
        :                                      "This invitation link is missing a token."
        );
        return;
      }

      setInviteEmail(checkRes.email ?? "");
      setInviteRole(checkRes.role   ?? "");

      const returnTo = `/admin/accept-invite?token=${encodeURIComponent(token)}`;

      // ── Step 2: route based on invite email vs signed-in email ────────────
      if (!currentUserEmail) {
        // Not signed in. Send to signup if the invitee has no Leadash account,
        // otherwise to login. Both preserve the returnTo + prefill email so
        // the user drops back here after auth and finishes the accept.
        if (checkRes.exists_as_user) {
          setStatus("needs_login");
          router.replace(`/login?redirect=${encodeURIComponent(returnTo)}&email=${encodeURIComponent(checkRes.email ?? "")}`);
        } else {
          setStatus("needs_signup");
          router.replace(`/signup?redirect=${encodeURIComponent(returnTo)}&email=${encodeURIComponent(checkRes.email ?? "")}`);
        }
        return;
      }

      if (currentUserEmail !== (checkRes.email ?? "").toLowerCase()) {
        // Signed in as someone else. Don't accept — tell them and give them a
        // one-click way to sign out and start over as the invited email.
        setStatus("wrong_email");
        return;
      }

      // ── Step 3: matching email — run the accept. ─────────────────────────
      setStatus("accepting");
      try {
        const res = await fetch("/api/admin/team/accept", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ token }),
          redirect: "manual",
          credentials: "same-origin",
        });

        if (res.type === "opaqueredirect" || res.status === 401) {
          router.replace(`/login?redirect=${encodeURIComponent(returnTo)}&email=${encodeURIComponent(checkRes.email ?? "")}`);
          return;
        }
        const raw = await res.text();
        let d: { ok?: boolean; error?: string; role?: string } = {};
        try { d = raw ? JSON.parse(raw) : {}; } catch {
          setError("Unexpected response from the server. Try again in a moment.");
          setStatus("error");
          return;
        }
        if (res.ok && d.ok) { setInviteRole(d.role ?? checkRes.role ?? ""); setStatus("success"); return; }
        setError(d.error ?? `Failed to accept invitation (HTTP ${res.status}).`);
        setStatus("error");
      } catch (e) {
        setError(e instanceof Error && e.message
          ? `Network error: ${e.message}`
          : "Network error. Please check your connection and try again.");
        setStatus("error");
      }
    })();
  }, [token, router]);

  async function signOutAndRestart() {
    await createClient().auth.signOut();
    // Reload — the effect above will re-run, detect no session, and route
    // the invitee to /signup or /login for the invite's email.
    window.location.reload();
  }

  if (status === "checking" || status === "accepting" || status === "needs_signup" || status === "needs_login") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-white/60 text-sm">
            {status === "checking"     ? "Checking your invitation…"
            : status === "accepting"    ? "Accepting invitation…"
            : status === "needs_signup" ? "Redirecting to sign up…"
            :                             "Redirecting to sign in…"}
          </p>
        </div>
      </div>
    );
  }

  if (status === "wrong_email") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-xl">
          <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.007M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Wrong email</h1>
          <p className="text-slate-500 dark:text-white/50 text-sm mb-5">
            This invitation was sent to <span className="font-semibold text-slate-800 dark:text-white">{inviteEmail}</span>, but you&apos;re signed in as <span className="font-semibold text-slate-800 dark:text-white">{signedInEmail}</span>. Sign out and continue with the invited email.
          </p>
          <button
            onClick={signOutAndRestart}
            className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-xl transition-colors text-sm mb-2"
          >
            Sign out &amp; continue
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full py-2.5 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-white/70 font-semibold rounded-xl transition-colors text-sm"
          >
            Back to Dashboard
          </button>
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
              You now have <span className="font-semibold text-orange-500">{inviteRole}</span> access to the Leadash admin panel.
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
