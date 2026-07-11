/**
 * POST   /api/mobile/devices — register/refresh an Expo push token for this
 *                              user + workspace (called on login/app-foreground).
 * DELETE /api/mobile/devices — remove a token (called on logout).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

interface RegisterBody {
  expo_push_token: string;
  platform:        "ios" | "android";
  device_name?:    string;
}

export async function POST(req: NextRequest) {
  const ctx = await requireWorkspace(req);
  if (!ctx.ok) return ctx.res;
  const { workspaceId, userId, db } = ctx;

  const body = await req.json() as RegisterBody;
  if (!body.expo_push_token || !["ios", "android"].includes(body.platform)) {
    return NextResponse.json({ error: "expo_push_token and platform (ios|android) are required" }, { status: 400 });
  }

  const { error } = await db
    .from("mobile_device_tokens")
    .upsert({
      user_id:         userId,
      workspace_id:    workspaceId,
      expo_push_token: body.expo_push_token,
      platform:        body.platform,
      device_name:     body.device_name ?? null,
      last_active_at:  new Date().toISOString(),
    }, { onConflict: "expo_push_token,workspace_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireWorkspace(req);
  if (!ctx.ok) return ctx.res;
  const { workspaceId, db } = ctx;

  const body = await req.json() as { expo_push_token?: string };
  if (!body.expo_push_token) {
    return NextResponse.json({ error: "expo_push_token is required" }, { status: 400 });
  }

  await db
    .from("mobile_device_tokens")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("expo_push_token", body.expo_push_token);

  return NextResponse.json({ ok: true });
}
