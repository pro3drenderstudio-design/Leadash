import { Suspense } from "react";
import InboxesClient from "./InboxesClient";

export default function InboxesPage() {
  return <Suspense fallback={<div className="p-8 text-gray-400">Loading…</div>}><InboxesClient /></Suspense>;
}
