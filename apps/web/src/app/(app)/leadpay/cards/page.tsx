import { Suspense } from "react";
import CardsClient from "./CardsClient";

export default function CardsPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto px-6 py-8 space-y-4">{[1,2,3].map(i => <div key={i} className="h-36 bg-white/4 rounded-xl animate-pulse" />)}</div>}>
      <CardsClient />
    </Suspense>
  );
}
