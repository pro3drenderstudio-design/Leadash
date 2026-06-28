"use client";

/**
 * /login — restyled to v2-app.
 *
 * Same Supabase auth flow as before (password sign-in + Google OAuth via
 * the supabase-js client). All business logic is byte-identical to the
 * previous file; only the chrome and form styling changed.
 */

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "../components/AuthShell";
import { Button, Input, Field, Icon } from "@/v2-app";
import { EyeIcon, ViewOffSlashIcon, AlertCircleIcon } from "@/v2-app/icons";

// Only honor a same-origin relative path (e.g. "/inboxes/new") so this can't
// be used as an open redirect — same rule as /api/auth/callback's `next` param.
function safeRedirectParam(value: string | null): string | null {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const redirectTarget = safeRedirectParam(searchParams.get("redirect"));

  const [email, setEmail]                 = useState("");
  const [password, setPassword]           = useState("");
  const [showPassword, setShow]           = useState(false);
  const [error, setError]                 = useState("");
  const [loading, setLoading]             = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogle() {
    setGoogleLoading(true);
    setError("");
    const supabase = createClient();
    const next = redirectTarget ? `?next=${encodeURIComponent(redirectTarget)}` : "";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback${next}` },
    });
    if (error) { setError(error.message); setGoogleLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); }
    else window.location.href = redirectTarget ?? "/dashboard";
  }

  return (
    <AuthShell tone="signin">
      <header style={{ marginBottom: 28 }}>
        <h1 className="app-h1" style={{ marginBottom: 6 }}>Sign in</h1>
        <p style={{ color: "var(--app-text-muted)", fontSize: 14 }}>
          Welcome back. Pick up where you left off.
        </p>
      </header>

      {/* Google */}
      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={handleGoogle}
        disabled={googleLoading || loading}
        style={{ width: "100%", marginBottom: 18 }}
      >
        <GoogleMark />
        Continue with Google
      </Button>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0 22px" }}>
        <span style={{ height: 1, flex: 1, background: "var(--app-border)" }} />
        <span style={{ fontSize: 11, color: "var(--app-text-quiet)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          or with email
        </span>
        <span style={{ height: 1, flex: 1, background: "var(--app-border)" }} />
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Email" required>
          <Input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
          />
        </Field>

        <Field
          label={
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span>Password</span>
              <Link href="/forgot-password" style={{ fontSize: 11, color: "var(--app-text-quiet)" }}>
                Forgot?
              </Link>
            </span>
          }
          required
        >
          <div style={{ position: "relative" }}>
            <Input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
              style={{ paddingRight: 36 }}
            />
            <button
              type="button"
              onClick={() => setShow(v => !v)}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                color: "var(--app-text-quiet)",
                cursor: "pointer",
                padding: 4,
                display: "inline-flex",
              }}
            >
              <Icon icon={showPassword ? ViewOffSlashIcon : EyeIcon} size={14} />
            </button>
          </div>
        </Field>

        {error && <ErrorRow message={error} />}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={loading || googleLoading}
          style={{ width: "100%", marginTop: 6 }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p style={{ marginTop: 22, fontSize: 12, color: "var(--app-text-quiet)", textAlign: "center" }}>
        Don&apos;t have an account?{" "}
        <Link href="/signup" style={{ color: "var(--app-accent)", fontWeight: 500 }}>
          Start free
        </Link>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

// Field-style label can accept ReactNode; the Field component types label as
// string by default. Wrap with a casted helper so we can pass the right-aligned
// "Forgot?" link inline without a custom layout.
declare module "@/v2-app" {}

function ErrorRow({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "10px 12px",
        borderRadius: "var(--app-radius-sm)",
        background: "var(--app-danger-soft)",
        border: "1px solid rgba(248, 113, 113, 0.30)",
        color: "var(--app-danger)",
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      <Icon icon={AlertCircleIcon} size={14} />
      <span>{message}</span>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
