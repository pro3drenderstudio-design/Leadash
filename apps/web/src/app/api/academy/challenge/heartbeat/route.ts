/**
 * POST /api/academy/challenge/heartbeat
 *
 * Pinged by the app shell every few minutes while a tab is open. Awards a
 * "login" point once per WAT day and an "active_time" point per 5-minute bucket
 * (both capped in points_rules). No-op for anyone not in a live challenge cohort.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { awardChallengePoints } from "@/lib/academy/points";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { db, workspaceId, userId } = auth;

  const watDay = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }); // YYYY-MM-DD
  const bucket = Math.floor(Date.now() / 300_000); // 5-min bucket

  await awardChallengePoints(db, { userId, workspaceId, action: "login", ref: `login:${watDay}` });
  await awardChallengePoints(db, { userId, workspaceId, action: "active_time", ref: `active:${watDay}:${bucket}` });

  return NextResponse.json({ ok: true });
}
