import { Suspense } from "react";
import { getWorkspaceContext } from "@/lib/workspace/context";
import InboxesClient from "./InboxesClient";

export default async function InboxesPage() {
  const ctx = await getWorkspaceContext();
  const ws = ctx?.workspace as {
    plan_id: string;
    max_inboxes: number;
  } | null;

  // The legacy 14-day trial gate has been removed. Free plan limits come
  // straight from `max_inboxes` on the workspace row.
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading…</div>}>
      <InboxesClient planId={ws?.plan_id ?? "free"} maxInboxes={ws?.max_inboxes ?? 5} />
    </Suspense>
  );
}
