import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createHash } from "crypto";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function requireApiKey(req: Request): Promise<
  | { ok: true; workspaceId: string; db: ReturnType<typeof createAdminClient> }
  | { ok: false; res: NextResponse }
> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Missing Authorization header" }, { status: 401 }),
    };
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Empty API key" }, { status: 401 }),
    };
  }

  const keyHash = hashApiKey(rawKey);
  const db = createAdminClient();

  const { data: apiKey } = await db
    .from("api_keys")
    .select("workspace_id")
    .eq("key_hash", keyHash)
    .single();

  if (!apiKey) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Invalid API key" }, { status: 401 }),
    };
  }

  // Update last_used_at in background (fire-and-forget)
  db.from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("key_hash", keyHash)
    .then(() => {});

  return { ok: true, workspaceId: apiKey.workspace_id, db };
}
