"use client";

import { useEffect, useState, type ReactNode } from "react";
import { wsGet } from "@/lib/workspace/client";

export default function LeadPayLayout({ children }: { children: ReactNode }) {
  const [suspended, setSuspended] = useState(false);

  useEffect(() => {
    wsGet<{ account: { status: string } | null }>("/api/leadpay/account")
      .then(d => { if (d.account?.status === "suspended") setSuspended(true); })
      .catch(() => {});
  }, []);

  if (suspended) {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-white">Account Suspended</h2>
          <p className="text-white/50 text-sm leading-relaxed">
            Your Leadash Pay account has been suspended. You cannot send invoices,
            receive payments, or request payouts at this time.
          </p>
        </div>
        <div className="bg-white/4 border border-white/8 rounded-2xl p-5 text-left space-y-2">
          <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">What to do</p>
          <p className="text-sm text-white/50">
            Contact support at{" "}
            <a href="mailto:support@leadash.com" className="text-orange-400 underline underline-offset-2 hover:no-underline">
              support@leadash.com
            </a>{" "}
            to resolve this.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
