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

export const metadata = {
  title: "Leadash — The work you want, sent your way",
  description:
    "Cold email that fills your calendar with the kind of clients you actually want to work with — without sounding like a pitch.",
};

export default async function LandingV2Page() {
  const [plans, currencyContext] = await Promise.all([
    getActivePlans(),
    getCurrencyContext(),
  ]);

  return (
    <div className="v2 min-h-screen">
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
        <Pricing plans={plans} currencyContext={currencyContext} />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
