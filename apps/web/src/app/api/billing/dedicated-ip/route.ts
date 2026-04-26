/**
 * GET  /api/billing/dedicated-ip  — workspace's active dedicated IP subscription + latest blacklist check
 * POST /api/billing/dedicated-ip  — initiate Paystack checkout for dedicated IP add-on
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createPaystackCheckout } from "@/lib/billing/paystack";

const DEDICATED_IP_PRICE_NGN = 78_400; // ~$49/month

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data: sub } = await db
    .from("dedicated_ip_subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .not("status", "eq", "cancelled")
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (!sub) return NextResponse.json({ subscription: null });

  // Latest blacklist check
  const { data: latestCheck } = await db
    .from("dedicated_ip_blacklist_checks")
    .select("*")
    .eq("subscription_id", sub.id)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Domain count linked to this subscription
  const { count: domainCount } = await db
    .from("outreach_domains")
    .select("id", { count: "exact", head: true })
    .eq("dedicated_ip_subscription_id", sub.id);

  return NextResponse.json({
    subscription:  sub,
    latestCheck,
    domainCount:   domainCount ?? 0,
    maxDomains:    sub.max_domains,
    maxInboxes:    sub.max_inboxes,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  // Prevent duplicate active subscriptions
  const { data: existing } = await db
    .from("dedicated_ip_subscriptions")
    .select("id, status")
    .eq("workspace_id", workspaceId)
    .in("status", ["pending", "active", "cancelling"])
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "You already have an active dedicated IP subscription." },
      { status: 409 },
    );
  }

  const { data: workspace } = await db
    .from("workspaces")
    .select("billing_email, name, plan_id")
    .eq("id", workspaceId)
    .single();

  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (workspace.plan_id === "free") {
    return NextResponse.json(
      { error: "Upgrade to a paid plan before adding a dedicated IP." },
      { status: 403 },
    );
  }

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
  const email  = workspace.billing_email ?? `ws-${workspaceId}@leadash.app`;

  try {
    const { authorizationUrl } = await createPaystackCheckout({
      email,
      amountKobo:  DEDICATED_IP_PRICE_NGN * 100,
      callbackUrl: `${origin}/settings?tab=infrastructure&billing=dedicated_ip_success`,
      metadata: {
        workspace_id: workspaceId,
        type:         "dedicated_ip",
      },
    });
    return NextResponse.json({ url: authorizationUrl });
  } catch (err) {
    console.error("[billing/dedicated-ip checkout]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Payment initialization failed" },
      { status: 502 },
    );
  }
}
