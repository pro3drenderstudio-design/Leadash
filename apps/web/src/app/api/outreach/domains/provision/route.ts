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

  // ── Hand off to background worker (no timeout constraint) ────────────────────
  await enqueueProvision(domain_record_id, workspaceId);

  return NextResponse.json({ ok: true });
}
