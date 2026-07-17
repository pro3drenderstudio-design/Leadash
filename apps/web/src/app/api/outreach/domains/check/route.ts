import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { checkDomains } from "@/lib/outreach/namecheap";
import { getDomainMarkup, priceWithMarkup } from "@/lib/outreach/domainMarkup";

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
    const [results, markup] = await Promise.all([checkDomains(names), getDomainMarkup()]);
    // Expose the marked-up price (what the user is actually charged) alongside
    // the raw registration price. The UI shows price_display; checkout keeps
    // receiving the raw `price` and applies the same markup server-side.
    const withMarkup = (results as Array<{ domain: string; available: boolean; price: number }>).map(r => ({
      ...r,
      price_display: r.price > 0 ? Math.ceil(priceWithMarkup(r.price, markup) * 100) / 100 : 0,
    }));
    return NextResponse.json(withMarkup);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Domain check failed" },
      { status: 500 },
    );
  }
}
