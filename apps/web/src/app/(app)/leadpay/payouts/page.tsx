import { Suspense } from "react";
import PayoutsClient from "./PayoutsClient";

export default function PayoutsPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto px-6 py-8 space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-white/4 rounded-xl animate-pulse" />)}</div>}>
      <PayoutsClient />
    </Suspense>
  );
}
