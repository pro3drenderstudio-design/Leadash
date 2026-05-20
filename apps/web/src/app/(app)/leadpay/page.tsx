import { Suspense } from "react";
import LeadPayDashboardClient from "./LeadPayDashboardClient";

export default function LeadPayPage() {
  return (
    <Suspense fallback={
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-28 bg-white/4 rounded-xl animate-pulse" />)}
      </div>
    }>
      <LeadPayDashboardClient />
    </Suspense>
  );
}
