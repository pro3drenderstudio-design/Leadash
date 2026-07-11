"use client";
import { useEffect, useRef, useState } from "react";
import { publishVideoTime } from "./videoTimeBus";

interface YTPlayerInstance {
  getCurrentTime(): number;
  destroy(): void;
}

interface YTCtor {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars?: Record<string, unknown>;
      events?: {
        onReady?: (e: { target: YTPlayerInstance }) => void;
      };
    },
  ) => YTPlayerInstance;
}

function getYT(): YTCtor | undefined {
  return (window as unknown as { YT?: YTCtor }).YT;
}

let apiReady = false;
const pendingCallbacks: Array<() => void> = [];

function ensureYTApi(cb: () => void) {
  if (apiReady) { cb(); return; }
  pendingCallbacks.push(cb);
  if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
  (window as unknown as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady = () => {
    apiReady = true;
    pendingCallbacks.splice(0).forEach(fn => fn());
  };
}

function ActivePlayer({ blockId, ytId, muted }: { blockId: string; ytId: string; muted?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef    = useRef<YTPlayerInstance | null>(null);
  const timerRef     = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    ensureYTApi(() => {
      if (!mounted || !containerRef.current) return;
      const YT = getYT();
      if (!YT) return;
      playerRef.current = new YT.Player(containerRef.current, {
        videoId:    ytId,
        playerVars: { rel: 0, modestbranding: 1, enablejsapi: 1, autoplay: 1, mute: muted ? 1 : 0 },
        events: {
          onReady: ({ target }) => {
            timerRef.current = window.setInterval(() => {
              publishVideoTime(blockId, target.getCurrentTime());
            }, 1000);
          },
        },
      });
    });
    return () => {
      mounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [blockId, ytId, muted]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

export function YouTubePlayer({ blockId, ytId, autoplay }: { blockId: string; ytId: string; autoplay?: boolean }) {
  // Autoplay-on-load: browsers only allow unmuted autoplay after a user
  // gesture, so we mount the player muted and let the visitor unmute via
  // the native YouTube controls. Without the autoplay flag we keep the
  // click-to-play thumbnail gate (lighter weight, no muted-autoplay surprise).
  const [active, setActive] = useState(!!autoplay);

  if (active) {
    return <ActivePlayer blockId={blockId} ytId={ytId} muted={autoplay} />;
  }

  return (
    <button
      onClick={() => setActive(true)}
      aria-label="Play video"
      style={{
        position: "relative", width: "100%", height: "100%",
        border: "none", padding: 0, cursor: "pointer", background: "#000", display: "block",
      }}
    >
      {/* Thumbnail — hqdefault is 480×360, loads fast */}
      <img
        src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      {/* Play button overlay */}
      <span style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "rgba(0,0,0,0.72)",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)",
          transition: "transform 0.15s, background 0.15s",
        }}>
          {/* Triangle play icon */}
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
            <polygon points="6,3 20,12 6,21" />
          </svg>
        </span>
      </span>
    </button>
  );
}
