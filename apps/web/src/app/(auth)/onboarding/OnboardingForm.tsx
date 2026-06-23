"use client";

/**
 * /onboarding — restyled to v2-app.
 *
 * Business logic preserved byte-identical:
 *   - POST /api/workspaces with { name }
 *   - setWorkspaceId(data.id) on success
 *   - window.location.href = "/dashboard"
 *
 * Just chrome and form treatment changed. Same auth flow, same redirect.
 */

import { useState } from "react";
import { setWorkspaceId } from "@/lib/workspace/client";
import { Button, Input, Field, Icon } from "@/v2-app";
import { AlertCircleIcon, ArrowRight01Icon } from "@/v2-app/icons";

export default function OnboardingForm() {
  const [name, setName]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);

    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();

    if (!res.ok || data.error) { setError(data.error ?? "Failed to create workspace"); setLoading(false); return; }

    setWorkspaceId(data.id);
    window.location.href = "/dashboard";
  }

  return (
    <div className="v2-app" style={{ minHeight: "100vh", background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_Icon_Colored.svg" alt="" width={22} height={22} />
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--app-text)" }}>Leadash</span>
        </div>

        {/* Step indicator */}
        <p className="app-eyebrow" style={{ textAlign: "center", marginBottom: 12, color: "var(--app-accent)" }}>
          Step 1 of 1
        </p>

        <header style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 className="app-h1" style={{ marginBottom: 8 }}>
            Welcome<span style={{ color: "var(--app-accent)" }}>.</span>
          </h1>
          <p style={{ color: "var(--app-text-muted)", fontSize: 14, lineHeight: 1.55, maxWidth: 360, marginInline: "auto" }}>
            Give your workspace a name. You can change it later — this is just so the dashboard knows what to call you.
          </p>
        </header>

        <div
          style={{
            background: "var(--app-bg-elevated)",
            border: "1px solid var(--app-border)",
            borderRadius: "var(--app-radius-lg)",
            padding: 24,
          }}
        >
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field
              label="Workspace name"
              required
              helper="Usually your company or team name."
            >
              <Input
                type="text"
                required
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Acme Studio"
                autoComplete="organization"
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
              disabled={loading || !name.trim()}
              iconRight={ArrowRight01Icon}
              style={{ width: "100%", marginTop: 4 }}
            >
              {loading ? "Creating…" : "Create workspace"}
            </Button>
          </form>
        </div>

        <p style={{ marginTop: 18, fontSize: 11, color: "var(--app-text-quiet)", textAlign: "center" }}>
          Next: connect your first inbox.
        </p>
      </div>
    </div>
  );
}
