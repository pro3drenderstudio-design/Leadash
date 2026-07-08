import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { default: "Leadash Academy", template: "%s | Leadash Academy" },
  description: "Step-by-step courses and challenges to help you land clients, earn in dollars, and build a sustainable career.",
};

export default function AcademyPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Nav */}
      <header style={{ borderBottom: "1px solid #e5e7eb", background: "#fff", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Logo_Icon_Colored.svg" alt="" style={{ width: 26, height: 26 }} />
            <span style={{ fontWeight: 800, fontSize: 16, color: "#111827", letterSpacing: "-0.03em" }}>Leadash</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.08em", background: "#fff7ed", padding: "2px 7px", borderRadius: 99, border: "1px solid #fed7aa" }}>Academy</span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/login" style={{ fontSize: 14, color: "#6b7280", textDecoration: "none", fontWeight: 500 }}>Log in</Link>
            <Link href="/academy/courses" style={{ fontSize: 14, color: "#fff", background: "#f97316", padding: "7px 16px", borderRadius: 8, fontWeight: 600, textDecoration: "none" }}>Browse Courses</Link>
          </div>
        </div>
      </header>

      {children}

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #e5e7eb", background: "#f9fafb", marginTop: 64 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>© 2025 Leadash. All rights reserved.</span>
          <div style={{ display: "flex", gap: 20 }}>
            <Link href="/privacy" style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>Privacy</Link>
            <Link href="/terms" style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>Terms</Link>
            <Link href="/f/challenge-7day/main" style={{ fontSize: 13, color: "#f97316", textDecoration: "none", fontWeight: 500 }}>7-Day Challenge</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
