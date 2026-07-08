"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Course {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_ngn: number;
  compare_price_ngn: number | null;
  thumbnail_url: string | null;
  product_type: string;
  credits_grant: number;
  certificate_enabled: boolean;
  total_lessons: number;
}

const GRADIENTS = [
  "linear-gradient(135deg,#7c3aed,#2563eb)",
  "linear-gradient(135deg,#ea580c,#dc2626)",
  "linear-gradient(135deg,#059669,#0284c7)",
  "linear-gradient(135deg,#d97706,#9333ea)",
];

const TYPE_LABELS: Record<string, string> = {
  challenge: "Challenge",
  course:    "Course",
  bundle:    "Bundle",
};

function fmt(n: number) {
  if (n === 0) return "Free";
  return `₦${n.toLocaleString("en-NG")}`;
}

function CourseCard({ c, i }: { c: Course; i: number }) {
  const isFree    = c.price_ngn === 0;
  const is7day    = c.slug === "challenge-7day";

  return (
    <Link href={`/courses/${c.slug}`} style={{ textDecoration: "none" }}>
      <div style={{
        background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #e5e7eb",
        transition: "box-shadow .2s, transform .2s", cursor: "pointer",
        boxShadow: "0 2px 8px rgba(0,0,0,.06)",
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 12px 32px rgba(0,0,0,.12)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,.06)"; (e.currentTarget as HTMLDivElement).style.transform = ""; }}
      >
        {/* Thumbnail */}
        <div style={{ height: 180, background: c.thumbnail_url ? `url(${c.thumbnail_url}) center/cover` : GRADIENTS[i % GRADIENTS.length], position: "relative" }}>
          {is7day && (
            <div style={{ position: "absolute", top: 12, left: 12, background: "#f97316", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              🔥 Most Popular
            </div>
          )}
          <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,.45)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>
            {TYPE_LABELS[c.product_type] ?? "Course"}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 20px 22px" }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 6px", lineHeight: 1.35 }}>{c.name}</h3>
          {c.description && (
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.55, margin: "0 0 14px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {c.description}
            </p>
          )}

          <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>
            {c.total_lessons > 0 && <span>📹 {c.total_lessons} lessons</span>}
            {c.certificate_enabled && <span>🎓 Certificate</span>}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              {c.compare_price_ngn && (
                <div style={{ fontSize: 12, color: "#9ca3af", textDecoration: "line-through" }}>{fmt(c.compare_price_ngn)}</div>
              )}
              <div style={{ fontSize: 20, fontWeight: 800, color: isFree ? "#16a34a" : "#111827" }}>{fmt(c.price_ngn)}</div>
            </div>
            <div style={{
              background: isFree ? "#dcfce7" : "#f97316",
              color: isFree ? "#16a34a" : "#fff",
              fontWeight: 700, fontSize: 13, padding: "8px 18px", borderRadius: 9,
            }}>
              {isFree ? "Enroll Free" : "Get Access →"}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/public/academy")
      .then(r => r.json())
      .then((d: { products?: Course[] }) => setCourses(d.products ?? []))
      .finally(() => setLoading(false));
  }, []);

  const featured = courses.find(c => c.slug === "challenge-7day");
  const rest      = courses.filter(c => c.slug !== "challenge-7day");

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#f9fafb", minHeight: "100vh", color: "#111827" }}>

      {/* Nav */}
      <nav style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <span style={{ width: 28, height: 28, background: "#f97316", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </span>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>Leadash Academy</span>
        </a>
        <div style={{ display: "flex", gap: 12 }}>
          <a href="/login" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none", padding: "6px 14px" }}>Log in</a>
          <a href="/challenge" style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: "#f97316", borderRadius: 8, padding: "6px 16px", textDecoration: "none" }}>
            Join the Challenge →
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ background: "#fff", padding: "64px 24px 56px", textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            Leadash Academy
          </p>
          <h1 style={{ fontSize: "clamp(28px,5vw,48px)", fontWeight: 800, lineHeight: 1.15, color: "#111827", marginBottom: 16, letterSpacing: "-0.02em" }}>
            Land Foreign Clients.<br />Build Your Income Machine.
          </h1>
          <p style={{ fontSize: 16, color: "#6b7280", lineHeight: 1.65, maxWidth: 520, margin: "0 auto 28px" }}>
            Hands-on courses and live challenges for Nigerian professionals ready to earn in dollars — without leaving home.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {[
              { value: "500+", label: "Students" },
              { value: "₦2M+", label: "Earned by alumni" },
              { value: "7",    label: "Days to first client" },
            ].map(s => (
              <div key={s.label} style={{ background: "#f3f4f6", borderRadius: 10, padding: "10px 18px", textAlign: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 18, color: "#111827" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured 7-day challenge */}
      {featured && !loading && (
        <section style={{ maxWidth: 900, margin: "48px auto 0", padding: "0 24px" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>⭐ Featured</p>
          <Link href={`/courses/${featured.slug}`} style={{ textDecoration: "none" }}>
            <div style={{ background: "linear-gradient(135deg,#fff7ed,#fff)", border: "2px solid #fed7aa", borderRadius: 20, padding: "32px 28px", display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: "inline-block", background: "#f97316", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                  🔥 Most Popular · {TYPE_LABELS[featured.product_type]}
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: "#111827", margin: "0 0 10px", lineHeight: 1.25 }}>{featured.name}</h2>
                <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>{featured.description}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#111827" }}>₦{featured.price_ngn.toLocaleString("en-NG")}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>one-time · lifetime community</div>
                  </div>
                  <div style={{ background: "#f97316", color: "#fff", fontWeight: 700, fontSize: 14, padding: "12px 24px", borderRadius: 11, boxShadow: "0 8px 20px -8px rgba(249,115,22,.5)" }}>
                    Join the Challenge →
                  </div>
                </div>
              </div>
              <div style={{ width: 160, height: 120, borderRadius: 14, background: "linear-gradient(135deg,#ea580c,#dc2626)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 48 }}>🚀</span>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* All courses */}
      <section style={{ maxWidth: 900, margin: "40px auto 64px", padding: "0 24px" }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 20 }}>
          {featured ? "All Courses & Challenges" : "Courses & Challenges"}
        </p>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#9ca3af", fontSize: 14 }}>Loading courses...</div>
        ) : rest.length === 0 && !featured ? (
          <div style={{ textAlign: "center", padding: 60, color: "#9ca3af", fontSize: 14 }}>No courses yet.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 20 }}>
            {(featured ? rest : courses).map((c, i) => (
              <CourseCard key={c.id} c={c} i={i} />
            ))}
          </div>
        )}
      </section>

      {/* Bottom CTA */}
      <section style={{ background: "#111827", padding: "56px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: "#fff", marginBottom: 10 }}>Ready to land your first client?</h2>
        <p style={{ color: "#9ca3af", fontSize: 15, marginBottom: 24 }}>Start the 7-Day Challenge. ₦10,000. Real results in one week.</p>
        <a href="/challenge" style={{ display: "inline-block", background: "#f97316", color: "#fff", fontWeight: 700, fontSize: 15, padding: "13px 32px", borderRadius: 11, textDecoration: "none" }}>
          Join the Challenge — ₦10,000 →
        </a>
      </section>

      {/* Footer */}
      <footer style={{ background: "#0f172a", padding: "24px", textAlign: "center" }}>
        <p style={{ color: "#475569", fontSize: 12 }}>
          © 2025 Leadash · <a href="/" style={{ color: "#64748b" }}>Home</a> ·{" "}
          <a href="/terms" style={{ color: "#64748b" }}>Terms</a> ·{" "}
          <a href="/privacy" style={{ color: "#64748b" }}>Privacy</a>
        </p>
      </footer>
    </div>
  );
}
