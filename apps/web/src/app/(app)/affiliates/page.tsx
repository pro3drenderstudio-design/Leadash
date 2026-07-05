import { Suspense } from "react";
import AffiliateDashboardClient from "./AffiliateDashboardClient";

export default function AffiliatePage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: "var(--app-text-muted)", fontSize: 13 }}>Loading…</div>}>
      <AffiliateDashboardClient />
    </Suspense>
  );
}
