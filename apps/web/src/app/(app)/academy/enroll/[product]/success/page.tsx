"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { wsPost } from "@/lib/workspace/client";
import { Suspense } from "react";

function SuccessInner() {
  const { product } = useParams<{ product: string }>();
  const router      = useRouter();
  const params      = useSearchParams();
  const reference   = params.get("reference") ?? params.get("trxref") ?? "";

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!reference) { setStatus("error"); setMessage("No payment reference found."); return; }
    wsPost<{ status: string; enrollment_id?: string }>("/api/academy/enroll/verify", { reference })
      .then(res => {
        if (res.status === "enrolled" || res.status === "already_enrolled") {
          setStatus("success");
        } else {
          setStatus("error");
          setMessage("Payment not confirmed. Please contact support.");
        }
      })
      .catch(e => {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Verification failed.");
      });
  }, [reference]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === "verifying") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <svg className="w-10 h-10 text-orange-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <p className="text-white/50 text-sm">Confirming your payment…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center max-w-sm mx-auto">
        <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
          <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div>
          <p className="text-white font-semibold">Payment issue</p>
          <p className="text-white/40 text-sm mt-1">{message}</p>
        </div>
        <button onClick={() => router.push(`/academy/enroll/${product}`)} className="px-5 py-2.5 bg-white/8 hover:bg-white/12 text-white text-sm font-semibold rounded-xl transition-colors">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center max-w-sm mx-auto">
      <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
        <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
      <div>
        <p className="text-emerald-300 font-bold text-xl">You&apos;re in!</p>
        <p className="text-white/50 text-sm mt-2 leading-relaxed">
          Your payment was confirmed. Credits have been added to your account. Day 1 is ready — let&apos;s go.
        </p>
      </div>
      <button
        onClick={() => router.push(`/academy/${product}`)}
        className="px-8 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl transition-colors"
      >
        Start Day 1
      </button>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessInner />
    </Suspense>
  );
}
