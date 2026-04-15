import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { updatePaystackPlan } from "@/lib/billing/paystack";
import { invalidatePlanCache } from "@/lib/billing/getActivePlans";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminClient = createAdminClient();
  const { data: admin } = await adminClient.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, adminClient };
}

const EDITABLE_FIELDS = new Set([
  "name",
  "price_ngn",
  "price_usd",
  "paystack_plan_code",
  "stripe_price_id",
  "max_inboxes",
  "max_monthly_sends",
  "max_seats",
  "max_leads_pool",
  "included_credits",
  "trial_days",
  "inbox_monthly_price_ngn",
  "can_scrape_leads",
  "can_run_campaigns",
  "feat_warmup",
  "feat_preview_leads",
  "feat_ai_personalization",
  "feat_ai_classification",
  "feat_api_access",
  "is_active",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { planId } = await params;
  const body = await req.json() as Record<string, unknown>;

  // Only allow known editable fields
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE_FIELDS.has(key)) updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();
  updates.updated_by = ctx.user.id;

  // Fetch current plan to compare price change
  const { data: current } = await ctx.adminClient
    .from("plan_configs")
    .select("price_ngn, paystack_plan_code, name")
    .eq("plan_id", planId)
    .single();

  // Save to DB
  const { data: updated, error } = await ctx.adminClient
    .from("plan_configs")
    .update(updates)
    .eq("plan_id", planId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Sync price/name to Paystack if the plan has a plan code
  const paystackWarnings: string[] = [];
  const planCode = (updates.paystack_plan_code as string | null) ?? current?.paystack_plan_code;
  const priceChanged = "price_ngn" in updates && updates.price_ngn !== current?.price_ngn;
  const nameChanged  = "name" in updates && updates.name !== current?.name;

  if (planCode && (priceChanged || nameChanged)) {
    try {
      await updatePaystackPlan(planCode, {
        ...(priceChanged ? { amountKobo: (updates.price_ngn as number) * 100 } : {}),
        ...(nameChanged  ? { name: updates.name as string }                    : {}),
      });
    } catch (err) {
      // Don't fail the whole request — DB is the source of truth
      paystackWarnings.push(
        err instanceof Error ? err.message : "Paystack sync failed"
      );
    }
  }

  // Bust the cache so the updated plan is live immediately
  invalidatePlanCache();

  return NextResponse.json({
    plan: updated,
    paystack_synced: planCode !== null && paystackWarnings.length === 0,
    warnings: paystackWarnings.length ? paystackWarnings : undefined,
  });
}
