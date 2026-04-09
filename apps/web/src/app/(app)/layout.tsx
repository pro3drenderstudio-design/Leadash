import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/context";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import WorkspaceProvider from "@/components/WorkspaceProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Check auth first
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/onboarding"); // authed but no workspace yet

  const workspace = ctx.workspace as { name: string; plan_id: string };

  return (
    <WorkspaceProvider workspaceId={ctx.workspaceId}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar workspaceName={workspace.name} plan={workspace.plan_id} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </WorkspaceProvider>
  );
}
