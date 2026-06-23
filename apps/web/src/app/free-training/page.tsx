"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

declare global {
  interface Window {
    YT: {
      Player: new (id: string, opts: object) => YouTubePlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubePlayer {
  getCurrentTime: () => number;
  getDuration:    () => number;
  destroy:        () => void;
}

const MILESTONES = [25, 50, 75, 100];

export default function FreeTrainingPage() {
  const [videoId,    setVideoId]    = useState<string | null>(null);
  const [pixelId,    setPixelId]    = useState<string | null>(null);
  const [user,       setUser]       = useState<{ id: string; email: string; full_name?: string } | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [watchPct,   setWatchPct]   = useState(0);
  const firedRef  = useRef(new Set<number>());
  const playerRef = useRef<YouTubePlayer | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load admin settings + auth state ──────────────────────────────────────
  useEffect(() => {
    async function init() {
      const supabase = createClient();

      // Get current user (nullable — page is accessible without login)
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        setUser({
          id:        authUser.id,
          email:     authUser.email ?? "",
          full_name: authUser.user_metadata?.full_name as string | undefined,
        });
      }

      // Load settings via public API (no auth required)
      const res = await fetch("/api/public/funnel-settings");
      if (res.ok) {
        const d = await res.json() as { youtube_id?: string; pixel_id?: string };
        setVideoId(d.youtube_id ?? null);
        setPixelId(d.pixel_id  ?? null);
      }

      setLoading(false);
    }
    init();
  }, []);

  // ── Meta Pixel bootstrap ───────────────────────────────────────────────────
  useEffect(() => {
    if (!pixelId) return;
    if (typeof window === "undefined") return;

    // Minimal fbq stub — real script loads async
    if (!(window as unknown as Record<string, unknown>).fbq) {
      const f = function (...args: unknown[]) { (f as unknown as { q: unknown[] }).q.push(args); };
      (f as unknown as { q: unknown[]; loaded: boolean; version: string }).q = [];
      (f as unknown as { loaded: boolean }).loaded = true;
      (f as unknown as { version: string }).version = "2.0";
      (window as unknown as Record<string, unknown>).fbq = f;

      const s = document.createElement("script");
      s.async = true;
      s.src   = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(s);
    }

    const fbq = (window as unknown as Record<string, unknown>).fbq as ((...a: unknown[]) => void) | undefined;
    fbq?.("init",  pixelId);
    fbq?.("track", "PageView");
  }, [pixelId]);

  // ── YouTube IFrame API ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!videoId) return;

    function onPlayerReady() {
      // start polling watch %
      intervalRef.current = setInterval(() => {
        const p = playerRef.current;
        if (!p) return;
        const dur = p.getDuration();
        if (!dur) return;
        const pct = Math.floor((p.getCurrentTime() / dur) * 100);
        setWatchPct(pct);

        MILESTONES.forEach(m => {
          if (pct >= m && !firedRef.current.has(m)) {
            firedRef.current.add(m);
            fireWatchMilestone(m);
          }
        });
      }, 5_000);
    }

    function createPlayer() {
      playerRef.current = new window.YT.Player("yt-player", {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onReady: onPlayerReady,
        },
      });
    }

    if (window.YT?.Player) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = createPlayer;
      const tag = document.createElement("script");
      tag.src   = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      playerRef.current?.destroy();
    };
  }, [videoId]);

  function fireWatchMilestone(pct: number) {
    const fbq = (window as unknown as Record<string, unknown>).fbq as ((...a: unknown[]) => void) | undefined;

    // Meta Pixel custom event
    fbq?.("trackCustom", "VideoMilestone", { milestone: pct, video_id: videoId });

    // Server-side track (saves to funnel_states, fires automation)
    if (user) {
      fetch("/api/funnel/track-watch", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ pct, video_id: videoId }),
      }).catch(() => {});
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const firstName = user?.full_name?.split(" ")[0] ?? null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="border-b border-white/5 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-lg tracking-tight">Leadash</span>
            <span className="text-gray-600 text-sm">× Learn By Mizark</span>
          </div>
          {user && (
            <p className="text-gray-400 text-sm">
              {firstName ? `Welcome back, ${firstName}` : user.email}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Hero text */}
        {firstName && (
          <p className="text-orange-400 text-sm font-semibold mb-2">
            Hey {firstName}, this one&apos;s for you.
          </p>
        )}
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
          How to close ₦2M+ monthly{" "}
          <span className="text-orange-500">using cold outreach</span>
        </h1>
        <p className="text-gray-400 text-base mb-8 max-w-2xl">
          Watch the full training below — then grab the 30-day challenge to implement
          it step by step with Mizark.
        </p>

        {/* Video player */}
        <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 mb-4">
          {videoId ? (
            <div id="yt-player" className="absolute inset-0 w-full h-full" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-500">
              <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">Training video coming soon</p>
            </div>
          )}
        </div>

        {/* Watch progress indicator — subtle, not countdown */}
        {watchPct > 0 && (
          <div className="flex items-center gap-3 mb-8">
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all duration-500"
                style={{ width: `${watchPct}%` }}
              />
            </div>
            <span className="text-gray-500 text-xs">{watchPct}% watched</span>
          </div>
        )}

        {/* CTA section */}
        <div className="border border-white/10 rounded-2xl p-8 bg-white/5 mt-8">
          <div className="max-w-lg">
            <p className="text-orange-400 text-xs font-semibold uppercase tracking-widest mb-2">
              Ready to implement?
            </p>
            <h2 className="text-2xl font-bold mb-3">
              Join the 30-Day Outreach Challenge
            </h2>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              Get daily lessons, direct access to the Leadash platform, and
              Mizark&apos;s community — for just ₦10,000. Build your entire outreach
              system in 30 days.
            </p>
            <a
              href="/pay/challenge-30"
              className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3.5 rounded-lg text-sm transition-colors"
            >
              Get the 30-Day Challenge — ₦10,000
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
            <p className="text-gray-500 text-xs mt-3">
              One-time payment. Instant access. No subscription.
            </p>
          </div>
        </div>

        {/* What you get list */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", label: "30 daily video lessons" },
            { icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z", label: "Mizark's WhatsApp community" },
            { icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z", label: "Full Leadash platform access" },
            { icon: "M13 10V3L4 14h7v7l9-11h-7z", label: "Day 1 unlocks immediately" },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
              </div>
              <p className="text-gray-300 text-sm pt-1.5">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
