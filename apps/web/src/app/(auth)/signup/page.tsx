"use client";

/**
 * /signup — restyled to v2-app.
 *
 * Business logic preserved exactly:
 *   - Google OAuth via supabase-js
 *   - POST /api/auth/signup with email + password + full_name
 *   - On confirmed === true → redirect to /onboarding
 *   - Otherwise → show the "check your inbox" state
 *
 * Removed: SOCIAL_PROOF list, FEATURES sidebar, indigo gradients. The
 * brand panel (AuthShell) does the heavy lifting now.
 */

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "../components/AuthShell";
import { Button, Input, Field, Icon } from "@/v2-app";
import {
  EyeIcon,
  ViewOffSlashIcon,
  AlertCircleIcon,
  Mail01Icon,
} from "@/v2-app/icons";

export default function SignupPage() {
  const [name, setName]                   = useState("");
  const [email, setEmail]                 = useState("");
  const [password, setPassword]           = useState("");
  const [showPassword, setShow]           = useState(false);
  const [error, setError]                 = useState("");
  const [loading, setLoading]             = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [done, setDone]                   = useState(false);

  async function handleGoogle() {
    setGoogleLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
    if (error) { setError(error.message); setGoogleLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, full_name: name || undefined }),
      });
      const d = await res.json() as { error?: string; confirmed?: boolean };
      if (!res.ok) { setError(d.error ?? "Something went wrong. Please try again."); setLoading(false); }
      else if (d.confirmed) { window.location.href = "/onboarding"; }
      else setDone(true);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  // ── Strength meter — same threshold buckets, restrained visual ───────────
  const strengthScore = password.length === 0 ? 0
    : password.length < 6  ? 1
    : password.length < 10 ? 2
    : password.length < 14 ? 3
    : 4;

  if (done) {
    return (
      <AuthShell tone="signup">
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: "50%", marginInline: "auto",
              background: "var(--app-accent-soft)",
              border: "1px solid var(--app-accent-line)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "var(--app-accent)", marginBottom: 20,
            }}
          >
            <Icon icon={Mail01Icon} size={20} />
          </div>
          <h1 className="app-h1" style={{ marginBottom: 6 }}>Check your inbox</h1>
          <p style={{ color: "var(--app-text-muted)", fontSize: 14, marginBottom: 2 }}>
            We sent a confirmation link to
          </p>
          <p style={{ color: "var(--app-text)", fontWeight: 500, fontSize: 14 }}>{email}</p>
          <p style={{ color: "var(--app-text-quiet)", fontSize: 12, marginTop: 14, lineHeight: 1.55 }}>
            Click the link to activate your account. Check spam if it&apos;s not there in a minute.
          </p>
          <Link
            href="/login"
            style={{ display: "inline-block", marginTop: 28, fontSize: 13, color: "var(--app-accent)" }}
          >
            ← Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell tone="signup">
      <header style={{ marginBottom: 28 }}>
        <h1 className="app-h1" style={{ marginBottom: 6 }}>Create your account</h1>
        <p style={{ color: "var(--app-text-muted)", fontSize: 14 }}>
          Free 14-day trial. No card to start.
        </p>
      </header>

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

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0 22px" }}>
        <span style={{ height: 1, flex: 1, background: "var(--app-border)" }} />
        <span style={{ fontSize: 11, color: "var(--app-text-quiet)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          or with email
        </span>
        <span style={{ height: 1, flex: 1, background: "var(--app-border)" }} />
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Full name">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
          />
        </Field>

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

        <Field label="Password" required>
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
          {password.length > 0 && <StrengthMeter score={strengthScore} />}
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
          disabled={loading || googleLoading}
          style={{ width: "100%", marginTop: 6 }}
        >
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p style={{ marginTop: 22, fontSize: 11, color: "var(--app-text-quiet)", textAlign: "center", lineHeight: 1.5 }}>
        By creating an account you agree to our{" "}
        <Link href="/terms" style={{ color: "var(--app-text-muted)" }}>Terms</Link>{" "}and{" "}
        <Link href="/privacy" style={{ color: "var(--app-text-muted)" }}>Privacy Policy</Link>.
      </p>
    </AuthShell>
  );
}

function StrengthMeter({ score }: { score: number }) {
  const labels = ["", "Too short", "Okay", "Good", "Strong"];
  return (
    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ display: "flex", gap: 3, flex: 1 }}>
        {[1, 2, 3, 4].map(i => (
          <span
            key={i}
            style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= score
                ? score >= 3 ? "var(--app-success)"
                  : score === 2 ? "var(--app-warning)"
                  : "var(--app-danger)"
                : "var(--app-border)",
              transition: "background var(--app-dur) var(--app-ease)",
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 11, color: "var(--app-text-quiet)", minWidth: 56, textAlign: "right" }}>
        {labels[score]}
      </span>
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
