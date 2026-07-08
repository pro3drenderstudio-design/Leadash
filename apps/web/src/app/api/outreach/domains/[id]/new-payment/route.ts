import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createPaystackCheckout } from "@/lib/billing/paystack";
import { getPlanById } from "@/lib/billing/getActivePlans";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const [{ data: domain }, { data: workspace }] = await Promise.all([
    db
      .from("outreach_domains")
      .select("id, domain, status, payment_provider, paystack_billing_email, mailbox_count, inbox_next_billing_date")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single(),
    db
      .from("workspaces")
      .select("billing_email, plan_id")
      .eq("id", workspaceId)
      .single(),
  ]);

  if (!domain) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (domain.payment_provider !== "paystack") {
    return NextResponse.json({ error: "Card updates are only supported for Paystack billing. Manage your Stripe subscription from the billing portal." }, { status: 400 });
  }

  const isOverdue = domain.status === "active"
    && domain.inbox_next_billing_date
    && new Date(domain.inbox_next_billing_date as string) < new Date();

  if (domain.status !== "payment_failed" && !isOverdue) {
    return NextResponse.json({ error: "Domain does not have a failed or overdue payment" }, { status: 400 });
  }

  const mailboxCount = (domain.mailbox_count as number | null) ?? 1;
  if (mailboxCount < 1) {
    return NextResponse.json({ error: "Domain has no inboxes configured" }, { status: 400 });
  }

  // Always recalculate from current mailbox_count × plan rate so stale stored values can't cause undercharges
  const plan = await getPlanById(workspace?.plan_id ?? "free");
  const correctAmountKobo = mailboxCount * plan.inbox_monthly_price_ngn * 100;

  // Sync the stored value so the cron job stays correct too
  await db
    .from("outreach_domains")
    .update({ paystack_inbox_monthly_kobo: correctAmountKobo, updated_at: new Date().toISOString() })
    .eq("id", id);

  const billingEmail = (domain.paystack_billing_email as string | null)
    ?? workspace?.billing_email
    ?? `workspace-${workspaceId}@leadash.com`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const callbackUrl = `${appUrl}/inboxes?tab=domains&update_payment_domain=${id}`;

  try {
    const { authorizationUrl, reference } = await createPaystackCheckout({
      email:       billingEmail,
      amountKobo:  correctAmountKobo,
      callbackUrl,
      metadata:    { domain_id: id, workspace_id: workspaceId, type: "inbox_update_payment" },
    });

    return NextResponse.json({ checkout_url: authorizationUrl, reference });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[new-payment] checkout init failed domain=${id}:`, msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
