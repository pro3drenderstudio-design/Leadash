"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VendorLoginPage() {
  const router   = useRouter();
  const [secret, setSecret] = useState("");
  const [error,  setError]  = useState("");
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
        setError(data.error ?? "Invalid credentials");
        return;
      }
      router.push("/vendor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "80px auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Vendor Login</h1>
      <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 24 }}>Enter your vendor portal password to continue.</p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input
          type="password"
          placeholder="Portal password"
          value={secret}
          onChange={e => setSecret(e.target.value)}
          required
          style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 15, outline: "none" }}
        />
        {error && <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{ padding: "11px 20px", background: "#111", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
