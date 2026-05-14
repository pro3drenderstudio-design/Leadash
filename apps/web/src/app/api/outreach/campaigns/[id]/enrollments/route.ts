import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { getPlanById } from "@/lib/billing/getActivePlans";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id: campaignId } = await params;

  const url    = new URL(req.url);
  const page   = parseInt(url.searchParams.get("page") ?? "0");
  const limit  = parseInt(url.searchParams.get("limit") ?? "50");
  const status = url.searchParams.get("status");

  let query = db
    .from("outreach_enrollments")
    .select("id, status, current_step, next_send_at, ab_variant, enrolled_at, lead:outreach_leads!lead_id(id, email, first_name, last_name, company, title)", { count: "exact" })
    .eq("campaign_id", campaignId)
    .eq("workspace_id", workspaceId)
    .order("enrolled_at", { ascending: false })
    .range(page * limit, page * limit + limit - 1);

  if (status) query = query.eq("status", status);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enrollments: data, total: count ?? 0 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id: campaignId } = await params;

  // Plan gate — free plan cannot run campaigns
  const { data: wsRow } = await db.from("workspaces").select("plan_id, trial_ends_at").eq("id", workspaceId).single();
  const planId = wsRow?.plan_id ?? "free";
  const trialExpired = wsRow?.trial_ends_at && new Date(wsRow.trial_ends_at) < new Date();
  if (trialExpired || planId === "free") {
    return NextResponse.json(
      { error: "Campaigns require a paid plan. Upgrade to enroll leads." },
      { status: 403 },
    );
  }
  const plan = await getPlanById(planId);
  if (!plan.can_run_campaigns) {
    return NextResponse.json(
      { error: "Your current plan does not include campaigns. Upgrade to enroll leads." },
      { status: 403 },
    );
  }

  const url     = new URL(req.url);
  const dryRun  = url.searchParams.get("dry_run") === "1";

  const { list_ids } = await req.json() as { list_ids: string[] };
  if (!list_ids?.length) return NextResponse.json({ error: "list_ids required" }, { status: 400 });

  // Fetch campaign to check verified_only setting
  const { data: campaign } = await db
    .from("outreach_campaigns")
    .select("verified_only")
    .eq("id", campaignId)
    .eq("workspace_id", workspaceId)
    .single();
  const verifiedOnly = campaign?.verified_only ?? true;

  const ALLOWED_VSTATUS = ["safe", "valid", "catch_all", "verified_external"];

  // Get leads from those lists
  const { data: leads } = await db
    .from("outreach_leads")
    .select("id, verification_status")
    .eq("workspace_id", workspaceId)
    .in("list_id", list_ids)
    .eq("status", "active");

  if (!leads?.length) return NextResponse.json({ enrolled: 0, new_count: 0, duplicate_count: 0, skipped_unverified: 0 });

  type LeadRow = { id: string; verification_status: string };
  const typedLeads = leads as LeadRow[];

  // Filter out unverified leads if verified_only is set
  const unverifiedIds = verifiedOnly
    ? typedLeads.filter(l => !ALLOWED_VSTATUS.includes(l.verification_status)).map(l => l.id)
    : [];
  const eligibleLeads = verifiedOnly
    ? typedLeads.filter(l => ALLOWED_VSTATUS.includes(l.verification_status))
    : typedLeads;

  // List of already enrolled leads in this campaign
  const { data: existing } = await db
    .from("outreach_enrollments")
    .select("lead_id")
    .eq("campaign_id", campaignId);

  const enrolledIds = new Set((existing ?? []).map((e: { lead_id: string }) => e.lead_id));
  const toEnroll    = eligibleLeads.filter(l => !enrolledIds.has(l.id));
  const duplicates  = eligibleLeads.length - toEnroll.length;

  // Dry-run: return counts without inserting
  if (dryRun) {
    return NextResponse.json({
      new_count:         toEnroll.length,
      duplicate_count:   duplicates,
      skipped_unverified: unverifiedIds.length,
      total:             leads.length,
    });
  }

  if (!toEnroll.length) {
    return NextResponse.json({
      enrolled:           0,
      new_count:          0,
      duplicate_count:    duplicates,
      skipped_unverified: unverifiedIds.length,
    });
  }

  const rows = toEnroll.map((l: { id: string }) => ({
    workspace_id: workspaceId,
    campaign_id:  campaignId,
    lead_id:      l.id,
    ab_variant:   Math.random() < 0.5 ? "a" : "b",
  }));

  const { data: inserted, error } = await db.from("outreach_enrollments").insert(rows).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    enrolled:           inserted?.length ?? 0,
    new_count:          inserted?.length ?? 0,
    duplicate_count:    duplicates,
    skipped_unverified: unverifiedIds.length,
  });
}
