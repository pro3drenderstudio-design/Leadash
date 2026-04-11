import Link from "next/link";

const FAQS = [
  {
    section: "Lead Campaigns",
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
        a: "Credits are deducted per lead as they're processed — not upfront. Scraping costs 1 credit/lead, verification 1 credit/lead, and AI personalization 2 credits/lead. You can buy more credits from the credits page.",
      },
      {
        q: "Can I export leads to a sequence?",
        a: "Yes. Click Export to Leads Pool from any campaign. Enable the 'Valid emails only' toggle (pre-checked) to avoid exporting unverified contacts. Once in your Leads Pool, go to Sequences → select your campaign → Enroll leads.",
      },
    ],
  },
  {
    section: "Sequences & Outreach",
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
    section: "Account & Billing",
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

export default function HelpPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-white mb-2">Help Center</h1>
        <p className="text-white/40">Answers to common questions about Leadash.</p>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-3 mb-10">
        {[
          { label: "Lead Campaigns", desc: "Scraping, verification & AI", href: "/lead-campaigns", icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" },
          { label: "Sequences", desc: "Email outreach & templates", href: "/campaigns", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
          { label: "Inboxes", desc: "Connect & manage senders", href: "/inboxes", icon: "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" },
        ].map(card => (
          <Link
            key={card.href}
            href={card.href}
            className="p-4 bg-white/3 border border-white/8 rounded-xl hover:border-white/15 hover:bg-white/5 transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center mb-3">
              <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
              </svg>
            </div>
            <p className="text-white text-sm font-medium group-hover:text-white/90">{card.label}</p>
            <p className="text-white/35 text-xs mt-0.5">{card.desc}</p>
          </Link>
        ))}
      </div>

      {/* FAQ sections */}
      {FAQS.map(section => (
        <div key={section.section} className="mb-8">
          <h2 className="text-white/50 text-xs font-bold uppercase tracking-widest mb-4">{section.section}</h2>
          <div className="space-y-3">
            {section.items.map(item => (
              <details
                key={item.q}
                className="group border border-white/8 rounded-xl overflow-hidden"
              >
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer bg-white/3 hover:bg-white/5 transition-colors list-none">
                  <span className="text-white text-sm font-medium pr-4">{item.q}</span>
                  <svg className="w-4 h-4 text-white/30 flex-shrink-0 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-5 py-4 text-white/50 text-sm leading-relaxed border-t border-white/5">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      ))}

      {/* Contact support */}
      <div className="mt-10 p-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl">
        <h3 className="text-white font-semibold mb-1">Still need help?</h3>
        <p className="text-white/40 text-sm mb-4">Can&apos;t find what you&apos;re looking for? Reach out and we&apos;ll get back to you within 24 hours.</p>
        <a
          href="mailto:support@leadash.io"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          Email Support
        </a>
      </div>
    </div>
  );
}
