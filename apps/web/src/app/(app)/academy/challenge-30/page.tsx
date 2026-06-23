"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";

interface FunnelState {
  challenge_enrolled_at:   string | null;
  day1_completed_at:       string | null;
  bundle_offer_expires_at: string | null;
  upsell_purchased_at:     string | null;
}

interface Lesson {
  id:                string;
  title:             string;
  position:          number;
  drip_value:        number;
  is_free_preview:   boolean;
  is_published:      boolean;
  duration_secs:     number | null;
  video_asset_id?:   string | null;
  completion_status?: "completed" | null;
}

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState({ days: 0, hours: 0, mins: 0, secs: 0, expired: false });

  useEffect(() => {
    if (!expiresAt) return;
    function tick() {
      const diff = new Date(expiresAt!).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining({ days: 0, hours: 0, mins: 0, secs: 0, expired: true });
        return;
      }
      const days  = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
      const mins  = Math.floor((diff % 3_600_000)  / 60_000);
      const secs  = Math.floor((diff % 60_000)     / 1_000);
      setRemaining({ days, hours, mins, secs, expired: false });
    }
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

function ChallengeDashboardInner() {
  const params = useSearchParams();

  const [loading,     setLoading]     = useState(true);
  const [enrolled,    setEnrolled]    = useState(false);
  const [funnelState, setFunnelState] = useState<FunnelState | null>(null);
  const [lessons,     setLessons]     = useState<Lesson[]>([]);
  const [bundleLoading, setBundleLoad] = useState(false);
  const [bundleError,   setBundleErr]  = useState("");

  const countdown = useCountdown(funnelState?.bundle_offer_expires_at ?? null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/join"; return; }

    // Check enrollment
    const { data: enroll } = await supabase
      .from("academy_enrollments")
      .select("id")
      .eq("user_id", user.id)
      .eq("product_id", "challenge-30")
      .eq("status", "active")
      .maybeSingle();

    setEnrolled(!!enroll);

    if (enroll) {
      // Load funnel state
      const { data: fs } = await supabase
        .from("funnel_states")
        .select("challenge_enrolled_at, day1_completed_at, bundle_offer_expires_at, upsell_purchased_at")
        .eq("user_id", user.id)
        .maybeSingle();
      setFunnelState(fs ?? null);

      // Load lessons (already-dripped ones)
      const { data: lessonData } = await supabase
        .from("academy_lessons")
        .select("id, title, position, drip_value, is_free_preview, is_published, duration_secs, video_asset_id")
        .eq("product_id", "challenge-30")
        .eq("is_published", true)
        .order("position");

      setLessons(lessonData ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Handle Paystack callback success
  useEffect(() => {
    const paymentStatus = params.get("payment");
    const bundleStatus  = params.get("bundle");
    if (paymentStatus === "success" || bundleStatus === "success") {
      // Reload to reflect enrollment/bundle status
      const timer = setTimeout(() => load(), 2000);
      return () => clearTimeout(timer);
    }
  }, [params, load]);

  async function handleBundleCheckout() {
    setBundleLoad(true);
    setBundleErr("");
    try {
      const res = await fetch("/api/funnel/checkout-bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const d = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Payment initialization failed.");
      if (d.url) window.location.href = d.url;
    } catch (err: unknown) {
      setBundleErr(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBundleLoad(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0c0f] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not enrolled — show paywall
  if (!enrolled) {
    return (
      <div className="min-h-screen bg-[#0c0c0f] text-white flex flex-col items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-bold mb-3">30-Day Outreach Challenge</h1>
          <p className="text-gray-400 mb-8">
            Enroll for ₦10,000 to unlock 30 daily lessons and build your complete outreach system with Mizark.
          </p>
          <a
            href="/api/funnel/checkout-challenge"
            onClick={async e => {
              e.preventDefault();
              const res = await fetch("/api/funnel/checkout-challenge", { method: "POST" });
              const d = await res.json() as { url?: string; error?: string };
              if (d.url) window.location.href = d.url;
              else alert(d.error ?? "Error. Please try again.");
            }}
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-4 rounded-xl text-sm transition-colors"
          >
            Enroll for ₦10,000 →
          </a>
          <p className="text-gray-600 text-xs mt-4">One-time payment. Day 1 unlocks immediately.</p>
        </div>
      </div>
    );
  }

  const day1Unlocked  = true; // Always unlocked for enrolled users
  const day1Complete  = !!funnelState?.day1_completed_at;
  const bundlePurchased = !!funnelState?.upsell_purchased_at;
  const showBundleOffer = day1Complete && !bundlePurchased;
  const enrolledAt    = funnelState?.challenge_enrolled_at
    ? new Date(funnelState.challenge_enrolled_at)
    : new Date();

  // Determine which lessons are available based on drip schedule
  const daysSinceEnrollment = Math.floor(
    (Date.now() - enrolledAt.getTime()) / 86_400_000,
  );
  const availableLessons = lessons.filter(l => l.drip_value <= daysSinceEnrollment);

  return (
    <div className="min-h-screen bg-[#0c0c0f] text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <Link href="/academy" className="text-sm text-white/40 hover:text-white/60 mb-6 inline-block">
          ← Academy
        </Link>

        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
                Leadash × Learn By Mizark
              </span>
            </div>
            <h1 className="text-2xl font-bold">30-Day Outreach Challenge</h1>
          </div>

          {/* 30-day countdown timer */}
          {funnelState?.bundle_offer_expires_at && !bundlePurchased && !countdown.expired && (
            <div className="flex-shrink-0 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center">
              <p className="text-gray-500 text-xs mb-1.5">Challenge ends in</p>
              <div className="flex items-center gap-1.5 text-white font-mono text-sm font-bold">
                <span>{String(countdown.days).padStart(2, "0")}d</span>
                <span className="text-gray-600">:</span>
                <span>{String(countdown.hours).padStart(2, "0")}h</span>
                <span className="text-gray-600">:</span>
                <span>{String(countdown.mins).padStart(2, "0")}m</span>
                <span className="text-gray-600">:</span>
                <span>{String(countdown.secs).padStart(2, "0")}s</span>
              </div>
            </div>
          )}

          {bundlePurchased && (
            <div className="flex-shrink-0 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-center">
              <p className="text-emerald-400 text-xs font-semibold">Annual Bundle Active</p>
            </div>
          )}
        </div>

        {/* Bundle upsell — shown after Day 1 completion */}
        {showBundleOffer && (
          <div className="bg-gradient-to-br from-orange-900/30 to-amber-900/20 border border-orange-500/30 rounded-2xl p-6 mb-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-orange-400 text-xs font-bold uppercase tracking-widest">
                    Special Offer
                  </span>
                  {!countdown.expired && (
                    <span className="text-xs text-gray-400">
                      · expires in {countdown.days}d {countdown.hours}h
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold mb-1">Unlock the Full Annual Bundle</h2>
                <p className="text-gray-400 text-sm leading-relaxed mb-3">
                  Join Mizark&apos;s exclusive WhatsApp community, get 20 inbox credits, and full
                  Leadash access for 12 months — all for ₦250,000.
                </p>
                <ul className="text-sm text-gray-300 space-y-1">
                  {[
                    "Mizark's private WhatsApp community access",
                    "20 Leadash inbox credits (₦200k+ value)",
                    "12 months full platform access",
                    "All 30 challenge lessons + future content",
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="sm:text-right flex-shrink-0">
                <p className="text-3xl font-extrabold text-white mb-1">₦250,000</p>
                <p className="text-gray-500 text-xs mb-4">Annual subscription</p>
                {bundleError && <p className="text-red-400 text-xs mb-2">{bundleError}</p>}
                <button
                  onClick={handleBundleCheckout}
                  disabled={bundleLoading}
                  className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors whitespace-nowrap"
                >
                  {bundleLoading ? "Loading..." : "Get Annual Bundle →"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lessons */}
        <div>
          <h2 className="text-lg font-semibold mb-4">
            Your Lessons
            <span className="text-gray-500 text-sm font-normal ml-2">
              ({availableLessons.length} of {lessons.length} unlocked)
            </span>
          </h2>

          {lessons.length === 0 ? (
            <div className="border border-white/10 rounded-xl p-8 text-center text-gray-500 text-sm">
              Lessons are being prepared. Day 1 will appear here shortly.
            </div>
          ) : (
            <div className="space-y-2">
              {lessons.map((lesson, i) => {
                const unlocked = lesson.drip_value <= daysSinceEnrollment;
                const dayNum   = i + 1;

                return (
                  <div
                    key={lesson.id}
                    className={`flex items-center gap-4 border rounded-xl px-4 py-3.5 transition-colors ${
                      unlocked
                        ? "border-white/10 bg-white/5 hover:bg-white/8 cursor-pointer"
                        : "border-white/5 bg-white/[0.02] opacity-50"
                    }`}
                    onClick={() => {
                      if (unlocked) window.location.href = `/academy/challenge-30/learn?lesson=${lesson.id}`;
                    }}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      unlocked ? "bg-orange-500/20 text-orange-400" : "bg-white/5 text-gray-600"
                    }`}>
                      {dayNum}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${unlocked ? "text-white" : "text-gray-500"}`}>
                        {lesson.title}
                      </p>
                      {!unlocked && (
                        <p className="text-gray-600 text-xs">
                          Unlocks Day {lesson.drip_value + 1}
                        </p>
                      )}
                    </div>
                    {unlocked ? (
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChallengeDashboard() {
  return (
    <Suspense>
      <ChallengeDashboardInner />
    </Suspense>
  );
}
