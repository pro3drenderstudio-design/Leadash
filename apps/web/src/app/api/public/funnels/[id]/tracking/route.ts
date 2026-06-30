/**
 * GET /api/public/funnels/[id]/tracking
 *
 * Returns a funnel's pixel/tracking IDs (Meta, GA4, Google Ads, GTM). No auth
 * required — these are client-side-only IDs, not secrets, and are already
 * embedded in the funnel's own page source. Used by the offer success page
 * to fire a Purchase event attributed to the funnel that drove the buyer
 * there (see ld_last_funnel_id in FunnelPageRenderer).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const revalidate = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createAdminClient();

  const { data: funnel } = await db.from("funnels").select("settings").eq("id", id).maybeSingle();
  const tracking = (funnel?.settings as Record<string, unknown> | null)?.tracking ?? {};

  return NextResponse.json({ tracking });
}
