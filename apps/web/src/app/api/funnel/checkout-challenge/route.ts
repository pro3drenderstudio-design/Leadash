/**
 * POST /api/funnel/checkout-challenge
 *
 * Initiates a Paystack one-time payment for the ₦10k 30-day challenge.
 * The amount and product ID are resolved server-side from admin_settings
 * and academy_products — never trusted from the client.
 *
 * Auth required. On success → redirect to Paystack checkout page.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { createPaystackCheckout } from "@/lib/billing/paystack";
import { checkRateLimit } from "@/lib/rate-limit";

const APP_URL     = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.io";
const PRODUCT_ID  = "challenge-30";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const db = createAdminClient();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const allowed = await checkRateLimit(db, `funnel:challenge:checkout:${user.id}`, 5, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  // ── Check existing enrollment ─────────────────────────────────────────────
  const { data: existingEnrollment } = await db
    .from("academy_enrollments")
    .select("id")
    .eq("user_id",    user.id)
    .eq("product_id", PRODUCT_ID)
    .eq("status",     "active")
    .maybeSingle();

  if (existingEnrollment) {
    return NextResponse.json({ error: "You are already enrolled in the 30-Day Challenge." }, { status: 409 });
  }

  // ── Check existing funnel_state — already paid? ────────────────────────────
  const { data: fs } = await db
    .from("funnel_states")
    .select("challenge_enrolled_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fs?.challenge_enrolled_at) {
    return NextResponse.json({ error: "You are already enrolled in the 30-Day Challenge." }, { status: 409 });
  }

  // ── Load product price server-side ────────────────────────────────────────
  const { data: product } = await db
    .from("academy_products")
    .select("price_ngn, name")
    .eq("id",        PRODUCT_ID)
    .eq("is_active", true)
    .single();

  if (!product) {
    return NextResponse.json({ error: "Product not found or not available." }, { status: 404 });
  }

  // ── Get workspace ─────────────────────────────────────────────────────────
  const { data: member } = await db
    .from("workspace_members")
    .select("workspace_id, workspaces(billing_email, name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Workspace not found. Please complete sign-up first." }, { status: 404 });
  }

  const workspace = (member as unknown as {
    workspace_id: string;
    workspaces: { billing_email: string | null; name: string };
  });

  const billingEmail = workspace.workspaces.billing_email ?? user.email ?? `user-${user.id}@leadash.app`;

  // ── Create Paystack checkout ──────────────────────────────────────────────
  const callbackUrl = `${APP_URL}/academy/challenge-30?payment=success`;

  try {
    const { authorizationUrl } = await createPaystackCheckout({
      email:      billingEmail,
      amountKobo: product.price_ngn * 100,
      callbackUrl,
      metadata: {
        type:         "challenge_30_enrollment",
        product_id:   PRODUCT_ID,
        user_id:      user.id,
        workspace_id: workspace.workspace_id,
        ip,
      },
    });

    return NextResponse.json({ url: authorizationUrl });
  } catch (err) {
    console.error("[funnel/checkout-challenge]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Payment initialization failed." },
      { status: 502 },
    );
  }
}
