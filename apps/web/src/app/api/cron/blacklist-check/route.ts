/**
 * GET|POST /api/cron/blacklist-check
 *
 * Scheduled daily via Vercel Cron (see vercel.json).
 * Checks every active dedicated IP against Spamhaus, Barracuda, and SpamCop.
 * Writes results to dedicated_ip_blacklist_checks.
 * If a new listing is detected, logs a warning (future: send email alert).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkIpBlacklists } from "@/lib/billing/blacklist";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();

  // Fetch all active subscriptions that have an IP configured
  const { data: subs } = await db
    .from("dedicated_ip_subscriptions")
    .select("id, ip_address, workspace_id")
    .in("status", ["active", "cancelling"])
    .not("ip_address", "is", null);

  if (!subs?.length) return NextResponse.json({ checked: 0 });

  let checked = 0;
  let listed  = 0;

  for (const sub of subs) {
    if (!sub.ip_address) continue;

    try {
      // Skip if already checked in the last 20 hours (avoid duplicate runs)
      const { data: recent } = await db
        .from("dedicated_ip_blacklist_checks")
        .select("id")
        .eq("subscription_id", sub.id)
        .gte("checked_at", new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString())
        .maybeSingle();

      if (recent) continue;

      const result = await checkIpBlacklists(sub.ip_address);

      await db.from("dedicated_ip_blacklist_checks").insert({
        subscription_id:    sub.id,
        blacklists_checked: result.blacklistsChecked,
        blacklists_hit:     result.blacklistsHit,
        is_clean:           result.isClean,
        raw_results:        result.rawResults,
      });

      checked++;
      if (!result.isClean) {
        listed++;
        console.warn(
          `[blacklist-check] IP ${sub.ip_address} (workspace=${sub.workspace_id}) ` +
          `is listed on: ${result.blacklistsHit.join(", ")}`,
        );
      }
    } catch (err) {
      console.error(`[blacklist-check] Failed for ${sub.ip_address}:`, err);
    }
  }

  return NextResponse.json({ checked, listed });
}
