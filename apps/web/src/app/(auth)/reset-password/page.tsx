"use client";

/**
 * /reset-password — restyled to v2-app.
 *
 * Business logic preserved: supabase.auth.updateUser({ password }) and
 * the "Password updated" success state.
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
  CheckmarkCircle02Icon,
} from "@/v2-app/icons";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShow] = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setLoading(false); }
    else setDone(true);
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
            You can sign in with your new password.
          </p>
          <Link
            href="/login"
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
        <h1 className="app-h1" style={{ marginBottom: 6 }}>Set new password</h1>
        <p style={{ color: "var(--app-text-muted)", fontSize: 14 }}>
          Eight characters minimum. Longer is better.
        </p>
      </header>

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
