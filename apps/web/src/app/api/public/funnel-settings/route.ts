/**
 * GET /api/public/funnel-settings
 *
 * Returns public-safe funnel config values needed by the /free-training page.
 * No auth required. Values come from admin_settings.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const revalidate = 60; // Cache for 60s — settings change rarely

export async function GET() {
  const db = createAdminClient();

  const { data } = await db
    .from("admin_settings")
    .select("key, value")
    .in("key", ["funnel_vsl_youtube_id", "meta_pixel_id"]);

  const cfg = Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value as string]));

  return NextResponse.json({
    youtube_id: cfg["funnel_vsl_youtube_id"] ?? null,
    pixel_id:   cfg["meta_pixel_id"]          ?? null,
  });
}
