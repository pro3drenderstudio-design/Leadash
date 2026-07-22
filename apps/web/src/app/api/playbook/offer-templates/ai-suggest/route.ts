import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { suggestOffers } from "@/lib/playbook/ai";

export const maxDuration = 60;

// POST /api/playbook/offer-templates/ai-suggest
// { icp_id, service, price_hint? } → { offers: [10] }
// Returns 10 offer drafts across different angles; the client lets the user
// pick one to prefill the editor — nothing is saved here.
export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json().catch(() => ({})) as {
    icp_id?: string; service?: string; price_hint?: string;
  };

  const service = (body.service ?? "").trim();
  if (!body.icp_id || !service) {
    return NextResponse.json({ error: "icp_id and service are required" }, { status: 400 });
  }
  if (service.length > 600) {
    return NextResponse.json({ error: "Keep the service description under 600 characters" }, { status: 400 });
  }

  const { data: icp } = await db
    .from("workspace_icps")
    .select("name, industry, company_size, geography, roles, pains, goals, objections")
    .eq("id", body.icp_id)
    .eq("workspace_id", workspaceId)
    .single();
  if (!icp) return NextResponse.json({ error: "ICP not found" }, { status: 404 });

  try {
    const offers = await suggestOffers({
      service,
      priceHint: body.price_hint?.trim() || undefined,
      icp: {
        name:         icp.name,
        industry:     icp.industry,
        company_size: icp.company_size,
        geography:    icp.geography,
        roles:        icp.roles,
        pains:        icp.pains ?? [],
        goals:        icp.goals ?? [],
        objections:   icp.objections ?? [],
      },
    });
    return NextResponse.json({ offers });
  } catch (err) {
    console.error("[offer-templates/ai-suggest]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI suggestion failed" }, { status: 502 });
  }
}
