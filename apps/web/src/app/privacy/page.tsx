/**
 * /privacy — restyled to v2.
 *
 * Same content the old page rendered, now wrapped in v2 chrome
 * (V2Scroll + V2Nav + Footer) and rendered through the shared
 * LegalPage component for consistent treatment with /terms.
 */

import "../v2/v2.css";
import V2Nav from "../v2/components/V2Nav";
import V2Scroll from "../v2/components/V2Scroll";
import Footer from "../v2/components/Footer";
import LegalPage, { type LegalSection } from "../v2/components/LegalPage";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Privacy Policy — Leadash",
  description: "How Leadash handles your personal data and what rights you have over it.",
};

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

const SECTIONS: LegalSection[] = [
  {
    id: "information-we-collect",
    title: "1. Information we collect",
    body: [
      "**Account data** — When you register, we collect your name, email address, and payment information. Payment data is processed by Stripe or Paystack and we do not store full card numbers.",
      "**Usage data** — We collect information about how you use Leadash, including pages visited, features used, and actions taken. This helps us improve the product.",
      "**Lead data** — Contacts you upload, scrape, or import into your workspace are stored in your private workspace. We do not access, sell, or share your lead data with third parties.",
      "**Communication data** — Email subjects, bodies, and metadata for sequences you create are stored and processed on your behalf to deliver the service.",
      "**Device and log data** — We automatically collect IP addresses, browser type, operating system, and referral URLs when you use the platform.",
    ],
  },
  {
    id: "how-we-use-it",
    title: "2. How we use your information",
    body: [
      "To deliver, maintain, and improve the Leadash platform.",
      "To process payments and manage your subscription.",
      "To send transactional emails such as account confirmations, receipts, and security alerts.",
      "To monitor for abuse, fraud, and violations of our Terms of Service.",
      "To analyse aggregate usage patterns for product development. No personally identifiable data is used in these analyses.",
    ],
  },
  {
    id: "data-sharing",
    title: "3. Data sharing and third parties",
    body: [
      "We do not sell your personal data. We share data only in these circumstances:",
      "**Service providers** — We use third-party services including Supabase (database hosting), Stripe and Paystack (payments), and Vercel (infrastructure). Each operates under their own privacy policy.",
      "**Legal obligations** — We may disclose data when required by law, court order, or to protect the rights and safety of Leadash and its users.",
      "**Business transfers** — In the event of a merger, acquisition, or sale of assets, data may be transferred as part of that transaction. We will notify users before their data is transferred.",
    ],
  },
  {
    id: "data-retention",
    title: "4. Data retention",
    body: [
      "We retain your data for as long as your account is active or as needed to provide services. If you cancel your account, your workspace data is retained for 30 days before permanent deletion, giving you time to export.",
      "You can request deletion of your account and all associated data at any time by contacting {contactEmail}. Deletion is processed within 30 days.",
    ],
  },
  {
    id: "gdpr",
    title: "5. GDPR — Rights for EU/EEA users",
    body: [
      "If you are located in the European Economic Area, you have the following rights under GDPR:",
      "**Right of access** — Request a copy of the personal data we hold about you.",
      "**Right to rectification** — Correct inaccurate or incomplete data.",
      "**Right to erasure** — Request deletion of your personal data ('right to be forgotten').",
      "**Right to data portability** — Receive your data in a structured, machine-readable format.",
      "**Right to restrict processing** — Limit how we use your data in certain circumstances.",
      "**Right to object** — Object to data processing based on legitimate interests.",
      "To exercise any of these rights, email {contactEmail}. We will respond within 30 days.",
    ],
  },
  {
    id: "cookies",
    title: "6. Cookies",
    body: [
      "We use essential cookies required for authentication and security (session tokens). We do not use third-party advertising cookies.",
      "Analytics cookies (if enabled) collect anonymous usage data to help us improve the product. You can opt out at any time via your browser settings.",
    ],
  },
  {
    id: "security",
    title: "7. Security",
    body: [
      "We apply industry-standard security practices: TLS encryption in transit, AES-256 encryption at rest for sensitive credentials, regular security audits, and role-based access controls.",
      "Despite these measures, no system is perfectly secure. If you discover a security vulnerability, please report it responsibly to {contactEmail}.",
    ],
  },
  {
    id: "changes",
    title: "8. Changes to this policy",
    body: [
      "We may update this Privacy Policy from time to time. We will notify registered users by email at least 14 days before material changes take effect. Continued use of the platform after that date constitutes acceptance of the updated policy.",
      "This policy was last updated on 16 April 2026.",
    ],
  },
  {
    id: "contact",
    title: "9. Contact",
    body: [
      "Questions about this policy? Reach our team at {contactEmail} and we will respond within 2 business days.",
    ],
  },
];

export default async function PrivacyPage() {
  const contactEmail = await getContactEmail();
  return (
    <div className="v2 min-h-screen">
      <V2Scroll />
      <V2Nav />
      <LegalPage
        eyebrow="Legal — Privacy"
        title="Privacy Policy"
        intro="How we collect, use, and protect the data you trust to Leadash. No dark patterns, no fine-print surprises — what's on this page is what we actually do."
        effectiveDate="Effective 16 April 2026 · Last updated 16 April 2026"
        sections={SECTIONS}
        contactEmail={contactEmail}
      />
      <Footer />
    </div>
  );
}
