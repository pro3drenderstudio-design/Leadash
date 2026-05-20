import { Suspense } from "react";
import TransactionsClient from "./TransactionsClient";

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto px-6 py-8 space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-white/4 rounded-xl animate-pulse" />)}</div>}>
      <TransactionsClient />
    </Suspense>
  );
}
