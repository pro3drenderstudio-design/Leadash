import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runWarmupPool, runWarmupRamp } from "@/lib/outreach/warmup-runner";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const { data: workspaces } = await db
    .from("outreach_inboxes")
    .select("workspace_id")
    .eq("status", "active")
    .eq("warmup_enabled", true);

  const uniqueIds = [...new Set((workspaces ?? []).map((r: { workspace_id: string }) => r.workspace_id))];
  if (!uniqueIds.length) return NextResponse.json({ workspaces: 0 });

  // Run ramp on Mondays
  const isMonday = new Date().getDay() === 1;

  const results = await Promise.all(
    uniqueIds.map(async id => {
      if (isMonday) await runWarmupRamp(id).catch(() => {});
      return runWarmupPool(id).catch(e => ({ workspace_id: id, error: String(e) }));
    })
  );

  return NextResponse.json({ workspaces: uniqueIds.length, ramped: isMonday, results });
}
