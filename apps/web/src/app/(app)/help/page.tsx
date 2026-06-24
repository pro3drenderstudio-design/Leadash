/**
 * /help — restyled to v2-app.
 *
 * Three quick-link cards across the top, FAQ accordions grouped by topic,
 * and a closing "still need help?" card that points at /support. Same
 * content as before, modernised chrome.
 */

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  UserSearch01Icon,
  Mail01Icon,
  Inbox01Icon,
  ArrowDown01Icon,
  HeadsetIcon,
} from "@/v2-app/icons";
import "@/v2-app/v2-app.css";

const FAQS = [
  {
    section: "Lead campaigns",
    items: [
      {
        q: "What's the difference between Scrape, Full Suite, and Verify & Personalize?",
        a: "Scrape finds new leads from the web. Full Suite scrapes, then verifies emails and generates AI opening lines. Verify & Personalize lets you upload your own leads (or use a previous campaign) and runs verification + AI personalization on them.",
      },
      {
        q: "Why does my campaign show 0 verified leads?",
        a: "Verification runs as a background job every few minutes. If you just launched, give it 5–10 minutes and refresh. Make sure email verification is enabled in your campaign settings.",
      },
      {
        q: "What do the email verification statuses mean?",
        a: "Valid = confirmed deliverable. Catch-all = domain accepts all emails (may or may not exist). Invalid = will bounce. Unknown = couldn't determine. Disposable = temporary address.",
      },
      {
        q: "How do credits work?",
        a: "Credits are deducted per lead as they're processed — not upfront. Scraping costs 1 credit/lead, verification 1 credit/lead, and AI personalization 1 credit/lead. You can buy more credits from the credits page.",
      },
      {
        q: "Can I export leads to a sequence?",
        a: "Yes. Click Export to Leads Pool from any campaign. Enable the 'Valid emails only' toggle (pre-checked) to avoid exporting unverified contacts. Once in your Leads Pool, go to Sequences → select your campaign → Enroll leads.",
      },
    ],
  },
  {
    section: "Sequences & outreach",
    items: [
      {
        q: "How do I connect my email inbox?",
        a: "Go to Inboxes → Add Inbox. Choose Gmail or Outlook for OAuth one-click setup, or use Custom SMTP for any other provider. Make sure to add the correct App Password for Gmail (not your regular password).",
      },
      {
        q: "Why are my emails not being sent?",
        a: "Check that: (1) your inbox is active and not showing an error, (2) the sequence has enrolled leads, (3) your send window includes the current time, and (4) your daily send limit hasn't been reached.",
      },
      {
        q: "What is email warmup?",
        a: "Warmup gradually builds your sending reputation by exchanging real emails with other inboxes in the warmup pool. Enable it on any inbox under Inboxes → Edit. It runs automatically every morning.",
      },
      {
        q: "How do I use AI personalization in sequences?",
        a: "When creating a lead campaign with AI personalization enabled, each lead gets a generated opening line stored in their record. When you export to a Leads Pool, the personalized line is saved in custom_fields. Use the {{personalized_line}} variable in your sequence templates.",
      },
    ],
  },
  {
    section: "Account & billing",
    items: [
      {
        q: "How do I upgrade my plan?",
        a: "Go to Settings → Billing to view and change your plan. Plans are billed monthly and you can upgrade or downgrade at any time.",
      },
      {
        q: "What happens if I run out of credits?",
        a: "Processing stops for the current campaign. Leads already inserted are kept. You can buy more credits and the campaign will resume on the next cron tick.",
      },
      {
        q: "Can I invite team members?",
        a: "Yes. Go to Settings → Team to invite members by email. They'll get access to the same workspace and campaigns.",
      },
    ],
  },
];

const QUICK_LINKS = [
  { label: "Lead campaigns", desc: "Scraping, verification & AI",   href: "/lead-campaigns", icon: UserSearch01Icon },
  { label: "Sequences",      desc: "Email outreach & templates",    href: "/campaigns",      icon: Mail01Icon },
  { label: "Inboxes",        desc: "Connect & manage senders",      href: "/inboxes",        icon: Inbox01Icon },
];

export default function HelpPage() {
  return (
    <div className="v2-app" style={{ minHeight: "100%", background: "var(--app-bg)" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "32px 32px 48px" }}>

        {/* Header */}
        <header style={{ marginBottom: 40 }}>
          <h1 className="app-h1">Help center</h1>
          <p style={{ color: "var(--app-text-muted)", fontSize: 14, marginTop: 6 }}>
            Answers to common questions about Leadash.
          </p>
        </header>

        {/* Quick links */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 40 }} className="help-quick">
          {QUICK_LINKS.map(card => (
            <Link
              key={card.href}
              href={card.href}
              className="app-card app-card-tight app-card-interactive"
              style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div
                style={{
                  width: 32, height: 32, borderRadius: 6,
                  background: "var(--app-accent-soft)",
                  border: "1px solid var(--app-accent-line)",
                  color: "var(--app-accent)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <HugeiconsIcon icon={card.icon} size={16} strokeWidth={1.5} />
              </div>
              <div>
                <p style={{ color: "var(--app-text)", fontSize: 13, fontWeight: 500 }}>{card.label}</p>
                <p style={{ color: "var(--app-text-quiet)", fontSize: 11, marginTop: 2 }}>{card.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* FAQ sections */}
        {FAQS.map(section => (
          <section key={section.section} style={{ marginBottom: 32 }}>
            <h2 className="app-eyebrow" style={{ marginBottom: 14 }}>{section.section}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {section.items.map(item => (
                <details
                  key={item.q}
                  className="help-faq"
                  style={{
                    border: "1px solid var(--app-border)",
                    borderRadius: "var(--app-radius)",
                    overflow: "hidden",
                    background: "var(--app-bg-elevated)",
                  }}
                >
                  <summary
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      cursor: "pointer",
                      listStyle: "none",
                      gap: 12,
                    }}
                  >
                    <span style={{ color: "var(--app-text)", fontSize: 13, fontWeight: 500 }}>{item.q}</span>
                    <span className="help-chev" style={{ color: "var(--app-text-quiet)", transition: "transform 200ms var(--app-ease)", flexShrink: 0 }}>
                      <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={2} />
                    </span>
                  </summary>
                  <div style={{ padding: "12px 16px 16px", color: "var(--app-text-muted)", fontSize: 13, lineHeight: 1.55, borderTop: "1px solid var(--app-border)" }}>
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}

        {/* Contact support */}
        <div
          className="app-card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            border: "1px solid var(--app-accent-line)",
            background: "var(--app-accent-soft)",
            padding: 20,
            marginTop: 32,
          }}
        >
          <div
            style={{
              width: 36, height: 36, borderRadius: 8,
              background: "rgba(249, 115, 22, 0.18)",
              color: "var(--app-accent)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <HugeiconsIcon icon={HeadsetIcon} size={18} strokeWidth={1.6} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: "var(--app-text)", fontSize: 14, fontWeight: 500 }}>Still need help?</p>
            <p style={{ color: "var(--app-text-muted)", fontSize: 12, marginTop: 2 }}>
              Can&apos;t find what you&apos;re looking for? Reach out and we&apos;ll get back to you within 24 hours.
            </p>
          </div>
          <Link href="/support" className="app-btn app-btn-primary">
            <HugeiconsIcon icon={HeadsetIcon} size={14} strokeWidth={1.7} />
            Open support
          </Link>
        </div>
      </div>

      <style>{`
        .help-faq[open] .help-chev { transform: rotate(180deg); }
        @media (max-width: 700px) {
          .help-quick { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
