import { Suspense } from "react";
import InvoiceDetailClient from "./InvoiceDetailClient";

export default function InvoiceDetailPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto px-6 py-8 space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-white/4 rounded-xl animate-pulse" />)}</div>}>
      <InvoiceDetailClient />
    </Suspense>
  );
}
