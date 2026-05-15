import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { requireWorkspace } from "@/lib/api/workspace";
import { verifyPaystackPayment } from "@/lib/billing/paystack";
import { enqueueProvision } from "@/lib/queue";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { domain_record_id, stripe_session_id, paystack_reference } = await req.json() as {
    domain_record_id:    string;
    stripe_session_id?:  string;
    paystack_reference?: string;
  };

  if (!domain_record_id) {
    return NextResponse.json({ error: "domain_record_id is required" }, { status: 400 });
  }

  const { data: domainRecord } = await db
    .from("outreach_domains")
    .select("*")
    .eq("id", domain_record_id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domainRecord) {
    return NextResponse.json({ error: "Domain record not found" }, { status: 404 });
  }

  if (domainRecord.status === "active") {
    return NextResponse.json({ ok: true, status: "active" });
  }

  // ── Verify payment before handing off to worker ──────────────────────────────
  const provider = domainRecord.payment_provider ?? "stripe";

  if (provider === "stripe") {
    const session_id = stripe_session_id ?? domainRecord.stripe_session_id;
    if (!session_id) return NextResponse.json({ error: "No Stripe session ID available" }, { status: 400 });
    const session = await getStripe().checkout.sessions.retrieve(session_id, { expand: ["subscription"] });
    const isPaid =
      session.payment_status === "paid" ||
      (session.mode === "subscription" &&
        (session.status === "complete" ||
          (typeof session.subscription === "object" &&
            session.subscription !== null &&
            ["active", "trialing"].includes((session.subscription as { status: string }).status))));
    if (!isPaid) return NextResponse.json({ error: "Payment not completed" }, { status: 402 });
  } else {
    const ref = paystack_reference ?? domainRecord.paystack_reference;
    if (!ref) return NextResponse.json({ error: "No Paystack reference available" }, { status: 400 });
    if (ref !== "free") {
      const { paid } = await verifyPaystackPayment(ref);
      if (!paid) return NextResponse.json({ error: "Payment not completed" }, { status: 402 });
    }
  }

  // ── Create placeholder inboxes (visible immediately on /inboxes) ─────────────
  const { count: existingInboxCount } = await db
    .from("outreach_inboxes")
    .select("id", { count: "exact", head: true })
    .eq("domain_id", domain_record_id);

  if (!existingInboxCount) {
    const explicitPrefixes = Array.isArray(domainRecord.mailbox_prefixes)
      ? domainRecord.mailbox_prefixes as string[]
      : null;
    const logins = explicitPrefixes
      ?? Array.from(
           { length: (domainRecord.mailbox_count as number) ?? 1 },
           (_, i) => `${(domainRecord.mailbox_prefix as string) ?? "inbox"}${i + 1}`,
         );
    await db.from("outreach_inboxes").insert(
      logins.map(login => ({
        workspace_id:     workspaceId,
        domain_id:        domain_record_id,
        label:            `${login}@${domainRecord.domain}`,
        email_address:    `${login}@${domainRecord.domain}`,
        provider:         "smtp",
        status:           "pending",
        daily_send_limit: 0,
        warmup_enabled:   false,
        first_name:       domainRecord.first_name ?? null,
        last_name:        domainRecord.last_name  ?? null,
      })),
    );
  }

  // ── Hand off domain purchase + provisioning to the VPS worker ───────────────
  await db
    .from("outreach_domains")
    .update({ status: "purchasing", error_message: null, updated_at: new Date().toISOString() })
    .eq("id", domain_record_id);

  await enqueueProvision(domain_record_id, workspaceId);

  return NextResponse.json({ ok: true });
}
