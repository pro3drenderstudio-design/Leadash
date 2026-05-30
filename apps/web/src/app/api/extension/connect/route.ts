import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { hashApiKey } from "@/lib/api/extension-auth";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  // Authenticate via session cookie (no x-workspace-id header required)
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();

  // Find the user's workspace (first owned workspace)
  const { data: member } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "No workspace found for this account." }, { status: 403 });
  }

  const { token } = await req.json().catch(() => ({}));
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const workspaceId = member.workspace_id;
  const rawKey = `ld_live_${randomBytes(32).toString("hex")}`;
  const keyHash = hashApiKey(rawKey);

  // Upsert "Chrome Extension" API key for this workspace
  const { data: existingKey } = await db
    .from("api_keys")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", "Chrome Extension")
    .maybeSingle();

  let apiKeyId: string;
  if (existingKey) {
    await db.from("api_keys").update({ key_hash: keyHash }).eq("id", existingKey.id);
    apiKeyId = existingKey.id;
  } else {
    const { data: newKey } = await db
      .from("api_keys")
      .insert({ workspace_id: workspaceId, name: "Chrome Extension", key_hash: keyHash, created_by: user.id })
      .select("id")
      .single();
    if (!newKey) return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
    apiKeyId = newKey.id;
  }

  // Clear any stale pending auth for this workspace + store new token
  await db.from("extension_pending_auth").delete().eq("workspace_id", workspaceId);
  const { error } = await db.from("extension_pending_auth").insert({
    token,
    workspace_id: workspaceId,
    api_key_raw:  rawKey,
    api_key_id:   apiKeyId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
