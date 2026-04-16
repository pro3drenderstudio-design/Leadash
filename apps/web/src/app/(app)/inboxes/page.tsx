import { Suspense } from "react";
import { getWorkspaceContext } from "@/lib/workspace/context";
import InboxesClient from "./InboxesClient";

export default async function InboxesPage() {
  const ctx = await getWorkspaceContext();
  const ws = ctx?.workspace as {
    plan_id: string;
    trial_ends_at: string | null;
    max_inboxes: number;
  } | null;

  const trialExpired =
    ws?.plan_id === "free" &&
    !!ws?.trial_ends_at &&
    new Date(ws.trial_ends_at) < new Date();

  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading…</div>}>
      <InboxesClient trialExpired={trialExpired} planId={ws?.plan_id ?? "free"} maxInboxes={ws?.max_inboxes ?? 5} />
    </Suspense>
  );
}
