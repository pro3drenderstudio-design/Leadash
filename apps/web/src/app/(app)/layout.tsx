import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/context";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import AppHeader from "@/components/AppHeader";
import WorkspaceProvider from "@/components/WorkspaceProvider";
import { CurrencyProvider } from "@/lib/currency";
import ImpersonationBanner from "@/components/admin/ImpersonationBanner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Check auth first
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/onboarding"); // authed but no workspace yet

  const workspace = ctx.workspace as { name: string; plan_id: string };
  const userName  = (user.user_metadata?.full_name as string | null) ?? null;

  return (
    <WorkspaceProvider workspaceId={ctx.workspaceId}>
    <CurrencyProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar workspaceName={workspace.name} plan={workspace.plan_id} />
        <div className="flex-1 flex flex-col overflow-hidden">
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
    </CurrencyProvider>
    </WorkspaceProvider>
  );
}
