import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const url     = new URL(req.url);
  const listId  = url.searchParams.get("list_id");
  const page    = parseInt(url.searchParams.get("page") ?? "0");
  const limit   = parseInt(url.searchParams.get("limit") ?? "100");
  const search  = url.searchParams.get("search") ?? "";

  let query = db
    .from("outreach_leads")
    .select("id, list_id, email, first_name, last_name, company, title, website, status, created_at", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(page * limit, page * limit + limit - 1);

  if (listId) query = query.eq("list_id", listId);
  if (search) query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%`);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leads: data, total: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json();

  // ── Outreach leads pool limit ────────────────────────────────────────────
  {
    const { data: ws } = await db
      .from("workspaces")
      .select("plan_id")
      .eq("id", workspaceId)
      .single();

    const planId = ws?.plan_id ?? "free";
    const { getPlan } = await import("@/lib/billing/plans");
    const { data: planConfig } = await db
      .from("plan_configs")
      .select("max_leads_pool")
      .eq("plan_id", planId)
      .maybeSingle();

    const plan = getPlan(planId);
    const maxPool: number = planConfig?.max_leads_pool ?? plan.maxLeadsPool;

    if (maxPool === 0) {
      return NextResponse.json(
        { error: "Outreach leads require a paid plan." },
        { status: 403 },
      );
    }

    if (maxPool > 0) {
      const { count } = await db
        .from("outreach_leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);

      if ((count ?? 0) >= maxPool) {
        return NextResponse.json(
          { error: `Outreach leads pool full (${maxPool.toLocaleString()} leads). Delete unused leads or upgrade your plan.` },
          { status: 403 },
        );
      }
    }
  }

  // Check unsubscribe list
  const { data: unsub } = await db
    .from("outreach_unsubscribes")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("email", body.email)
    .single();

  if (unsub) return NextResponse.json({ error: "Email is on the unsubscribe list" }, { status: 422 });

  const { data, error } = await db.from("outreach_leads").insert({
    workspace_id:  workspaceId,
    list_id:       body.list_id,
    email:         body.email,
    first_name:    body.first_name ?? null,
    last_name:     body.last_name ?? null,
    company:       body.company ?? null,
    title:         body.title ?? null,
    website:       body.website ?? null,
    custom_fields: body.custom_fields ?? {},
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
