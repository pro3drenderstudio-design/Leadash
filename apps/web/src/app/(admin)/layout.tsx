import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const adminClient = createAdminClient();
  const { data: admin } = await adminClient
    .from("admins")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!admin) redirect("/dashboard");

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar
        adminEmail={user.email ?? ""}
        adminRole={admin.role}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#0f1117]">
          {children}
        </main>
      </div>
    </div>
  );
}
