"use client";

/**
 * Persistent banner shown across every page under /lead-campaigns/**.
 *
 * Lead Campaigns is being retired on 2026-06-30. Users still need to be able
 * to read existing campaigns and download their leads, but every entry point
 * should make the deprecation timeline impossible to miss.
 */

import { useEffect, useState } from "react";

export const LEAD_CAMPAIGNS_CUTOFF_ISO = "2026-06-30";

function daysUntil(targetIso: string): number {
  const today = new Date();
  const target = new Date(targetIso + "T23:59:59Z");
  return Math.max(0, Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
}

export default function LeadCampaignsDeprecationBanner() {
  const [days, setDays] = useState<number | null>(null);

  // Compute on the client to avoid SSR hydration mismatches near midnight.
  useEffect(() => { setDays(daysUntil(LEAD_CAMPAIGNS_CUTOFF_ISO)); }, []);

  const cutoffLabel = new Date(LEAD_CAMPAIGNS_CUTOFF_ISO + "T00:00:00").toLocaleDateString(undefined, {
    month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div className="border-b border-amber-500/25 bg-amber-500/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-start sm:items-center gap-3">
        <svg
          className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5 sm:mt-0"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div className="flex-1 text-sm">
          <p className="text-amber-200 font-semibold">
            Lead Campaigns is being deprecated on {cutoffLabel}
            {days !== null && days > 0 && <span className="text-amber-200/70 font-normal"> · {days} day{days === 1 ? "" : "s"} left</span>}
          </p>
          <p className="text-amber-200/70 text-xs mt-0.5 leading-relaxed">
            Download your leads as a CSV and re-upload them to <span className="font-semibold">Leads Pool</span> to continue using them in your sequences. After the cutoff, this section will be removed.
          </p>
        </div>
      </div>
    </div>
  );
}
