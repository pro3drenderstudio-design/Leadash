"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { publishVideoTime } from "./videoTimeBus";
import { VideoPlayOverlay } from "./VideoPlayOverlay";

interface YTPlayerInstance {
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  unMute(): void;
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

function ActivePlayer({ blockId, ytId, muted, onReady }: {
  blockId: string;
  ytId: string;
  muted?: boolean;
  onReady?: (player: YTPlayerInstance) => void;
}) {
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
            onReady?.(target);
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
  // Non-autoplay: click-to-play thumbnail gate (lighter weight, no muted-autoplay surprise).
  // Autoplay: the player mounts and starts playing muted immediately (browsers block
  // unmuted autoplay), but we keep a dim/blurred "click to watch" overlay on top so the
  // click affordance still reads normally — clicking restarts from 0 with sound.
  const [active, setActive] = useState(!!autoplay);
  const [showOverlay, setShowOverlay] = useState(true);
  const playerRef = useRef<YTPlayerInstance | null>(null);

  const handleOverlayPress = useCallback(() => {
    if (autoplay) {
      if (!playerRef.current) return; // player not ready yet — keep the overlay up
      playerRef.current.seekTo(0, true);
      playerRef.current.unMute();
      playerRef.current.playVideo();
    } else {
      setActive(true);
    }
    setShowOverlay(false);
  }, [autoplay]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {active ? (
        <ActivePlayer
          blockId={blockId}
          ytId={ytId}
          muted={autoplay}
          onReady={p => { playerRef.current = p; }}
        />
      ) : (
        // Thumbnail — hqdefault is 480×360, loads fast
        <img
          src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`}
          alt=""
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}
      {showOverlay && <VideoPlayOverlay onPress={handleOverlayPress} />}
    </div>
  );
}
