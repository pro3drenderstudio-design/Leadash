import { Suspense } from "react";
import LeadCampaignsClient from "./LeadCampaignsClient";
import LeadCampaignsDeprecationBanner from "@/components/LeadCampaignsDeprecationBanner";

export default function LeadCampaignsPage() {
  return (
    <>
      {/* Only the Lead Campaigns section is being deprecated — Verify Email and
          AI Enrichment under /lead-campaigns/{verify,enrich} are unaffected, so
          the banner is mounted per-page rather than via a parent layout. */}
      <LeadCampaignsDeprecationBanner />
      <Suspense fallback={<div className="p-8 space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-white/4 rounded-xl animate-pulse" />)}</div>}>
        <LeadCampaignsClient />
      </Suspense>
    </>
  );
}
