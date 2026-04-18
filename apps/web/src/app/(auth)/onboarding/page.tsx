import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import OnboardingForm from "./OnboardingForm";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // If user already has a workspace, skip onboarding entirely
  const db = createAdminClient();
  const { data: membership } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membership) redirect("/dashboard");

  return <OnboardingForm />;
}
