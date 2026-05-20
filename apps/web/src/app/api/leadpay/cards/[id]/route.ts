import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { data: card, error } = await db
    .from("leadpay_cards")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!card)  return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ card });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (card.status === "terminated") {
    return NextResponse.json({ error: "Cannot modify a terminated card" }, { status: 409 });
  }

  const body = await req.json() as { action?: string; label?: string; monthly_limit_cents?: number };
  const action = body.action;

  if (action === "freeze") {
    if (card.status === "frozen") return NextResponse.json({ error: "Already frozen" }, { status: 409 });
    const { data: updated } = await db
      .from("leadpay_cards")
      .update({ status: "frozen", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select().single();
    return NextResponse.json({ card: updated });
  }

  if (action === "unfreeze") {
    if (card.status !== "frozen") return NextResponse.json({ error: "Card is not frozen" }, { status: 409 });
    const { data: updated } = await db
      .from("leadpay_cards")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select().single();
    return NextResponse.json({ card: updated });
  }

  if (action === "terminate") {
    // Refund remaining balance to account
    if (card.balance_cents > 0) {
      const { data: acct } = await db.from("leadpay_accounts")
        .select("usd_balance_cents").eq("workspace_id", workspaceId).maybeSingle();
      if (acct) {
        await db.from("leadpay_accounts").update({
          usd_balance_cents: acct.usd_balance_cents + card.balance_cents,
          updated_at:        new Date().toISOString(),
        }).eq("workspace_id", workspaceId);

        await db.from("leadpay_transactions").insert({
          workspace_id:     workspaceId,
          type:             "refund",
          card_id:          id,
          description:      `Card terminated — ${card.label} balance refunded`,
          usd_amount_cents: card.balance_cents,
          status:           "completed",
          reference:        `LP-CARD-TERM-${id.slice(0, 8)}`,
        });
      }
    }

    const { data: updated } = await db
      .from("leadpay_cards")
      .update({ status: "terminated", balance_cents: 0, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select().single();
    return NextResponse.json({ card: updated });
  }

  // General updates
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.label)               updates.label               = body.label.trim();
  if (body.monthly_limit_cents) updates.monthly_limit_cents = body.monthly_limit_cents;

  const { data: updated, error } = await db
    .from("leadpay_cards")
    .update(updates)
    .eq("id", id)
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: updated });
}
