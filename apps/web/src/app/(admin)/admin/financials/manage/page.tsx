/**
 * Finance Manager — server entry point.
 *
 * Access is already gated by the (admin) layout, which redirects non-admins
 * away before this page renders. We keep the file server-only so future work
 * (e.g. SSR pre-fetch for faster first paint) has a natural home. All actual
 * UI + data fetching lives in FinanceManagerClient.
 */

import FinanceManagerClient from "./FinanceManagerClient";
import "@/v2-app/v2-app.css";

export const dynamic = "force-dynamic";

export default function FinanceManagerPage() {
  return <FinanceManagerClient />;
}
