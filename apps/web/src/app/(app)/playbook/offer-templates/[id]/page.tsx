import { Suspense } from "react";
import OfferTemplateEditorClient from "./OfferTemplateEditorClient";

export default async function OfferTemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "var(--app-text-muted)" }}>Loading…</div>}>
      <OfferTemplateEditorClient id={id} />
    </Suspense>
  );
}
