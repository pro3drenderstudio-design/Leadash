import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/context";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import Sidebar from "@/components/SidebarV2";
import AppHeader from "@/components/AppHeader";
import SectionTabs from "@/components/SectionTabs";
import WorkspaceProvider from "@/components/WorkspaceProvider";
import CreditsProvider from "@/components/CreditsProvider";
import { CurrencyProvider } from "@/lib/currency";
import { getCurrencyContext } from "@/lib/currency/server";
import ImpersonationBanner from "@/components/admin/ImpersonationBanner";
import BetaBanner from "@/components/BetaBanner";
import PastDueBanner from "@/components/PastDueBanner";
import SubscriptionRenewalBanner from "@/components/SubscriptionRenewalBanner";
import { SidebarProvider } from "@/components/SidebarContext";
import { getPlanById } from "@/lib/billing/getActivePlans";

async function claimBetaIfApproved(userId: string, email: string, workspaceId: string) {
  const db = createAdminClient();
  const { data: enrollment } = await db
    .from("beta_enrollments")
    .select("id")
    .eq("email", email)
    .eq("status", "approved")
    .is("user_id", null)
    .maybeSingle();
  if (!enrollment) return;

  const starterPlan = await getPlanById("starter");
  const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.from("workspaces").update({
    plan_id:           "starter",
    plan_status:       "active",
    max_inboxes:       starterPlan.max_inboxes,
    max_monthly_sends: starterPlan.max_monthly_sends,
    max_seats:         starterPlan.max_seats,
    trial_ends_at:     trialEnd,
    updated_at:        new Date().toISOString(),
  }).eq("id", workspaceId);

  const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single();
  const CREDITS = 500;
  await db.from("workspaces")
    .update({ lead_credits_balance: (ws?.lead_credits_balance ?? 0) + CREDITS })
    .eq("id", workspaceId);
  await db.from("lead_credit_transactions").insert({
    workspace_id: workspaceId, type: "grant", amount: CREDITS, description: "Beta programme — starter credits",
  });
  await db.from("beta_enrollments").update({
    user_id: userId, workspace_id: workspaceId, updated_at: new Date().toISOString(),
  }).eq("id", enrollment.id);
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // getWorkspaceContext() handles auth — no need for a separate getUser() call
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  // Get the authenticated user for email/name (already fetched inside getWorkspaceContext)
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  // Silently claim any approved beta enrollment linked to this email (no account at apply-time)
  claimBetaIfApproved(user.id, user.email ?? "", ctx.workspaceId).catch(() => {});

  const workspace = ctx.workspace as { name: string; plan_id: string; plan_status: string; trial_ends_at: string | null; grace_ends_at: string | null; subscription_renews_at: string | null; lead_credits_balance: number; subscription_credits_balance: number };
  const userName  = (user.user_metadata?.full_name as string | null) ?? null;

  // Don't surface trial/beta UI if the user already has an active paid subscription.
  // Beta enrollments set plan_id="starter" + trial_ends_at; once users upgrade to a real
  // paid plan the trial_ends_at is stale and should be ignored.
  // A workspace is "commercially active" if it is on a named paid plan OR has a
  // subscription_renews_at set (starter users who paid — they always have renews_at
  // after backfill; beta starters do not).
  const hasActivePaidPlan =
    workspace.plan_id !== "free" && workspace.plan_status === "active";
  const trialEndsAt = hasActivePaidPlan ? null : workspace.trial_ends_at;

  // Show renewal banner when renewal is within 7 days (or overdue) for paid plans
  const renewalDate = workspace.subscription_renews_at ? new Date(workspace.subscription_renews_at) : null;
  const showRenewalBanner = hasActivePaidPlan
    && renewalDate !== null
    && renewalDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Resolve the visitor's currency (from x-vercel-ip-country + the currency_rates table)
  // so prices throughout the app render in their local currency. Nigerian visitors get NGN.
  const currencyContext = await getCurrencyContext();

  return (
    <WorkspaceProvider workspaceId={ctx.workspaceId}>
    <CurrencyProvider context={currencyContext}>
    <CreditsProvider
      initialCredits={workspace.lead_credits_balance ?? 0}
      initialMonthlyCredits={workspace.subscription_credits_balance ?? 0}
    >
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          workspaceName={workspace.name}
          plan={workspace.plan_id}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Banners + header as a single sticky-top block */}
          <div className="flex-shrink-0 z-30 relative">
            <ImpersonationBanner />
            <BetaBanner />
            {workspace.plan_status === "past_due" && workspace.grace_ends_at && (
              <PastDueBanner graceEndsAt={workspace.grace_ends_at} />
            )}
            {showRenewalBanner && workspace.subscription_renews_at && (
              <SubscriptionRenewalBanner renewsAt={workspace.subscription_renews_at} />
            )}
            {/* TrialBanner mount removed — the 14-day trial program is
                discontinued. trialEndsAt is preserved on the workspace row
                for back-compat but no UI surfaces it. */}
            <AppHeader
              userEmail={user.email ?? ""}
              userName={userName}
              workspaceName={workspace.name}
              plan={workspace.plan_id}
              trialEndsAt={trialEndsAt}
              subscriptionRenewsAt={workspace.subscription_renews_at}
            />
            {/* Top tab strip — renders the current section's sub-pages, hides on sections w/ <2 tabs */}
            <SectionTabs />
          </div>
          <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
    </CreditsProvider>
    </CurrencyProvider>
    </WorkspaceProvider>
  );
}
