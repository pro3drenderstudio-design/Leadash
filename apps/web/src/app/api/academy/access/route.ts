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

  const setting  = (typeof settingRow.value === "string" ? JSON.parse(settingRow.value) : settingRow.value) as { enabled?: boolean; beta_workspaces?: string[] };
  const enabled  = setting.enabled  ?? true;   // default: coming soon is ON
  const betaList = setting.beta_workspaces ?? [];

  // Coming soon is off → everyone can access
  if (!enabled) return NextResponse.json({ accessible: true });

  // Coming soon is on → allow the user in if they're a beta workspace OR they
  // have bought into the academy (any active enrollment). Buyers of the $10k
  // academy / sponsored bundle get in; everyone else still sees "coming soon",
  // and per-product pages remain enrollment-gated so buyers only enter what
  // they own.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ accessible: false });

  const { data: memberships } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id);
  const userWorkspaceIds = (memberships ?? []).map((m: { workspace_id: string }) => m.workspace_id);

  if (userWorkspaceIds.some((id: string) => betaList.includes(id))) {
    return NextResponse.json({ accessible: true });
  }

  const { count: enrollmentCount } = await db
    .from("academy_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .neq("status", "cancelled");

  return NextResponse.json({ accessible: (enrollmentCount ?? 0) > 0 });
}
