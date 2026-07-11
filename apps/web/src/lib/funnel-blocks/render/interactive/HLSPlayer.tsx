"use client";
import { useEffect, useRef, useState } from "react";
import type HlsType from "hls.js";
import { publishVideoTime } from "./videoTimeBus";
import { VideoPlayOverlay } from "./VideoPlayOverlay";

interface Props {
  blockId: string;
  src: string;
  poster?: string;
  autoplay?: boolean;
}

interface QualityLevel {
  index: number;
  height: number;
}

export function HLSPlayer({ blockId, src, poster, autoplay }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef   = useRef<HlsType | null>(null);

  const [showOverlay, setShowOverlay] = useState(!!autoplay);
  const [levels, setLevels]           = useState<QualityLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1); // -1 = Auto
  const [activeLevel, setActiveLevel] = useState<number | null>(null); // effective level while in Auto
  const [menuOpen, setMenuOpen]       = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hlsInstance: HlsType | null = null;

    // Safari / iOS support HLS natively — no JS-level quality control available there.
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
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
          const lv = data.levels
            .map((l, i) => ({ index: i, height: l.height }))
            .filter(l => l.height > 0)
            .sort((a, b) => b.height - a.height);
          setLevels(lv);
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
          setActiveLevel(data.level);
        });
      });
    }

    return () => {
      hlsInstance?.destroy();
      hlsRef.current = null;
    };
  }, [src]);

  function selectQuality(index: number) {
    if (hlsRef.current) hlsRef.current.currentLevel = index;
    setCurrentLevel(index);
    setMenuOpen(false);
  }

  function handleOverlayPress() {
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.muted = false;
      video.play().catch(() => {});
    }
    setShowOverlay(false);
  }

  const autoLabelHeight = levels.find(l => l.index === activeLevel)?.height;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <video
        ref={videoRef}
        controls={!showOverlay}
        playsInline
        preload={autoplay ? "auto" : "none"}
        autoPlay={autoplay}
        muted={autoplay}
        poster={poster || undefined}
        style={{ width: "100%", height: "100%", display: "block", background: "#000" }}
        onTimeUpdate={e => publishVideoTime(blockId, e.currentTarget.currentTime)}
      />

      {showOverlay && <VideoPlayOverlay onPress={handleOverlayPress} />}

      {!showOverlay && levels.length > 1 && (
        <div style={{ position: "absolute", bottom: 46, right: 8, zIndex: 5 }}>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 4 }} />
              <div
                style={{
                  position: "absolute", bottom: "calc(100% + 6px)", right: 0,
                  background: "rgba(20,20,24,0.94)", borderRadius: 8, overflow: "hidden",
                  minWidth: 104, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 5,
                }}
              >
                <button
                  onClick={() => selectQuality(-1)}
                  style={{
                    display: "block", width: "100%", padding: "7px 12px", textAlign: "left",
                    background: currentLevel === -1 ? "rgba(255,255,255,0.14)" : "transparent",
                    border: "none", color: "#fff", fontSize: 12.5, cursor: "pointer",
                  }}
                >
                  Auto{currentLevel === -1 && autoLabelHeight ? ` (${autoLabelHeight}p)` : ""}
                </button>
                {levels.map(l => (
                  <button
                    key={l.index}
                    onClick={() => selectQuality(l.index)}
                    style={{
                      display: "block", width: "100%", padding: "7px 12px", textAlign: "left",
                      background: currentLevel === l.index ? "rgba(255,255,255,0.14)" : "transparent",
                      border: "none", color: "#fff", fontSize: 12.5, cursor: "pointer",
                    }}
                  >
                    {l.height}p
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Video quality"
            style={{
              width: 30, height: 30, borderRadius: 6, border: "none", cursor: "pointer",
              background: "rgba(0,0,0,0.55)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.87 21a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
