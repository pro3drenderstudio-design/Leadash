import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runSendBatch } from "@/lib/outreach/send-runner";

export const maxDuration = 300;

// Process this many workspaces concurrently. Keeps DB connections bounded
// and prevents the function from hitting Vercel's memory limit under load.
const WORKSPACE_CHUNK_SIZE = 15;

export async function POST(req: NextRequest) {
  // Verify cron secret (Vercel sets this automatically for cron jobs)
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();

  // Get all active workspaces that have active campaigns
  const { data: activeRows } = await db
    .from("outreach_campaigns")
    .select("workspace_id")
    .eq("status", "active");

  const seen = new Set<string>();
  const workspaceIds: string[] = [];
  for (const row of activeRows ?? []) {
    const id = (row as { workspace_id: string }).workspace_id;
    if (!seen.has(id)) { seen.add(id); workspaceIds.push(id); }
  }
  if (!workspaceIds.length) return NextResponse.json({ workspaces: 0, sent: 0 });

  // Process in chunks so we don't open hundreds of parallel DB connections
  const results: Array<{ workspace_id: string; sent?: number; error?: string }> = [];
  for (let i = 0; i < workspaceIds.length; i += WORKSPACE_CHUNK_SIZE) {
    const chunk = workspaceIds.slice(i, i + WORKSPACE_CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (id: string) => {
        const r = await runSendBatch(id, 50, 1_000, 3_000).catch(e => ({ error: String(e) }));
        return { workspace_id: id, ...r };
      })
    );
    results.push(...chunkResults);
  }

  const totalSent = results.reduce((s, r) => s + (("sent" in r ? (r.sent ?? 0) : 0)), 0);
  console.log(`[cron/send] workspaces=${workspaceIds.length} totalSent=${totalSent}`);

  return NextResponse.json({ workspaces: workspaceIds.length, sent: totalSent, results });
}
