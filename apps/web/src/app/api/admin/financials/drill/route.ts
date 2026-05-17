import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url    = new URL(req.url);
  const type   = url.searchParams.get("type") ?? "";
  const planId = url.searchParams.get("plan_id") ?? "";
  const status = url.searchParams.get("status") ?? "";

  const base = db
    .from("workspaces")
    .select("id, name, slug, plan_id, plan_status, trial_ends_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  let q;
  switch (type) {
    case "plan":
      if (!planId) return NextResponse.json({ error: "plan_id required" }, { status: 400 });
      q = base
        .eq("plan_id", planId)
        .eq("plan_status", "active")
        .is("trial_ends_at", null);
      break;
    case "status":
      if (!status) return NextResponse.json({ error: "status required" }, { status: 400 });
      q = base.eq("plan_status", status).is("trial_ends_at", null);
      break;
    case "beta":
      q = base.not("trial_ends_at", "is", null).neq("plan_id", "free");
      break;
    case "free":
      q = base.eq("plan_id", "free");
      break;
    default:
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ workspaces: data ?? [] });
}
