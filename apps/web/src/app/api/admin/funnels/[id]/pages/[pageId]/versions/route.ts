import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? { db } : null;
}

// GET — list page versions (last 10)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { pageId } = await params;

  const { data, error } = await db
    .from("funnel_page_versions")
    .select("id, version, saved_at, blocks")
    .eq("page_id", pageId)
    .order("version", { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ versions: data ?? [] });
}
