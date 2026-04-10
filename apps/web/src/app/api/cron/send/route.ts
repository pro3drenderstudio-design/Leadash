import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runSendBatch } from "@/lib/outreach/send-runner";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Verify cron secret (Vercel sets this automatically for cron jobs)
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();

  // Get all active workspaces that have active campaigns
  const { data: workspaces } = await db
    .from("workspaces")
    .select("id")
    .in("id",
      (await db
        .from("outreach_campaigns")
        .select("workspace_id")
        .eq("status", "active")
      ).data?.map((r: { workspace_id: string }) => r.workspace_id) ?? []
    );

  if (!workspaces?.length) return NextResponse.json({ workspaces: 0 });

  const results = await Promise.all(
    workspaces.map(async ({ id }) => {
      const r = await runSendBatch(id, 50, 1_000, 3_000).catch(e => ({ workspace_id: id, error: String(e) }));
      return { workspace_id: id, ...r };
    })
  );

  const totalSent = results.reduce((s, r) => s + (("sent" in r ? r.sent : 0)), 0);
  console.log(`[cron/send] workspaces=${workspaces.length} totalSent=${totalSent}`);

  return NextResponse.json({ workspaces: workspaces.length, results });
}
