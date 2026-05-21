import type { ReactNode } from "react";

export const metadata = { title: "Vendor Portal — Leadash" };

export default function VendorLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f9fafb", minHeight: "100vh" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
            <span style={{ fontWeight: 800, fontSize: 20, color: "#111" }}>Leadash</span>
            <span style={{ color: "#9ca3af", fontSize: 13 }}>Vendor Portal</span>
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
