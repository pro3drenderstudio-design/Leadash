"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/vendor",          label: "Dashboard" },
  { href: "/vendor/orders",   label: "Orders"    },
  { href: "/vendor/invoices", label: "Invoices"  },
];

export default function VendorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin  = pathname === "/vendor/login";

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* ── Top nav ─────────────────────────────────────────── */}
      {!isLogin && (
        <nav style={{
          background: "#0f172a",
          borderBottom: "1px solid #1e293b",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          height: 56,
          gap: 0,
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}>
          {/* Logo */}
          <Link href="/vendor" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", marginRight: 32 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ color: "#fff", fontWeight: 900, fontSize: 14, letterSpacing: "-1px" }}>L</span>
            </div>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: "-0.3px" }}>Leadash</span>
            <span style={{
              color: "#475569", fontSize: 12, fontWeight: 500,
              background: "#1e293b", padding: "2px 8px", borderRadius: 99, marginLeft: 2,
            }}>Vendor</span>
          </Link>

          {/* Nav links */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
            {NAV_LINKS.map(({ href, label }) => {
              const active = href === "/vendor"
                ? pathname === "/vendor"
                : pathname.startsWith(href);
              return (
                <Link key={href} href={href} style={{
                  color: active ? "#fff" : "#94a3b8",
                  background: active ? "#1e293b" : "transparent",
                  padding: "6px 14px",
                  borderRadius: 8,
                  fontWeight: active ? 600 : 400,
                  fontSize: 14,
                  textDecoration: "none",
                  transition: "all 0.15s",
                }}>
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Logout */}
          <a href="/api/vendor/logout" style={{
            color: "#64748b", fontSize: 13, textDecoration: "none",
            padding: "6px 12px", borderRadius: 8, border: "1px solid #1e293b",
            transition: "all 0.15s",
          }}>
            Logout
          </a>
        </nav>
      )}

      {/* ── Page content ────────────────────────────────────── */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: isLogin ? "0" : "32px 24px" }}>
        {children}
      </main>
    </div>
  );
}
