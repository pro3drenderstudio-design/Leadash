import { Suspense } from "react";
import LeadCampaignsClient from "./LeadCampaignsClient";

export default function LeadCampaignsPage() {
  return (
    <Suspense fallback={<div className="p-8 space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-white/4 rounded-xl animate-pulse" />)}</div>}>
      <LeadCampaignsClient />
    </Suspense>
  );
}
