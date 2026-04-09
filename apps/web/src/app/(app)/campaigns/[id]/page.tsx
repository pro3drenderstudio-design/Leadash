import { Suspense } from "react";
import CampaignDetailClient from "./CampaignDetailClient";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="p-6 space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-white/4 rounded-xl animate-pulse" />)}</div>}>
      <CampaignDetailClient campaignId={id} />
    </Suspense>
  );
}
