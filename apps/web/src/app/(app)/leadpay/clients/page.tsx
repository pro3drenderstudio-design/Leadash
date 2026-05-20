import { Suspense } from "react";
import ClientsClient from "./ClientsClient";

export default function ClientsPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto px-6 py-8 space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 bg-white/4 rounded-xl animate-pulse" />)}</div>}>
      <ClientsClient />
    </Suspense>
  );
}
