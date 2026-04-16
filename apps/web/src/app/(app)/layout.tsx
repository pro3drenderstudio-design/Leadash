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
      <ImpersonationBanner />
      <BetaBanner />
      {workspace.plan_id === "free" && workspace.trial_ends_at && (
        <TrialBanner trialEndsAt={workspace.trial_ends_at} />
      )}
      <div className="flex h-screen overflow-hidden">
        <Sidebar workspaceName={workspace.name} plan={workspace.plan_id} />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <AppHeader
            userEmail={user.email ?? ""}
            userName={userName}
            workspaceName={workspace.name}
            plan={workspace.plan_id}
          />
          <main className="flex-1 overflow-y-auto pt-14">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
    </CurrencyProvider>
    </WorkspaceProvider>
  );
}
