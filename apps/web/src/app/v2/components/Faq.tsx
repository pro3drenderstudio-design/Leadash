"use client";

/**
 * Section 09 — FAQ.
 *
 * Native <details>/<summary> accordion — keyboard-accessible by default,
 * no JS state needed. CSS handles the chevron rotation on [open] and
 * an underflow grid trick gives the answer a smooth expand animation
 * without committing to a full motion-library accordion.
 *
 * Eight items pulled from the legacy FAQ, retitled where helpful so they
 * answer questions a freelancer would actually ask (less corporate, more
 * "how does this affect my day").
 */

type Item = { q: string; a: string };

const ITEMS: Item[] = [
  {
    q: "Will my emails go to spam?",
    a: "Not if we can help it. Every inbox you connect goes through a peer-to-peer warmup pool that ramps sending volume and reputation over 3–5 weeks before your first campaign. Open rates, replies, and frequency are all increased gradually — the way Gmail and Outlook expect a real human inbox to behave.",
  },
  {
    q: "Can I use my own Gmail or Outlook?",
    a: "Yes — that's the recommended setup. Connect Gmail via one-click OAuth, or Outlook via OAuth for Microsoft 365. Custom SMTP/IMAP (Zoho, Fastmail, your own domain) also works. Sending always happens from your inbox, not a shared pool, so the lead sees your real address.",
  },
  {
    q: "What do credits actually pay for?",
    a: "Three things, all on the data + AI side: scraping a new lead (1 credit), verifying an email address (0.5), and generating an AI personalization line (0.5). Sending the actual emails never costs credits — you can run as much volume as your inboxes will sustain.",
  },
  {
    q: "Do unused credits roll over?",
    a: "Monthly plan credits reset each billing cycle. Top-up credits you buy separately never expire — and they're consumed first, before your monthly allocation, so you always get full value out of what you pay for.",
  },
  {
    q: "What happens if I run out mid-month?",
    a: "Data jobs (scraping, verification, AI lines) pause. Campaigns already in motion continue sending normally — your outreach is never interrupted. Top up, and data jobs resume the same minute.",
  },
  {
    q: "Is this compliant with CAN-SPAM and GDPR?",
    a: "Yes. Every sequence ships with a one-click unsubscribe link. Unsubscribes are honoured instantly across every campaign you run. Leads live in your private workspace — never sold, never shared. Export or delete any time, with no manual ticket.",
  },
  {
    q: "How does billing work for non-US customers?",
    a: "Pricing is displayed in your local currency where we can support it; billing runs through Paystack (card, bank transfer, USSD) for NGN, and Stripe for USD and other major currencies. You can switch between the two at checkout if that matches your books better.",
  },
  {
    q: "Can I cancel or change plans whenever?",
    a: "Yes. Upgrades take effect immediately; downgrades and cancellations apply at the next billing cycle. After cancelling you keep access through the rest of your paid period, and your data stays recoverable for 30 days before it's deleted.",
  },
];

export default function Faq() {
  return (
    <section className="relative" style={{ background: "var(--v2-bg)", borderTop: "1px solid var(--v2-border)" }}>
      <div className="v2-container" style={{ paddingTop: 160, paddingBottom: 160, maxWidth: 880 }}>

        <div style={{ marginBottom: 64 }}>
          <p className="v2-eyebrow" style={{ marginBottom: 18 }}>09 — Questions</p>
          <h2 className="v2-display" style={{ fontSize: "var(--v2-display-m)" }}>
            The honest answers<span style={{ color: "var(--v2-accent)" }}>.</span>
          </h2>
          <p style={{ color: "var(--v2-text-muted)", fontSize: "var(--v2-body-l)", marginTop: 20, maxWidth: 540, lineHeight: 1.55 }}>
            Anything else — drop a line at <a href="/contact" style={{ color: "var(--v2-accent)" }}>contact@leadash.com</a>. Real humans, usually within a few hours.
          </p>
        </div>

        <div className="v2-faq-list">
          {ITEMS.map((item, i) => (
            <details key={i} className="v2-faq-item">
              <summary className="v2-faq-summary">
                <span className="v2-faq-q">{item.q}</span>
                <span className="v2-faq-chev" aria-hidden>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </summary>
              <div className="v2-faq-body">
                <p>{item.a}</p>
              </div>
            </details>
          ))}
        </div>

      </div>
    </section>
  );
}
