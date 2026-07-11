"use client";
import { useRef, useState } from "react";
import { publishVideoTime } from "./videoTimeBus";
import { VideoPlayOverlay } from "./VideoPlayOverlay";

interface Props {
  blockId: string;
  src: string;
  poster?: string;
  autoplay?: boolean;
}

/** Self-hosted (mp4/webm) video — live-mode rendering with the autoplay overlay. */
export function PlainVideoPlayer({ blockId, src, poster, autoplay }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showOverlay, setShowOverlay] = useState(!!autoplay);

  function handleOverlayPress() {
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.muted = false;
      video.play().catch(() => {});
    }
    setShowOverlay(false);
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <video
        ref={videoRef}
        src={src}
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
    </div>
  );
}
