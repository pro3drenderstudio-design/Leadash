import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { previewLeads } from "@/lib/lead-campaigns/apify";
import type { ApifyLeadScraperInput } from "@/types/lead-campaigns";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const input: ApifyLeadScraperInput = await req.json();

  const { data: settings } = await db
    .from("workspace_settings")
    .select("apify_api_key")
    .eq("workspace_id", workspaceId)
    .single();

  if (!settings?.apify_api_key) {
    return NextResponse.json({ error: "Apify API key not configured in settings" }, { status: 400 });
  }

  try {
    const leads = await previewLeads(settings.apify_api_key, input);
    return NextResponse.json({ leads });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Preview failed" },
      { status: 500 },
    );
  }
}
