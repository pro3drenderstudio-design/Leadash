/**
 * POST /api/funnel/track-watch
 *
 * Records YouTube watch milestone in funnel_states and fires automation event.
 * Auth required (session cookie). Idempotent — safe to call multiple times.
 *
 * Body: { pct: number; video_id?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { enqueueAutomation } from "@/lib/queue/client";

const VALID_MILESTONES = new Set([25, 50, 75, 100]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pct, video_id } = await req.json() as { pct?: number; video_id?: string };

  if (typeof pct !== "number" || !VALID_MILESTONES.has(pct)) {
    return NextResponse.json({ ok: true }); // Silently ignore invalid milestones
  }

  const db = createAdminClient();

  // Get current watch_pct so we only advance, never go back
  const { data: existing } = await db
    .from("funnel_states")
    .select("free_video_watch_pct, user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const currentPct = (existing?.free_video_watch_pct as number) ?? 0;
  if (pct <= currentPct) return NextResponse.json({ ok: true }); // Already recorded

  // Update funnel_state
  await db.from("funnel_states").upsert(
    { user_id: user.id, free_video_watch_pct: pct },
    { onConflict: "user_id" },
  );

  // Fetch workspace_id for automation context
  const { data: member } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (member?.workspace_id) {
    await enqueueAutomation({
      event:        "user.video_milestone",
      workspace_id: member.workspace_id,
      user_id:      user.id,
      payload: {
        milestone_pct: pct,
        video_id:      video_id ?? null,
      },
    }).catch(err => console.error("[track-watch] automation enqueue error:", err));
  }

  return NextResponse.json({ ok: true, pct });
}
