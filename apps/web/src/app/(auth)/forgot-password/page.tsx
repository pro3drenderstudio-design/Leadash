"use client";

/**
 * /forgot-password — restyled to v2-app.
 *
 * Business logic preserved: POST /api/auth/forgot-password with email,
 * show the "check your inbox" state on success.
 */

import { useState } from "react";
import Link from "next/link";
import AuthShell from "../components/AuthShell";
import { Button, Input, Field, Icon } from "@/v2-app";
import { AlertCircleIcon, Mail01Icon } from "@/v2-app/icons";

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? "Something went wrong. Please try again.");
        setLoading(false);
      } else {
        setDone(true);
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthShell tone="minimal">
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
          <p style={{ color: "var(--app-text-muted)", fontSize: 14 }}>
            We sent a reset link to <span style={{ color: "var(--app-text)", fontWeight: 500 }}>{email}</span>.
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
    <AuthShell tone="minimal">
      <header style={{ marginBottom: 28 }}>
        <h1 className="app-h1" style={{ marginBottom: 6 }}>Reset password</h1>
        <p style={{ color: "var(--app-text-muted)", fontSize: 14 }}>
          We&apos;ll email you a link to set a new password.
        </p>
      </header>

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
          {loading ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      <p style={{ marginTop: 22, fontSize: 12, color: "var(--app-text-quiet)", textAlign: "center" }}>
        <Link href="/login" style={{ color: "var(--app-text-muted)" }}>← Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
