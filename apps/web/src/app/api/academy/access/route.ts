import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/** GET /api/academy/access
 *  No workspace header required — reads the user's session from cookies.
 *  accessible = true when coming_soon is disabled OR any of the user's workspaces is in the beta list. */
export async function GET() {
  const db = createAdminClient();

  const { data: settingRow } = await db
    .from("admin_settings")
    .select("value")
    .eq("key", "academy_coming_soon")
    .maybeSingle();

  // No setting row → coming soon is on by default
  if (!settingRow) return NextResponse.json({ accessible: false });

  const setting  = settingRow.value as { enabled?: boolean; beta_workspaces?: string[] };
  const enabled  = setting.enabled  ?? true;   // default: coming soon is ON
  const betaList = setting.beta_workspaces ?? [];

  // Coming soon is off → everyone can access
  if (!enabled) return NextResponse.json({ accessible: true });

  // Coming soon is on → check if the user has any workspace in the beta list
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ accessible: false });

  const { data: memberships } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id);

  const userWorkspaceIds = (memberships ?? []).map((m: { workspace_id: string }) => m.workspace_id);
  const accessible = userWorkspaceIds.some((id: string) => betaList.includes(id));

  return NextResponse.json({ accessible });
}
