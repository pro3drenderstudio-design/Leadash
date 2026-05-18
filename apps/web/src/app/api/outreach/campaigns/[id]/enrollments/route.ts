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

  const url    = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";

  const { list_ids, statuses: requestedStatuses } =
    await req.json() as { list_ids: string[]; statuses?: string[] };
  if (!list_ids?.length) return NextResponse.json({ error: "list_ids required" }, { status: 400 });

  // These are never allowed regardless of what the caller requests
  const BLOCKED   = new Set(["invalid", "dangerous", "disposable"]);
  const ALLOWED_VSTATUS = ["safe", "valid", "catch_all", "verified_external"];

  // Fetch all leads across pages (PostgREST caps at 1000 rows per request)
  type LeadRow = { id: string; verification_status: string | null };
  const typedLeads: LeadRow[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data: page, error: pageErr } = await db
      .from("outreach_leads")
      .select("id, verification_status")
      .eq("workspace_id", workspaceId)
      .in("list_id", list_ids)
      .eq("status", "active")
      .range(from, from + PAGE - 1);
    if (pageErr) return NextResponse.json({ error: pageErr.message }, { status: 500 });
    if (!page?.length) break;
    typedLeads.push(...(page as LeadRow[]));
    if (page.length < PAGE) break;
    from += PAGE;
  }

  if (!typedLeads.length) return NextResponse.json({ enrolled: 0, new_count: 0, duplicate_count: 0, skipped_unverified: 0 });

  // Per-status counts across ALL leads in the list (for the modal to display)
  const statusCounts: Record<string, number> = {};
  for (const l of typedLeads) {
    const s = l.verification_status ?? "pending";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  // Already-enrolled leads in this campaign
  const { data: existing } = await db
    .from("outreach_enrollments")
    .select("lead_id")
    .eq("campaign_id", campaignId);
  const enrolledIds = new Set((existing ?? []).map((e: { lead_id: string }) => e.lead_id));

  // Already-enrolled count per status (for the modal live counter)
  const alreadyEnrolledByStatus: Record<string, number> = {};
  for (const l of typedLeads) {
    if (enrolledIds.has(l.id)) {
      const s = l.verification_status ?? "pending";
      alreadyEnrolledByStatus[s] = (alreadyEnrolledByStatus[s] ?? 0) + 1;
    }
  }

  // Determine eligible leads
  let eligibleLeads: LeadRow[];
  if (requestedStatuses?.length) {
    // Caller explicitly chose statuses — honour them, minus blocked
    const allowed = new Set(requestedStatuses.filter(s => !BLOCKED.has(s)));
    eligibleLeads = typedLeads.filter(l => allowed.has(l.verification_status ?? "pending"));
  } else {
    // Legacy: use verified_only from campaign setting
    const { data: campaign } = await db
      .from("outreach_campaigns").select("verified_only")
      .eq("id", campaignId).eq("workspace_id", workspaceId).single();
    const verifiedOnly = campaign?.verified_only ?? true;
    eligibleLeads = verifiedOnly
      ? typedLeads.filter(l => ALLOWED_VSTATUS.includes(l.verification_status ?? ""))
      : typedLeads.filter(l => !BLOCKED.has(l.verification_status ?? ""));
  }

  const skippedCount = typedLeads.length - eligibleLeads.length;
  const toEnroll     = eligibleLeads.filter(l => !enrolledIds.has(l.id));
  const duplicates   = eligibleLeads.length - toEnroll.length;

  // Dry-run: return counts without inserting
  if (dryRun) {
    return NextResponse.json({
      status_counts:            statusCounts,
      already_enrolled_by_status: alreadyEnrolledByStatus,
      new_count:                toEnroll.length,
      duplicate_count:          duplicates,
      skipped_unverified:       skippedCount,
      total:                    leads.length,
    });
  }

  if (!toEnroll.length) {
    return NextResponse.json({
      enrolled:           0,
      new_count:          0,
      duplicate_count:    duplicates,
      skipped_unverified: skippedCount,
    });
  }

  const rows = toEnroll.map((l: { id: string }) => ({
    workspace_id: workspaceId,
    campaign_id:  campaignId,
    lead_id:      l.id,
    ab_variant:   Math.random() < 0.5 ? "a" : "b",
  }));

  // Insert in chunks to avoid Supabase payload limits
  let insertedCount = 0;
  for (let i = 0; i < rows.length; i += PAGE) {
    const chunk = rows.slice(i, i + PAGE);
    const { data: ins, error: insErr } = await db.from("outreach_enrollments").insert(chunk).select("id");
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    insertedCount += ins?.length ?? 0;
  }

  return NextResponse.json({
    enrolled:           insertedCount,
    new_count:          insertedCount,
    duplicate_count:    duplicates,
    skipped_unverified: skippedCount,
  });
}
