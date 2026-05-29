import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createClient } from "@/lib/supabase/server";
import { hashApiKey } from "@/lib/api/extension-auth";
import { randomBytes } from "crypto";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data, error } = await db
    .from("api_keys")
    .select("id, name, last_used_at, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Key name is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawKey = `ld_live_${randomBytes(32).toString("hex")}`;
  const keyHash = hashApiKey(rawKey);

  const { data, error } = await db
    .from("api_keys")
    .insert({
      workspace_id: workspaceId,
      name: name.trim(),
      key_hash: keyHash,
      created_by: user.id,
    })
    .select("id, name, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...data, raw_key: rawKey }, { status: 201 });
}
