/**
 * Landing v2 — the redesigned marketing page.
 *
 * Spine:
 *   1. Hero               ✅
 *   2. Signature moment   ✅
 *   3. Personas           ✅
 *   4. Capabilities       ✅
 *   5. Stack replacement  ✅
 *   6. Comparison         ✅
 *   7. Quotes             ✅
 *   8. Pricing            ✅
 *   9. FAQ                ✅
 *  10. Footer + CTA       ✅
 *
 * Server component — fetches `plans` and `currencyContext` so the
 * Pricing section can render in the visitor's local currency. The rest
 * of the components are client-side ("use client") for their motion +
 * scroll-trigger behaviour.
 */

import "./v2.css";
import V2Nav from "./components/V2Nav";
import V2Scroll from "./components/V2Scroll";
import Hero from "./components/Hero";
import SignatureMoment from "./components/SignatureMoment";
import Personas from "./components/Personas";
import Capabilities from "./components/Capabilities";
import StackReplacement from "./components/StackReplacement";
import Comparison from "./components/Comparison";
import Quotes from "./components/Quotes";
import Pricing from "./components/Pricing";
import Faq from "./components/Faq";
import Footer from "./components/Footer";
import { getActivePlans } from "@/lib/billing/getActivePlans";
import { getCurrencyContext } from "@/lib/currency/server";
import { getUsdToNgn } from "@/lib/billing/exchangeRate";

const SITE = "https://www.leadash.com";

export const metadata = {
  title: "Leadash — The work you want, sent your way",
  description:
    "Cold email that fills your calendar with the kind of clients you actually want to work with — without sounding like a pitch.",
  alternates: { canonical: SITE },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "Leadash",
    title: "Leadash — The work you want, sent your way",
    description:
      "Cold email that fills your calendar with the kind of clients you actually want to work with — without sounding like a pitch.",
    images: [
      {
        url: `${SITE}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "Leadash — The work you want, sent your way",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Leadash — The work you want, sent your way",
    description:
      "Cold email that fills your calendar with the kind of clients you actually want to work with.",
    images: [`${SITE}/opengraph-image`],
  },
};

// Structured data — Organization + WebSite. Helps search engines render
// the brand panel correctly and pick the right name/url for snippets.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Leadash",
      url: SITE,
      logo: `${SITE}/Logo_Icon_Colored.svg`,
      sameAs: [
        "https://twitter.com/leadash",
        "https://www.linkedin.com/company/leadash",
      ],
    },
    {
      "@type": "WebSite",
      name: "Leadash",
      url: SITE,
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE}/?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default async function LandingV2Page() {
  const [plans, currencyContext, ngnPerUsd] = await Promise.all([
    getActivePlans(),
    getCurrencyContext(),
    getUsdToNgn(),
  ]);

  return (
    <div className="v2 min-h-screen">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <V2Scroll />
      <V2Nav />
      <main>
        <Hero />
        <SignatureMoment />
        <Personas />
        <Capabilities />
        <StackReplacement />
        <Comparison />
        <Quotes />
        <Pricing plans={plans} currencyContext={currencyContext} ngnPerUsd={ngnPerUsd} />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
