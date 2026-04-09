import { Suspense } from "react";
import TemplatesClient from "./TemplatesClient";

export default function TemplatesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white/40">Loading…</div>}>
      <TemplatesClient />
    </Suspense>
  );
}
