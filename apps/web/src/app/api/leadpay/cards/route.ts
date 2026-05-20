import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data: cards, error } = await db
    .from("leadpay_cards")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: cards ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json() as Record<string, unknown>;
  const label         = (body.label as string | undefined)?.trim();
  const fundingCents  = parseInt(String(body.funding_cents ?? "0"));
  const monthlyLimit  = body.monthly_limit_cents ? parseInt(String(body.monthly_limit_cents)) : null;

  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });

  // Check KYC and account
  const { data: account } = await db
    .from("leadpay_accounts")
    .select("usd_balance_cents, kyc_status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!account) return NextResponse.json({ error: "LeadPay account not found" }, { status: 404 });
  if (account.kyc_status !== "verified") {
    return NextResponse.json({ error: "KYC verification required" }, { status: 403 });
  }

  // Card limits
  const { data: maxRow } = await db
    .from("admin_settings").select("value").eq("key", "leadpay_card_max_per_user").maybeSingle();
  const maxCards = maxRow?.value ? parseInt(String(maxRow.value)) : 5;

  const { count: activeCards } = await db
    .from("leadpay_cards").select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId).neq("status", "terminated");

  if ((activeCards ?? 0) >= maxCards) {
    return NextResponse.json({ error: `Maximum ${maxCards} active cards allowed` }, { status: 400 });
  }

  // Creation fee
  const { data: feeRow } = await db
    .from("admin_settings").select("value").eq("key", "leadpay_card_creation_fee_cents").maybeSingle();
  const creationFee = feeRow?.value ? parseInt(String(feeRow.value)) : 500;

  const totalDebit = creationFee + (fundingCents > 0 ? fundingCents : 0);
  if (account.usd_balance_cents < totalDebit) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 402 });
  }

  // Deduct balance
  await db.from("leadpay_accounts")
    .update({ usd_balance_cents: account.usd_balance_cents - totalDebit, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId);

  const { data: card, error } = await db
    .from("leadpay_cards")
    .insert({
      workspace_id:        workspaceId,
      label,
      status:              "active",
      balance_cents:       fundingCents > 0 ? fundingCents : 0,
      monthly_limit_cents: monthlyLimit,
      creation_fee_cents:  creationFee,
      // provider_card_id / last_four / expiry filled when card issued by provider
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log fee transaction
  await db.from("leadpay_transactions").insert({
    workspace_id:     workspaceId,
    type:             "fee",
    card_id:          card.id,
    description:      `Card creation fee — ${label}`,
    usd_amount_cents: creationFee,
    status:           "completed",
    reference:        `LP-CARD-FEE-${card.id.slice(0, 8)}`,
  });

  if (fundingCents > 0) {
    await db.from("leadpay_transactions").insert({
      workspace_id:     workspaceId,
      type:             "card_funding",
      card_id:          card.id,
      description:      `Initial funding — ${label}`,
      usd_amount_cents: fundingCents,
      status:           "completed",
      reference:        `LP-CARD-FUND-${card.id.slice(0, 8)}-init`,
    });
  }

  return NextResponse.json({ card }, { status: 201 });
}
