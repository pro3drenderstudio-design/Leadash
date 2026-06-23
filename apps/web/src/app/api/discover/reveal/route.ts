import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import { getPlanById } from "@/lib/billing/getActivePlans";
import leadsDb from "@/lib/postgres/leads-db";

import { getCreditRates } from "@/lib/lead-campaigns/credit-rates";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  // Plan gate
  const { data: wsRow } = await db.from("workspaces").select("plan_id, trial_ends_at").eq("id", workspaceId).single();
  const planId = wsRow?.plan_id ?? "free";
  const trialExpired = planId === "free" && wsRow?.trial_ends_at && new Date(wsRow.trial_ends_at) < new Date();
  if (!trialExpired) {
    const plan = await getPlanById(planId);
    if (!plan.can_scrape_leads) {
      return NextResponse.json(
        { error: "Discover reveal requires a paid plan. Upgrade to reveal lead details." },
        { status: 403 },
      );
    }
  } else {
    return NextResponse.json(
      { error: "Lead reveal requires credits or a paid plan. Buy credits or upgrade to reveal lead details." },
      { status: 403 },
    );
  }

  const { ids } = await req.json() as { ids: string[] };
  if (!Array.isArray(ids) || !ids.length)
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  if (ids.length > 500)
    return NextResponse.json({ error: "Max 500 per reveal" }, { status: 400 });

  const adminDb = createAdminClient();

  // Check which are already revealed (free)
  const { data: existing } = await adminDb
    .from("discover_reveals")
    .select("person_id, email, email_alts, phone, email_status")
    .eq("workspace_id", workspaceId)
    .in("person_id", ids);

  type RevealRow = { person_id: string; email: string | null; email_alts: string[] | null; phone: string | null; email_status: string | null };
  const alreadyRevealed = new Map<string, { email: string | null; email_alts: string[] | null; phone: string | null; email_status: string | null }>(
    (existing ?? []).map((r: RevealRow) =>
      [r.person_id, { email: r.email, email_alts: r.email_alts, phone: r.phone, email_status: r.email_status }]
    )
  );

  const newIds = ids.filter(id => !alreadyRevealed.has(id));
  const { discover: rateDiscover } = await getCreditRates();
  const totalCost = Math.ceil(newIds.length * rateDiscover * 10) / 10;

  // Credit check
  if (newIds.length > 0) {
    const { data: ws } = await adminDb
      .from("workspaces")
      .select("lead_credits_balance")
      .eq("id", workspaceId)
      .single();

    const balance = (ws?.lead_credits_balance as number) ?? 0;
    if (balance < totalCost)
      return NextResponse.json({ error: "Insufficient credits", balance, required: totalCost }, { status: 402 });
  }

  // Fetch full data from VPS for new IDs
  const reveals: Record<string, { email: string | null; email_alts: string[] | null; phone: string | null; email_status: string | null }> = {};

  // Populate already-revealed ones first
  for (const [id, data] of alreadyRevealed) reveals[id] = data;

  if (newIds.length > 0) {
    const placeholders = newIds.map((_, i) => `$${i + 1}`).join(", ");
    type Row = { id: string; email: string | null; email_alts: string[] | null; phone: string | null; email_status: string | null };
    const rows = await leadsDb.unsafe<Row[]>(
      `SELECT id, email, email_alts, phone, email_status FROM discover_people WHERE id IN (${placeholders})`,
      newIds as never[]
    );

    const newRevealRows = rows.map(r => ({
      workspace_id: workspaceId,
      person_id:    r.id,
      email:        r.email ?? null,
      email_alts:   r.email_alts ?? null,
      phone:        r.phone ?? null,
      email_status: r.email_status ?? null,
    }));

    if (newRevealRows.length > 0) {
      await adminDb.from("discover_reveals").upsert(newRevealRows, { onConflict: "workspace_id,person_id", ignoreDuplicates: true });
    }

    for (const r of rows) {
      reveals[r.id] = { email: r.email, email_alts: r.email_alts, phone: r.phone, email_status: r.email_status };
    }

    // Deduct credits and log
    if (totalCost > 0) {
      await Promise.all([
        adminDb.rpc("deduct_lead_credits", { p_workspace_id: workspaceId, p_amount: totalCost }),
        adminDb.from("lead_credit_transactions").insert({
          workspace_id: workspaceId,
          type:         "debit",
          amount:       totalCost,
          description:  `Discover reveal — ${newIds.length} lead${newIds.length !== 1 ? "s" : ""} (${rateDiscover} credits each)`,
        }),
      ]);
    }
  }

  return NextResponse.json({
    reveals,
    credits_used:     totalCost,
    already_revealed: alreadyRevealed.size,
  });
}
