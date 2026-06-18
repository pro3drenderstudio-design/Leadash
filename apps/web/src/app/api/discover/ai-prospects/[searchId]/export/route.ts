import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { creditRateForModel } from "@/lib/discover/ai-prospects-prompt";
import type { AiProspectModel } from "@/lib/discover/ai-prospects-prompt";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ searchId: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { searchId } = await params;

  const body = await req.json();
  const { result_ids, list_id, list_name, campaign_id } = body as {
    result_ids:   string[];
    list_id?:     string;
    list_name?:   string;
    campaign_id?: string;
  };

  if (!Array.isArray(result_ids) || result_ids.length === 0)
    return NextResponse.json({ error: "result_ids required" }, { status: 400 });
  if (!list_id && !list_name && !campaign_id)
    return NextResponse.json({ error: "list_id, list_name, or campaign_id required" }, { status: 400 });

  // Verify search belongs to workspace and get model for rate lookup
  const { data: search } = await db
    .from("ai_prospect_searches")
    .select("id, model, status")
    .eq("id", searchId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!search) return NextResponse.json({ error: "Search not found" }, { status: 404 });

  // Fetch the selected results
  const { data: results } = await db
    .from("ai_prospect_results")
    .select("id, person_name, title, company_name, domain, linkedin_url, best_email, best_email_source, verification_status")
    .eq("search_id", searchId)
    .eq("workspace_id", workspaceId)
    .in("id", result_ids)
    .is("exported_at", null);

  if (!results?.length) return NextResponse.json({ error: "No unexported results found" }, { status: 400 });

  // Credit check
  const rate = creditRateForModel(search.model as AiProspectModel);
  const totalCost = results.length * rate;

  const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single();
  const balance = (ws?.lead_credits_balance as number) ?? 0;
  if (balance < totalCost) {
    return NextResponse.json({ error: "Insufficient credits", balance, required: totalCost }, { status: 402 });
  }

  // Resolve list ID
  let resolvedListId: string | null = list_id ?? null;
  if (!resolvedListId && list_name) {
    const { data: existing } = await db
      .from("outreach_lists")
      .select("id")
      .eq("workspace_id", workspaceId)
      .ilike("name", list_name)
      .maybeSingle();
    if (existing) {
      resolvedListId = existing.id;
    } else {
      const { data: newList } = await db
        .from("outreach_lists")
        .insert({ workspace_id: workspaceId, name: list_name })
        .select("id")
        .single();
      resolvedListId = newList?.id ?? null;
    }
  }

  if (!resolvedListId && !campaign_id) {
    return NextResponse.json({ error: "Failed to resolve list" }, { status: 500 });
  }

  type ResultRow = { id: string; person_name: string | null; title: string | null; company_name: string | null; domain: string | null; linkedin_url: string | null; best_email: string | null; best_email_source: string | null; verification_status: string | null };
  // Build lead rows — skip results with no email
  const leadsWithEmail = (results as ResultRow[]).filter(r => r.best_email);
  const leads = leadsWithEmail.map(r => {
    const [firstName, ...rest] = (r.person_name ?? "").split(" ");
    return {
      workspace_id:        workspaceId,
      list_id:             resolvedListId,
      email:               r.best_email!.toLowerCase(),
      first_name:          firstName || null,
      last_name:           rest.join(" ") || null,
      title:               r.title ?? null,
      company:             r.company_name ?? null,
      linkedin_url:        r.linkedin_url ?? null,
      status:              "active",
      verification_status: r.verification_status ?? "pending",
    };
  });

  // Deduct credits
  const { error: deductErr } = await db.rpc("deduct_lead_credits", {
    p_workspace_id: workspaceId,
    p_amount:       totalCost,
  });
  if (deductErr) return NextResponse.json({ error: "Failed to deduct credits" }, { status: 500 });

  // Log transaction
  await db.from("lead_credit_transactions").insert({
    workspace_id: workspaceId,
    type:         "debit",
    amount:       -totalCost,
    description:  `AI Prospect Export — ${results.length} leads`,
  });

  // Upsert to outreach_leads
  const { data: inserted, error: insertErr } = await db
    .from("outreach_leads")
    .upsert(leads, { onConflict: "workspace_id,email", ignoreDuplicates: true })
    .select("id, email");

  if (insertErr) {
    console.error("[ai-prospects/export]", insertErr.message);
    return NextResponse.json({ error: "Failed to insert leads" }, { status: 500 });
  }

  // Mark results as exported
  const exportedLeadEmailMap = new Map((inserted ?? []).map((l: { id: string; email: string }) => [l.email, l.id]));
  const now = new Date().toISOString();

  await Promise.all(
    leadsWithEmail.map(r =>
      db.from("ai_prospect_results").update({
        exported_at: now,
        lead_id: exportedLeadEmailMap.get(r.best_email!.toLowerCase()) ?? null,
      }).eq("id", r.id),
    ),
  );

  // If campaign_id provided, enroll leads
  if (campaign_id && inserted?.length) {
    const { data: existing } = await db
      .from("outreach_enrollments")
      .select("lead_id")
      .eq("campaign_id", campaign_id);
    const enrolledIds = new Set((existing ?? []).map((e: { lead_id: string }) => e.lead_id));

    const toEnroll = (inserted ?? []).filter((l: { id: string }) => !enrolledIds.has(l.id));
    if (toEnroll.length > 0) {
      await db.from("outreach_enrollments").insert(
        toEnroll.map((l: { id: string }) => ({
          workspace_id: workspaceId,
          campaign_id,
          lead_id:      l.id,
          ab_variant:   Math.random() < 0.5 ? "a" : "b",
        })),
      );
    }
  }

  return NextResponse.json({
    ok:           true,
    exported:     inserted?.length ?? 0,
    credits_used: totalCost,
    list_id:      resolvedListId,
    campaign_id:  campaign_id ?? null,
  });
}
