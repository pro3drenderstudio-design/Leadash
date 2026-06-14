import LeadCampaignsDeprecationBanner from "@/components/LeadCampaignsDeprecationBanner";

/**
 * Scoped layout — mounts the deprecation banner on every page under
 * /lead-campaigns/**, including verify, enrich, credits, and the [id] detail.
 * Removing the banner is a one-line change here once the feature is gone.
 */
export default function LeadCampaignsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LeadCampaignsDeprecationBanner />
      {children}
    </>
  );
}
