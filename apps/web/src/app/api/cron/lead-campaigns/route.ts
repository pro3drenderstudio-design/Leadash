import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { processLeadCampaign } from "@/lib/lead-campaigns/processor";

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Accept Bearer header (Vercel cron) OR ?secret= query param (cronjobs.org)
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const param = new URL(req.url).searchParams.get("secret");
  if (param === secret) return true;
  return false;
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const { data: campaigns } = await db
    .from("lead_campaigns")
    .select("id")
    .in("status", ["pending", "running"])
    .order("created_at")
    .limit(10);

  if (!campaigns?.length) return NextResponse.json({ processed: 0 });

  const results = await Promise.allSettled(
    campaigns.map((c: { id: string }) => processLeadCampaign(c.id)),
  );

  const succeeded = results.filter(r => r.status === "fulfilled").length;
  const failed    = results.filter(r => r.status === "rejected").length;

  return NextResponse.json({ processed: campaigns.length, succeeded, failed });
}
