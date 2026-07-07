import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * Verify the caller is a platform admin. All finance routes gate through this
 * — mirrors the pattern used in /api/admin/beta and other admin endpoints.
 * Returns null when unauthorized so the caller can `NextResponse.json({...}, {status: 403})`.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, db };
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
