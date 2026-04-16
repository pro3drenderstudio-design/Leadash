import { createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";

async function getContactEmail(): Promise<string> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("admin_settings")
      .select("value")
      .eq("key", "support_email")
      .single();
    if (data?.value) return JSON.parse(data.value) as string;
  } catch { /* fall through */ }
  return "support@leadash.com";
}

function renderBody(text: string, contactEmail: string) {
  const resolved = text.replace(/\{contactEmail\}/g, contactEmail);
  const parts = resolved.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="text-white/70 font-semibold">{part}</strong>
      : <span key={i}>{part}</span>
  );
}

export default async function TermsPage() {
  const contactEmail = await getContactEmail();

  const SECTIONS = [
    {
      id: "acceptance",
      title: "1. Acceptance of terms",
      body: [
        "By accessing or using Leadash (the 'Service'), you agree to be bound by these Terms of Service ('Terms'). If you do not agree, you may not use the Service.",
        "We may update these Terms at any time. Continued use after changes constitutes acceptance. Material changes will be communicated by email at least 14 days in advance.",
      ],
    },
    {
      id: "description",
      title: "2. Description of service",
      body: [
        "Leadash is a cloud-based outreach and lead generation platform that provides email sequencing, inbox management, AI-powered personalisation, lead scraping, email verification, and CRM functionality.",
        "The Service is provided 'as is'. We reserve the right to modify, suspend, or discontinue any part of the Service at any time with reasonable notice.",
      ],
    },
    {
      id: "accounts",
      title: "3. Accounts and workspaces",
      body: [
        "You are responsible for maintaining the security of your account credentials. You must notify us immediately if you suspect unauthorised access.",
        "Each account may create one or more workspaces. Workspace data is isolated — team members only access workspaces they are explicitly invited to.",
        "You must be at least 18 years old and have the legal authority to enter into this agreement on behalf of yourself or your organisation.",
      ],
    },
    {
      id: "acceptable-use",
      title: "4. Acceptable use",
      body: [
        "You may use Leadash only for lawful purposes and in accordance with these Terms. You agree not to:",
        "**Send spam** — unsolicited bulk email to recipients who have not given verifiable consent, in violation of CAN-SPAM, CASL, GDPR, or applicable local law.",
        "**Harvest addresses illegally** — collect email addresses through scraping of sites that prohibit it, or from protected systems without authorisation.",
        "**Abuse infrastructure** — attempt to overload, disrupt, or circumvent rate limits on our systems or those of third-party email providers.",
        "**Misrepresent identity** — impersonate another person or organisation, or forge email headers.",
        "**Send prohibited content** — including malware, phishing content, illegal goods/services, financial scams, or content that violates third-party rights.",
        "Violation of this section may result in immediate account suspension without refund.",
      ],
    },
    {
      id: "email-compliance",
      title: "5. Email compliance obligations",
      body: [
        "You are solely responsible for ensuring your use of the email-sending features complies with all applicable laws, including but not limited to CAN-SPAM (US), CASL (Canada), GDPR (EU), and PECR (UK).",
        "You must: (a) honour unsubscribe requests promptly — Leadash processes these automatically but you must not re-add opted-out contacts; (b) not use deceptive subject lines or misleading 'From' headers.",
        "We monitor bounce rates, complaint rates, and sending patterns to protect shared infrastructure. Accounts with complaint rates above 0.3% or bounce rates above 5% may be suspended.",
      ],
    },
    {
      id: "billing",
      title: "6. Billing and payments",
      body: [
        "Subscription fees are billed monthly in advance. Credits are consumed on use and do not carry over between billing cycles, except for separately purchased top-up packs which never expire.",
        "All payments are processed by Stripe (USD) or Paystack (NGN). We do not store payment card data.",
        "Refunds are evaluated case-by-case and are not guaranteed. If we terminate your account for a breach of these Terms, no refund will be issued.",
        "Prices may change with 30 days' notice. Continued use after a price change takes effect constitutes acceptance.",
      ],
    },
    {
      id: "data",
      title: "7. Your data",
      body: [
        "You retain ownership of all data you upload to Leadash. By using the Service, you grant us a limited licence to process your data solely to deliver the Service.",
        "We will not sell, rent, or share your data with third parties for marketing purposes. See our Privacy Policy for full details.",
        "On account cancellation, your data is retained for 30 days then permanently deleted. You can export your data at any time from within the app.",
      ],
    },
    {
      id: "ip",
      title: "8. Intellectual property",
      body: [
        "The Leadash platform, including its design, code, algorithms, and content, is owned by Leadash and protected by intellectual property laws.",
        "You may not copy, modify, distribute, sell, or lease any part of the platform, nor reverse engineer or extract source code.",
        "Feedback you provide to us may be used to improve the Service without compensation or attribution.",
      ],
    },
    {
      id: "liability",
      title: "9. Limitation of liability",
      body: [
        "To the maximum extent permitted by law, Leadash shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities.",
        "Our total liability to you for any claims arising under these Terms shall not exceed the amount you paid to Leadash in the 3 months preceding the claim.",
        "Some jurisdictions do not allow limitation of liability for certain types of damages. In those jurisdictions, our liability is limited to the fullest extent permitted by law.",
      ],
    },
    {
      id: "termination",
      title: "10. Termination",
      body: [
        "You may cancel your account at any time from the billing settings page. Your access continues until the end of the current billing period.",
        "We may suspend or terminate your account immediately if you violate these Terms, particularly the acceptable use provisions. We will provide notice where legally required and practicable.",
        "Provisions that by their nature should survive termination (including intellectual property, limitation of liability, and dispute resolution) will survive.",
      ],
    },
    {
      id: "governing-law",
      title: "11. Governing law and disputes",
      body: [
        "These Terms are governed by the laws of the Federal Republic of Nigeria, without regard to conflict of law principles.",
        "Any dispute arising out of or related to these Terms shall first be attempted to be resolved through good-faith negotiation. If unresolved within 30 days, disputes shall be submitted to binding arbitration.",
        "Nothing in this section prevents either party from seeking injunctive relief to protect intellectual property rights.",
      ],
    },
    {
      id: "contact-legal",
      title: "12. Contact",
      body: [
        `Questions about these Terms? Contact us at {contactEmail} and we will respond within 2 business days.`,
        "Effective date: 16 April 2026. Last updated: 16 April 2026.",
      ],
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      {/* Header */}
      <div className="mb-14">
        <Link href="/" className="inline-flex items-center gap-1.5 text-white/30 hover:text-white/60 text-sm mb-8 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to home
        </Link>
        <p className="text-orange-400 text-xs font-bold uppercase tracking-widest mb-3">Legal</p>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4" style={{ letterSpacing: "-0.025em" }}>
          Terms of Service
        </h1>
        <p className="text-white/35 text-base">Effective date: 16 April 2026 · Last updated: 16 April 2026</p>
        <div className="mt-6 p-4 rounded-xl" style={{ background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.2)" }}>
          <p className="text-orange-300/70 text-sm leading-relaxed">
            Please read these Terms carefully before using Leadash. They govern your use of our platform and
            form a legally binding agreement between you and Leadash.
          </p>
        </div>
      </div>

      {/* Table of contents */}
      <nav className="mb-14 rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-4">Contents</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
          {SECTIONS.map(s => (
            <a key={s.id} href={`#${s.id}`} className="block text-white/40 hover:text-orange-400 text-sm transition-colors">
              {s.title}
            </a>
          ))}
        </div>
      </nav>

      {/* Sections */}
      <div className="space-y-14">
        {SECTIONS.map(s => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="text-xl font-bold text-white mb-5" style={{ letterSpacing: "-0.015em" }}>{s.title}</h2>
            <div className="space-y-3">
              {s.body.map((para, i) => (
                <p key={i} className="text-white/45 text-sm leading-relaxed">
                  {renderBody(para, contactEmail)}
                </p>
              ))}
            </div>
            <div className="mt-8 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />
          </section>
        ))}
      </div>
    </div>
  );
}
