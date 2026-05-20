import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { data: card } = await db
    .from("leadpay_cards")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!card)  return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (card.status !== "active") {
    return NextResponse.json({ error: "Card must be active to fund" }, { status: 409 });
  }

  const body = await req.json() as { amount_cents?: number };
  const amount = parseInt(String(body.amount_cents ?? 0));
  if (amount <= 0) return NextResponse.json({ error: "amount_cents must be positive" }, { status: 400 });
  if (amount < 100) return NextResponse.json({ error: "Minimum funding is $1.00" }, { status: 400 });

  // Check account balance
  const { data: account } = await db
    .from("leadpay_accounts")
    .select("usd_balance_cents")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!account || account.usd_balance_cents < amount) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 402 });
  }

  // Move funds
  await db.from("leadpay_accounts")
    .update({ usd_balance_cents: account.usd_balance_cents - amount, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId);

  const { data: updated, error } = await db
    .from("leadpay_cards")
    .update({ balance_cents: card.balance_cents + amount, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("leadpay_transactions").insert({
    workspace_id:     workspaceId,
    type:             "card_funding",
    card_id:          id,
    description:      `Card funded — ${card.label}`,
    usd_amount_cents: amount,
    status:           "completed",
    reference:        `LP-CARD-FUND-${id.slice(0, 8)}-${Date.now()}`,
  });

  return NextResponse.json({ card: updated });
}
