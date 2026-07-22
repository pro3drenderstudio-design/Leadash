import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { suggestIcp } from "@/lib/playbook/ai";
import { INDUSTRY_OPTIONS } from "@/types/discover";

export const maxDuration = 60;

// POST /api/playbook/icps/ai-suggest
// { industry, service, geography?, company_size? } → { suggestion }
// Returns a complete ICP draft; the client prefills the editor — nothing is saved here.
export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as {
    industry?: string; service?: string; geography?: string; company_size?: string;
  };

  const industry = (body.industry ?? "").trim();
  const service  = (body.service ?? "").trim();
  if (!industry || !service) {
    return NextResponse.json({ error: "industry and service are required" }, { status: 400 });
  }
  if (!(INDUSTRY_OPTIONS as readonly string[]).includes(industry)) {
    return NextResponse.json({ error: "Pick an industry from the list" }, { status: 400 });
  }
  if (service.length > 600) {
    return NextResponse.json({ error: "Keep the service description under 600 characters" }, { status: 400 });
  }

  try {
    const suggestion = await suggestIcp({
      industry,
      service,
      geography:    body.geography?.trim() || undefined,
      company_size: body.company_size?.trim() || undefined,
    });
    return NextResponse.json({ suggestion });
  } catch (err) {
    console.error("[icps/ai-suggest]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI suggestion failed" }, { status: 502 });
  }
}
