/**
 * POST /api/funnel/checkout-bundle
 *
 * Initiates a Paystack SUBSCRIPTION checkout for the ₦250k annual bundle.
 * Guard: user must be enrolled in challenge-30 AND have completed Day 1.
 * The subscription plan code is resolved from admin_settings.
 *
 * On success the webhook handles:
 *   - Cancel any existing monthly sub (workspaces.paystack_sub_code)
 *   - Set bundle_expires_at = NOW() + 12 months
 *   - Grant workspace_entitlements (20 inbox credits)
 *   - Send Mizark WhatsApp invite link
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { createPaystackCheckout } from "@/lib/billing/paystack";
import { checkRateLimit } from "@/lib/rate-limit";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.io";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const db = createAdminClient();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const allowed = await checkRateLimit(db, `funnel:bundle:checkout:${user.id}`, 5, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  // ── Must have completed Day 1 (bundle offer unlocked) ─────────────────────
  const { data: fs } = await db
    .from("funnel_states")
    .select("day1_completed_at, bundle_offer_expires_at, upsell_purchased_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!fs?.day1_completed_at) {
    return NextResponse.json(
      { error: "Complete Day 1 of the 30-Day Challenge to unlock this offer." },
      { status: 403 },
    );
  }

  if (fs.upsell_purchased_at) {
    return NextResponse.json({ error: "You already have an active annual bundle." }, { status: 409 });
  }

  // Check timer hasn't expired
  if (fs.bundle_offer_expires_at && new Date(fs.bundle_offer_expires_at) < new Date()) {
    return NextResponse.json(
      { error: "This offer has expired. Contact support for assistance." },
      { status: 410 },
    );
  }

  // ── Load price + Paystack plan code from admin_settings ───────────────────
  const { data: settings } = await db
    .from("admin_settings")
    .select("key, value")
    .in("key", [
      "funnel_bundle_price_ngn",
      "funnel_bundle_paystack_plan_code",
      "funnel_bundle_duration_months",
    ]);

  const cfg = Object.fromEntries((settings ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value as string]));
  const priceNgn   = parseInt(cfg["funnel_bundle_price_ngn"]    ?? "250000", 10);
  const planCode   = cfg["funnel_bundle_paystack_plan_code"]    ?? null;
  const durationMo = parseInt(cfg["funnel_bundle_duration_months"] ?? "12", 10);

  if (!planCode) {
    return NextResponse.json(
      { error: "Bundle payment not configured yet. Please contact support." },
      { status: 503 },
    );
  }

  // ── Workspace ─────────────────────────────────────────────────────────────
  const { data: member } = await db
    .from("workspace_members")
    .select("workspace_id, workspaces(billing_email, name, paystack_sub_code)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const workspace = (member as unknown as {
    workspace_id: string;
    workspaces: { billing_email: string | null; name: string; paystack_sub_code: string | null };
  });

  const billingEmail = workspace.workspaces.billing_email ?? user.email ?? `user-${user.id}@leadash.app`;

  // ── Create Paystack subscription checkout ─────────────────────────────────
  const callbackUrl = `${APP_URL}/academy/challenge-30?bundle=success`;

  try {
    const { authorizationUrl } = await createPaystackCheckout({
      email:      billingEmail,
      amountKobo: priceNgn * 100,
      planCode,   // Paystack subscription plan — creates recurring annual charge
      callbackUrl,
      metadata: {
        type:                    "bundle_subscription",
        user_id:                 user.id,
        workspace_id:            workspace.workspace_id,
        bundle_duration_months:  durationMo,
        existing_sub_code:       workspace.workspaces.paystack_sub_code ?? null,
        ip,
      },
    });

    return NextResponse.json({ url: authorizationUrl });
  } catch (err) {
    console.error("[funnel/checkout-bundle]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Payment initialization failed." },
      { status: 502 },
    );
  }
}
