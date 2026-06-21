/**
 * Landing v2 — the redesigned marketing page lives entirely under /v2 while
 * we build it out. The original landing at / is untouched. Once approved,
 * we'll swap the root page to render this surface and retire /v2.
 *
 * Current spine being assembled:
 *   1. Hero               ✅
 *   2. Signature moment   ✅
 *   3. Personas           ✅
 *   4. Capabilities       ✅
 *   5. Stack replacement  ✅
 *   6. Comparison         ✅
 *   7. Quotes             (next)
 *   8. Pricing
 *   9. FAQ
 *  10. Footer
 */

import "./v2.css";
import V2Nav from "./components/V2Nav";
import Hero from "./components/Hero";
import SignatureMoment from "./components/SignatureMoment";
import Personas from "./components/Personas";
import Capabilities from "./components/Capabilities";
import StackReplacement from "./components/StackReplacement";
import Comparison from "./components/Comparison";

export const metadata = {
  title: "Leadash — The work you want, sent your way",
  description: "Cold email that fills your calendar with the kind of clients you actually want to work with — without sounding like a pitch.",
};

export default function LandingV2Page() {
  return (
    <div className="v2 min-h-screen">
      <V2Nav />
      <main>
        <Hero />
        <SignatureMoment />
        <Personas />
        <Capabilities />
        <StackReplacement />
        <Comparison />
        {/* Sections 07–10 land here in the next push */}
      </main>
    </div>
  );
}
