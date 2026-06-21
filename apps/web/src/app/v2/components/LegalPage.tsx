/**
 * Shared v2-styled renderer for long-form legal pages (privacy, terms).
 *
 * Both pages have the same shape: an eyebrow, a title, an intro
 * paragraph, an effective date, a table of contents, and a stack of
 * numbered sections. Centralising the chrome here keeps the two
 * surfaces visually identical and makes future copy edits a one-file
 * job.
 *
 * Bold passages use the `**...**` syntax already in the source copy.
 * `{contactEmail}` is substituted with the email loaded by the server
 * component that wraps this.
 */

import React from "react";

export type LegalSection = {
  id: string;
  title: string;
  body: string[];
};

function renderBody(text: string, contactEmail: string) {
  const resolved = text.replace(/\{contactEmail\}/g, contactEmail);
  const parts = resolved.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} style={{ color: "var(--v2-text)", fontWeight: 500 }}>{part}</strong>
      : <span key={i}>{part}</span>
  );
}

export default function LegalPage({
  eyebrow,
  title,
  intro,
  effectiveDate,
  sections,
  contactEmail,
  tocColumns = 1,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  effectiveDate: string;
  sections: LegalSection[];
  contactEmail: string;
  tocColumns?: 1 | 2;
}) {
  return (
    <main>
      <section className="v2-dotgrid relative overflow-hidden">
        <div className="v2-container" style={{ paddingTop: 200, paddingBottom: 64, maxWidth: 880 }}>
          <p className="v2-eyebrow" style={{ marginBottom: 18 }}>{eyebrow}</p>
          <h1 className="v2-display" style={{ fontSize: "var(--v2-display-l)" }}>
            {title}<span style={{ color: "var(--v2-accent)" }}>.</span>
          </h1>
          <p style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 28, maxWidth: 660, lineHeight: 1.55 }}>
            {intro}
          </p>
          <p style={{ color: "var(--v2-text-quiet)", fontSize: "var(--v2-small)", marginTop: 24, letterSpacing: "0.04em" }}>
            {effectiveDate}
          </p>
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--v2-border)" }}>
        <div className="v2-container" style={{ paddingTop: 80, paddingBottom: 160, maxWidth: 880 }}>

          {/* ── Table of contents ─────────────────────────────────────────── */}
          <nav
            aria-label="On this page"
            style={{
              border: "1px solid var(--v2-border)",
              borderRadius: "var(--v2-radius-card)",
              padding: "24px 28px",
              marginBottom: 80,
              background: "var(--v2-bg-card)",
            }}
          >
            <p className="v2-eyebrow" style={{ marginBottom: 16, color: "var(--v2-text-quiet)" }}>Contents</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: tocColumns === 2 ? "1fr 1fr" : "1fr",
                rowGap: 8,
                columnGap: 32,
              }}
            >
              {sections.map(s => (
                <a key={s.id} href={`#${s.id}`} className="v2-legal-toc-link">
                  {s.title}
                </a>
              ))}
            </div>
          </nav>

          {/* ── Sections ──────────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 56 }}>
            {sections.map(s => (
              <section key={s.id} id={s.id} className="v2-legal-section">
                <h2 className="v2-legal-h2">{s.title}</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {s.body.map((para, i) => (
                    <p key={i} className="v2-legal-p">
                      {renderBody(para, contactEmail)}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <p style={{ marginTop: 80, color: "var(--v2-text-quiet)", fontSize: "var(--v2-small)" }}>
            Anything unclear? Email{" "}
            <a href={`mailto:${contactEmail}`} style={{ color: "var(--v2-accent)" }}>{contactEmail}</a>
            {" "}and a real human will reply.
          </p>

        </div>
      </section>
    </main>
  );
}
