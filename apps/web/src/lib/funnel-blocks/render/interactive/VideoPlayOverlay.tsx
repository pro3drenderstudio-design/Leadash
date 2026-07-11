"use client";

/**
 * Shared "click to watch" overlay — a dim, slightly blurred scrim with a
 * centered play button. Used both as the click-to-play gate (no autoplay)
 * and, when autoplay is on, as a "click to watch with sound" affordance
 * layered on top of an already-playing muted video.
 */
export function VideoPlayOverlay({ onPress }: { onPress: () => void }) {
  return (
    <button
      onClick={onPress}
      aria-label="Play video"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 3,
        border: "none",
        padding: 0,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.32)",
        backdropFilter: "blur(2.5px)",
        WebkitBackdropFilter: "blur(2.5px)",
      }}
    >
      <span
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(0,0,0,0.72)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(4px)",
          transition: "transform 0.15s, background 0.15s",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
          <polygon points="6,3 20,12 6,21" />
        </svg>
      </span>
    </button>
  );
}
