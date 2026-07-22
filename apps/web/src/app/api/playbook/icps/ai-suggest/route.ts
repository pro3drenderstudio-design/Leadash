import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { suggestIcp, refineIcp } from "@/lib/playbook/ai";
import { INDUSTRY_OPTIONS } from "@/types/discover";

export const maxDuration = 60;

interface CurrentIcp {
  name?: string; industry?: string | null; company_size?: string | null;
  geography?: string | null; roles?: string | null; customers?: string | null;
  pains?: string[]; goals?: string[]; triggers?: string[]; objections?: string[];
  tone?: string | null;
}

// POST /api/playbook/icps/ai-suggest
// Create: { industry, service, geography?, company_size? } → { suggestion }
// Refine: { instruction, current } → { suggestion }
// Returns a complete ICP draft; the client prefills the editor — nothing is saved here.
export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({})) as {
    industry?: string; service?: string; geography?: string; company_size?: string;
    instruction?: string; current?: CurrentIcp;
  };

  try {
    // ── Refine mode ──
    if (body.instruction !== undefined) {
      const instruction = body.instruction.trim();
      if (!instruction || !body.current) {
        return NextResponse.json({ error: "instruction and current are required" }, { status: 400 });
      }
      if (instruction.length > 600) {
        return NextResponse.json({ error: "Keep the instruction under 600 characters" }, { status: 400 });
      }
      const c = body.current;
      const suggestion = await refineIcp({
        instruction,
        current: {
          name:         c.name ?? "My ICP",
          industry:     c.industry ?? null,
          company_size: c.company_size ?? null,
          geography:    c.geography ?? null,
          roles:        c.roles ?? null,
          customers:    c.customers ?? null,
          pains:        c.pains ?? [],
          goals:        c.goals ?? [],
          triggers:     c.triggers ?? [],
          objections:   c.objections ?? [],
          tone:         c.tone ?? null,
        },
      });
      return NextResponse.json({ suggestion });
    }

    // ── Create mode ──
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
