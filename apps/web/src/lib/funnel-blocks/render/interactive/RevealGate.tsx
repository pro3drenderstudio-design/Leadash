"use client";
import { useEffect, useState } from "react";
import { subscribeVideoTime } from "./videoTimeBus";

export function RevealGate({ sourceBlockId, afterSeconds, children }: { sourceBlockId: string; afterSeconds: number; children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (revealed) return;
    return subscribeVideoTime(sourceBlockId, t => { if (t >= afterSeconds) setRevealed(true); });
  }, [sourceBlockId, afterSeconds, revealed]);

  if (!revealed) return null;
  return <>{children}</>;
}
