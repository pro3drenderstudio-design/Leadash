import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { checkDomains } from "@/lib/outreach/namecheap";

/**
 * GET /api/outreach/domains/check?domains=example.com,example.io
 *
 * Returns availability and pricing for the requested domains.
 */
export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const raw = req.nextUrl.searchParams.get("domains") ?? "";
  const names = raw
    .split(",")
    .map(d => d.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10); // cap at 10 per request

  if (!names.length) {
    return NextResponse.json({ error: "No domains provided" }, { status: 400 });
  }

  try {
    const results = await checkDomains(names);
    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Domain check failed" },
      { status: 500 },
    );
  }
}
