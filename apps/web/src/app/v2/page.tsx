/**
 * Landing v2 — the redesigned marketing page lives entirely under /v2 while
 * we build it out. The original landing at / is untouched. Once approved,
 * we'll swap the root page to render this surface and retire /v2.
 *
 * Current spine being assembled:
 *   1. Hero  ✅
 *   2. Signature moment  (next)
 *   3. Who's it for
 *   4. Features + flow
 *   5. What it replaces
 *   6. Comparison
 *   7. Quotes
 *   8. Pricing
 *   9. FAQ
 *  10. Footer
 */

import "./v2.css";
import V2Nav from "./components/V2Nav";
import Hero from "./components/Hero";

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
        {/* Subsequent sections land here as they're built */}
      </main>
    </div>
  );
}
