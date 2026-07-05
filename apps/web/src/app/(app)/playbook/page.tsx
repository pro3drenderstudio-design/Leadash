import { Suspense } from "react";
import PlaybookClient from "./PlaybookClient";

export default function PlaybookPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "var(--app-text-muted)" }}>Loading…</div>}>
      <PlaybookClient />
    </Suspense>
  );
}
