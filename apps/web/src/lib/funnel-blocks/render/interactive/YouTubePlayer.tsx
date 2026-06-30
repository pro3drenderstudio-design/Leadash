"use client";
import { useEffect, useRef } from "react";
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

export function YouTubePlayer({ blockId, ytId }: { blockId: string; ytId: string }) {
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
        playerVars: { rel: 0, modestbranding: 1, enablejsapi: 1 },
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
  }, [blockId, ytId]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
