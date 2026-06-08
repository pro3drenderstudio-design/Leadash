import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import AdminSidebar from "@/components/admin/AdminSidebar";
import ImpersonationBanner from "@/components/admin/ImpersonationBanner";
import { resolveModules, type AdminModuleKey } from "@/lib/admin/modules";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const adminClient = createAdminClient();
  const { data: admin } = await adminClient
    .from("admins")
    .select("role, permissions, preset_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!admin) redirect("/dashboard");

  // Live-resolve the admin's modules: if they're bound to a preset, the preset's
  // current modules win over anything stored on the admin row. This is what makes
  // "edit a preset → every admin on it updates instantly" work.
  let customModules: string[] = Array.isArray(admin.permissions) ? admin.permissions as string[] : [];
  if (admin.preset_id) {
    const { data: preset } = await adminClient
      .from("admin_role_presets")
      .select("modules")
      .eq("id", admin.preset_id)
      .maybeSingle();
    if (preset?.modules) customModules = preset.modules as string[];
  }
  const modules: AdminModuleKey[] = Array.from(resolveModules(admin.role as string, customModules));

  return (
    <>
    <ImpersonationBanner />
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar
        adminEmail={user.email ?? ""}
        adminRole={admin.role}
        adminModules={modules}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#0f1117] pt-12 lg:pt-0">
          {children}
        </main>
      </div>
    </div>
    </>
  );
}
