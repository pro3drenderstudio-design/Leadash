"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function PendingContent() {
  const params = useSearchParams();
  const email  = params.get("email") ?? "";
  const WA_MANAGER = "2349110260332";

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "48px 40px", maxWidth: 480, width: "100%", textAlign: "center", border: "1px solid #e5e7eb", boxShadow: "0 20px 60px -20px rgba(0,0,0,.08)" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
          <span style={{ fontSize: 30 }}>⏳</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Almost there!</h1>
        <p style={{ color: "#6b7280", fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
          We received your registration. Our community manager will confirm your payment and add you to the WhatsApp group within <strong style={{ color: "#111827" }}>2 hours during business hours</strong>.
        </p>
        {email && (
          <div style={{ background: "#f3f4f6", borderRadius: 8, padding: "10px 16px", marginBottom: 24 }}>
            <p style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>Account created for</p>
            <p style={{ color: "#111827", fontWeight: 600, fontSize: 14, margin: "2px 0 0" }}>{email}</p>
          </div>
        )}
        <a
          href={`https://wa.me/${WA_MANAGER}?text=${encodeURIComponent("Hi! I just registered for the 7-Day Challenge. Please confirm my payment.")}`}
          target="_blank"
          rel="noreferrer"
          style={{ display: "block", background: "#25d366", color: "#fff", fontWeight: 700, fontSize: 15, padding: "14px", borderRadius: 10, textDecoration: "none", marginBottom: 12 }}
        >
          💬 Message Us on WhatsApp
        </a>
        <p style={{ color: "#9ca3af", fontSize: 12 }}>
          Already confirmed?{" "}
          <a href="/login" style={{ color: "#f97316", textDecoration: "none" }}>Log in to Leadash →</a>
        </p>
      </div>
    </div>
  );
}

export default function ChallengePendingPage() {
  return (
    <Suspense>
      <PendingContent />
    </Suspense>
  );
}
