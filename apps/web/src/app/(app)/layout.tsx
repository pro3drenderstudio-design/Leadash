import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/context";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import AppHeader from "@/components/AppHeader";
import WorkspaceProvider from "@/components/WorkspaceProvider";
import { CurrencyProvider } from "@/lib/currency";
import ImpersonationBanner from "@/components/admin/ImpersonationBanner";
import TrialBanner from "@/components/TrialBanner";
import BetaBanner from "@/components/BetaBanner";
import { SidebarProvider } from "@/components/SidebarContext";

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

  const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.from("workspaces").update({
    plan_id: "starter", plan_status: "active",
    max_inboxes: 5, max_monthly_sends: 5000, max_seats: 3,
    trial_ends_at: trialEnd, updated_at: new Date().toISOString(),
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
  // Check auth first
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/onboarding"); // authed but no workspace yet

  // Silently claim any approved beta enrollment linked to this email (no account at apply-time)
  claimBetaIfApproved(user.id, user.email ?? "", ctx.workspaceId).catch(() => {});

  const workspace = ctx.workspace as { name: string; plan_id: string; trial_ends_at: string | null };
  const userName  = (user.user_metadata?.full_name as string | null) ?? null;

  return (
    <WorkspaceProvider workspaceId={ctx.workspaceId}>
    <CurrencyProvider>
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar workspaceName={workspace.name} plan={workspace.plan_id} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Banners + header as a single sticky-top block */}
          <div className="flex-shrink-0 z-30 relative">
            <ImpersonationBanner />
            <BetaBanner />
            {workspace.plan_id === "free" && workspace.trial_ends_at && (
              <TrialBanner trialEndsAt={workspace.trial_ends_at} />
            )}
            <AppHeader
              userEmail={user.email ?? ""}
              userName={userName}
              workspaceName={workspace.name}
              plan={workspace.plan_id}
              trialEndsAt={workspace.trial_ends_at}
            />
          </div>
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
    </CurrencyProvider>
    </WorkspaceProvider>
  );
}
