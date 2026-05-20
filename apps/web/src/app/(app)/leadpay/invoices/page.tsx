import { Suspense } from "react";
import InvoicesClient from "./InvoicesClient";

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto px-6 py-8 space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-14 bg-white/4 rounded-xl animate-pulse" />)}</div>}>
      <InvoicesClient />
    </Suspense>
  );
}
