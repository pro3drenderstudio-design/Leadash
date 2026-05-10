import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";

/** GET /api/academy/access
 *  Returns whether the current workspace can access the Academy.
 *  accessible = true when coming_soon is disabled OR workspace is in beta list. */
export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const { workspaceId } = auth;
  const db = createAdminClient();

  const { data } = await db
    .from("admin_settings")
    .select("value")
    .eq("key", "academy_coming_soon")
    .maybeSingle();

  // If no setting found, default to open
  if (!data) return NextResponse.json({ accessible: true });

  const setting = data.value as { enabled?: boolean; beta_workspaces?: string[] };
  const enabled  = setting.enabled  ?? false;
  const betaList = setting.beta_workspaces ?? [];

  const accessible = !enabled || betaList.includes(workspaceId);
  return NextResponse.json({ accessible, coming_soon_enabled: enabled, beta_workspaces: betaList });
}
