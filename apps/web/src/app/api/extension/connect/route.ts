import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { hashApiKey } from "@/lib/api/extension-auth";
import { randomBytes, randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { token } = await req.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const rawKey = `ld_live_${randomBytes(32).toString("hex")}`;
  const keyHash = hashApiKey(rawKey);

  // Upsert API key named "Chrome Extension" (replace if exists with same name)
  const { data: existingKey } = await db
    .from("api_keys")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", "Chrome Extension")
    .maybeSingle();

  let apiKeyId: string;
  if (existingKey) {
    // Rotate existing key
    await db.from("api_keys").update({ key_hash: keyHash }).eq("id", existingKey.id);
    apiKeyId = existingKey.id;
  } else {
    // Determine created_by from workspace owner
    const { data: member } = await db
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("role", "owner")
      .maybeSingle();
    const created_by = member?.user_id ?? "00000000-0000-0000-0000-000000000000";

    const { data: newKey } = await db
      .from("api_keys")
      .insert({ workspace_id: workspaceId, name: "Chrome Extension", key_hash: keyHash, created_by })
      .select("id")
      .single();
    if (!newKey) return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
    apiKeyId = newKey.id;
  }

  // Delete any stale pending auth for this workspace
  await db.from("extension_pending_auth").delete().eq("workspace_id", workspaceId);

  // Store the raw key against the connect token (expires 10 min)
  const { error } = await db.from("extension_pending_auth").insert({
    token,
    workspace_id: workspaceId,
    api_key_raw: rawKey,
    api_key_id: apiKeyId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
