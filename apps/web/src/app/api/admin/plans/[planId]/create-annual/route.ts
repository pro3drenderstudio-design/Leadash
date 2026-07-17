/**
 * POST /api/admin/plans/[planId]/create-annual
 *
 * Creates (or reuses) an annual Paystack plan for this tier at 10× the monthly
 * price (2 months free), yearly interval, and stores the returned plan code on
 * plan_configs.paystack_plan_code_annual. Admin-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { createPaystackPlan } from "@/lib/billing/paystack";
import { invalidatePlanCache } from "@/lib/billing/getActivePlans";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ planId: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { planId } = await params;

  const { data: plan } = await db
    .from("plan_configs")
    .select("plan_id, name, price_ngn, paystack_plan_code_annual")
    .eq("plan_id", planId)
    .single();
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  if (plan.plan_id === "free" || !plan.price_ngn) {
    return NextResponse.json({ error: "Only paid plans can have an annual plan" }, { status: 400 });
  }
  if (plan.paystack_plan_code_annual) {
    return NextResponse.json({ plan_code: plan.paystack_plan_code_annual, existing: true });
  }

  const annualKobo = plan.price_ngn * 10 * 100; // 10 months = 2 months free, in kobo
  let planCode: string;
  try {
    const res = await createPaystackPlan({
      name:       `${plan.name} (Annual)`,
      amountKobo: annualKobo,
      interval:   "annually",
    });
    planCode = res.planCode;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Paystack plan creation failed" }, { status: 502 });
  }

  await db.from("plan_configs")
    .update({ paystack_plan_code_annual: planCode, updated_at: new Date().toISOString() })
    .eq("plan_id", planId);
  invalidatePlanCache();

  return NextResponse.json({ plan_code: planCode });
}
