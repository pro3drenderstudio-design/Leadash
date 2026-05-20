import { Suspense } from "react";
import PaymentPageClient from "./PaymentPageClient";

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-full max-w-lg mx-auto space-y-4 p-6">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />)}
        </div>
      </div>
    }>
      <PaymentPageClient token={token} />
    </Suspense>
  );
}
