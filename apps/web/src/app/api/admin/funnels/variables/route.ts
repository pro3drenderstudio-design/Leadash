import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveFunnelVariableValues } from "@/lib/funnel-blocks/variables";

/** GET — resolved values for funnel merge variables, so the builder's live
 *  preview can show them exactly as the published page will. Admin-only. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ values: {} });
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ values: {} });
  const values = await resolveFunnelVariableValues(db);
  return NextResponse.json({ values });
}
