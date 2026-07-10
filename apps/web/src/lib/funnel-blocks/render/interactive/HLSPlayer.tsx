"use client";
import { useEffect, useRef } from "react";
import { publishVideoTime } from "./videoTimeBus";

interface Props {
  blockId: string;
  src: string;
  poster?: string;
}

export function HLSPlayer({ blockId, src, poster }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hlsInstance: { destroy(): void } | null = null;

    // Safari / iOS support HLS natively
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (!Hls.isSupported()) {
          video.src = src;
          return;
        }
        const hls = new Hls({ startLevel: -1, capLevelToPlayerSize: true });
        hlsInstance = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
      });
    }

    return () => {
      hlsInstance?.destroy();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      controls
      playsInline
      preload="none"
      poster={poster || undefined}
      style={{ width: "100%", height: "100%", display: "block", background: "#000" }}
      onTimeUpdate={e => publishVideoTime(blockId, e.currentTarget.currentTime)}
    />
  );
}
