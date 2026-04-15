import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Public (unauthenticated) settings — only non-sensitive keys exposed here.
const PUBLIC_KEYS = ["support_email", "announcement_banner", "maintenance_mode"] as const;

export const revalidate = 60; // cache for 60 seconds

export async function GET() {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("admin_settings")
      .select("key, value")
      .in("key", [...PUBLIC_KEYS]);

    const settings: Record<string, unknown> = {};
    for (const row of data ?? []) {
      settings[row.key] = row.value;
    }

    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ settings: {} });
  }
}
