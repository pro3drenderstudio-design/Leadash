import { Suspense } from "react";
import CampaignWizardClient from "./CampaignWizardClient";
export default function NewCampaignPage() {
  return (
    <Suspense>
      <CampaignWizardClient />
    </Suspense>
  );
}
