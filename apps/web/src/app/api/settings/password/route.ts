import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const { password } = await req.json();
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
