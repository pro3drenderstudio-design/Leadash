"use client";

/**
 * /reset-password — restyled to v2-app.
 *
 * Business logic:
 *   - supabase.auth.updateUser({ password }) sets the new password.
 *   - When arriving with ?reason=first_login (admin-created account or
 *     admin-triggered reset), a blocking banner explains why. The page
 *     hides the "back to sign in" link since middleware would just bounce
 *     the user back here.
 *   - After a successful password update we call /api/auth/clear-must-reset
 *     which drops user_metadata.must_change_password server-side, unblocking
 *     the middleware gate on the next navigation.
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "../components/AuthShell";
import { Button, Input, Field, Icon } from "@/v2-app";
import {
  EyeIcon,
  ViewOffSlashIcon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
} from "@/v2-app/icons";

// Next.js 16 requires useSearchParams() to be wrapped in a Suspense
// boundary so the shell can be statically prerendered while the search-
// params-dependent body streams. Without this the whole route bails out
// of static generation and the prod build fails.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const [password, setPassword] = useState("");
  const [showPassword, setShow] = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  const search       = useSearchParams();
  const router       = useRouter();
  const forcedReason = search?.get("reason");
  const isFirstLogin = forcedReason === "first_login";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setLoading(false); return; }

    // Clear the must_change_password flag on the server so future logins
    // don't get gated. Failures here aren't fatal — worst case the user
    // resets a second time.
    try {
      await fetch("/api/auth/clear-must-reset", { method: "POST" });
    } catch (e) {
      console.error("[reset-password] clear-must-reset failed:", e);
    }

    // Sign out and route to /login. Reasons:
    //  1. matches what customers expect ("send me back to sign in").
    //  2. avoids a stale-JWT loop — the cookie the browser holds still says
    //     must_change_password=true even though the DB has been updated;
    //     middleware would bounce them right back to /reset-password if we
    //     tried to redirect to /dashboard without a fresh session.
    //  3. security: forces the user to prove the new password actually works.
    await supabase.auth.signOut();
    setDone(true);
    setTimeout(() => router.replace("/login?reset=1"), 900);
  }

  if (done) {
    return (
      <AuthShell tone="minimal">
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: "50%", marginInline: "auto",
              background: "var(--app-success-soft)",
              border: "1px solid rgba(52, 211, 153, 0.30)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "var(--app-success)", marginBottom: 20,
            }}
          >
            <Icon icon={CheckmarkCircle02Icon} size={22} />
          </div>
          <h1 className="app-h1" style={{ marginBottom: 6 }}>Password updated</h1>
          <p style={{ color: "var(--app-text-muted)", fontSize: 14 }}>
            Taking you to sign in with your new password…
          </p>
          <Link
            href="/login?reset=1"
            style={{ display: "inline-block", marginTop: 28, fontSize: 13, color: "var(--app-accent)" }}
          >
            Go to sign in →
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell tone="minimal">
      <header style={{ marginBottom: 28 }}>
        <h1 className="app-h1" style={{ marginBottom: 6 }}>
          {isFirstLogin ? "Set your password" : "Set new password"}
        </h1>
        <p style={{ color: "var(--app-text-muted)", fontSize: 14 }}>
          Eight characters minimum. Longer is better.
        </p>
      </header>

      {isFirstLogin && (
        <div
          role="alert"
          style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "12px 14px", borderRadius: "var(--app-radius-sm)",
            background: "rgba(251, 191, 36, 0.10)",
            border: "1px solid rgba(251, 191, 36, 0.30)",
            color: "var(--app-warning, #d97706)", fontSize: 12.5, lineHeight: 1.5,
            marginBottom: 18,
          }}
        >
          <Icon icon={AlertCircleIcon} size={14} />
          <span>
            <strong>Choose a new password to continue.</strong><br />
            Your account was set up with a temporary password. Pick something only you know — we won't ask again.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="New password" required>
          <div style={{ position: "relative" }}>
            <Input
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="8+ characters"
              autoComplete="new-password"
              style={{ paddingRight: 36 }}
            />
            <button
              type="button"
              onClick={() => setShow(v => !v)}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                background: "transparent", border: "none", color: "var(--app-text-quiet)",
                cursor: "pointer", padding: 4, display: "inline-flex",
              }}
            >
              <Icon icon={showPassword ? ViewOffSlashIcon : EyeIcon} size={14} />
            </button>
          </div>
        </Field>

        {error && (
          <div
            role="alert"
            style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "10px 12px", borderRadius: "var(--app-radius-sm)",
              background: "var(--app-danger-soft)",
              border: "1px solid rgba(248, 113, 113, 0.30)",
              color: "var(--app-danger)", fontSize: 12, lineHeight: 1.45,
            }}
          >
            <Icon icon={AlertCircleIcon} size={14} />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={loading}
          style={{ width: "100%", marginTop: 6 }}
        >
          {loading ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
