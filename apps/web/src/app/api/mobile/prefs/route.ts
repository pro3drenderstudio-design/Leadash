/**
 * GET   /api/mobile/prefs — the caller's notification preferences (defaults if unset).
 * PATCH /api/mobile/prefs — partial upsert of preferences.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

const DEFAULTS = {
  replies_enabled:    true,
  positive_only:      false,
  milestones_enabled: true,
  health_enabled:     true,
  quiet_hours_start:  null as number | null,
  quiet_hours_end:    null as number | null,
  timezone:           null as string | null,
};

const ALLOWED_KEYS = Object.keys(DEFAULTS);

export async function GET(req: NextRequest) {
  const ctx = await requireWorkspace(req);
  if (!ctx.ok) return ctx.res;
  const { workspaceId, userId, db } = ctx;

  const { data } = await db
    .from("mobile_notification_prefs")
    .select("*")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  return NextResponse.json({ prefs: data ?? { ...DEFAULTS, user_id: userId, workspace_id: workspaceId } });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireWorkspace(req);
  if (!ctx.ok) return ctx.res;
  const { workspaceId, userId, db } = ctx;

  const body = await req.json() as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    if (key in body) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid preference fields in body" }, { status: 400 });
  }

  const { data, error } = await db
    .from("mobile_notification_prefs")
    .upsert({
      user_id:      userId,
      workspace_id: workspaceId,
      ...updates,
      updated_at:   new Date().toISOString(),
    }, { onConflict: "user_id,workspace_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prefs: data });
}
