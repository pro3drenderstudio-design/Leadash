import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ status: "pending" });

  const db = createAdminClient();

  const { data } = await db
    .from("extension_pending_auth")
    .select("api_key_raw, expires_at")
    .eq("token", token)
    .single();

  if (!data) return NextResponse.json({ status: "pending" });

  if (new Date(data.expires_at) < new Date()) {
    await db.from("extension_pending_auth").delete().eq("token", token);
    return NextResponse.json({ status: "expired" });
  }

  // Consume — delete row and return the key
  await db.from("extension_pending_auth").delete().eq("token", token);
  return NextResponse.json({ status: "connected", key: data.api_key_raw });
}
