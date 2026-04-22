import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { previewLeads } from "@/lib/lead-campaigns/apify";
import type { ApifyLeadScraperInput } from "@/types/lead-campaigns";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const apifyKey = process.env.APIFY_API_KEY;
  if (!apifyKey) {
    return NextResponse.json({ error: "Lead preview is not configured" }, { status: 503 });
  }

  const input: ApifyLeadScraperInput = await req.json();

  try {
    const leads = await previewLeads(apifyKey, input);
    return NextResponse.json({ leads });
  } catch (err) {
    console.error("[preview] lead preview error:", err);
    return NextResponse.json(
      { error: "Preview failed — please check your filters and try again" },
      { status: 500 },
    );
  }
}
