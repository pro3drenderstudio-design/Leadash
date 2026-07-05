import { Suspense } from "react";
import IcpEditorClient from "./IcpEditorClient";

export default async function IcpEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "var(--app-text-muted)" }}>Loading…</div>}>
      <IcpEditorClient id={id} />
    </Suspense>
  );
}
