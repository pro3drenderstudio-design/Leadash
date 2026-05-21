"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VendorLoginPage() {
  const router    = useRouter();
  const [secret,  setSecret]  = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/vendor/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ secret }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Invalid password");
        return;
      }
      router.push("/vendor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      padding: 24,
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: "40px 36px",
        width: "100%",
        maxWidth: 380,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ color: "#fff", fontWeight: 900, fontSize: 18, letterSpacing: "-1px" }}>L</span>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a", letterSpacing: "-0.3px" }}>Leadash</div>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, marginTop: -1 }}>Vendor Portal</div>
          </div>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>Sign in</h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px" }}>
          Enter your vendor portal password to continue.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
              Portal Password
            </label>
            <input
              type="password"
              placeholder="••••••••••••"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              required
              autoFocus
              style={{
                width: "100%", padding: "11px 14px", borderRadius: 9,
                border: "1.5px solid #e2e8f0", fontSize: 15, outline: "none",
                boxSizing: "border-box", background: "#f8fafc",
                transition: "border 0.15s",
              }}
            />
          </div>

          {error && (
            <div style={{
              background: "#fef2f2", border: "1px solid #fecaca",
              borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#b91c1c",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "12px 20px", background: "#0f172a", color: "#fff",
              border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1, marginTop: 4,
              transition: "opacity 0.15s",
            }}
          >
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>
      </div>
    </div>
  );
}
