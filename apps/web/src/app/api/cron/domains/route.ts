import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isDomainVerified } from "@/lib/outreach/postal";

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const param = new URL(req.url).searchParams.get("secret");
  return param === secret;
}

// GET /api/cron/domains
// Checks all dns_pending domains and flips them to active once DKIM propagates.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data: pending } = await db
    .from("outreach_domains")
    .select("id, domain")
    .eq("status", "dns_pending")
    .limit(50);

  if (!pending?.length) return NextResponse.json({ checked: 0, activated: 0 });

  let activated = 0;
  for (const d of pending) {
    try {
      const verified = await isDomainVerified(d.domain);
      if (verified) {
        await db
          .from("outreach_domains")
          .update({ status: "active", error_message: null, updated_at: new Date().toISOString() })
          .eq("id", d.id);
        // Also ensure all inboxes on this domain are active
        await db
          .from("outreach_inboxes")
          .update({ status: "active", last_error: null, updated_at: new Date().toISOString() })
          .eq("domain_id", d.id)
          .eq("status", "dns_pending");
        activated++;
      }
    } catch {
      // Non-fatal — try again next cron tick
    }
  }

  return NextResponse.json({ checked: pending.length, activated });
}
