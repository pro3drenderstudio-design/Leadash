/**
 * GET /api/cron/billing-reconcile
 *
 * Runs daily. Detects billing-state drift the rest of the system can't catch
 * on its own, and ONLY reports it (email + admin_activity_log) — it never
 * mutates plan_status, domain status, or anything else. The underlying data
 * can be messy (see: a real paying customer left with no Paystack subscription
 * code at all after a webhook mismatch), so this surfaces findings for a human
 * to judge case-by-case rather than auto-enforcing.
 *
 * Three checks:
 *  A. Workspaces whose plan_status is stuck "active" with no way for a
 *     Paystack webhook to ever reach them again (paystack_sub_code null) and
 *     whose renewal date has already passed.
 *  B. Sending domains marked "active" that were never enrolled in the
 *     per-domain inbox-billing cycle at all (inbox_next_billing_date null) —
 *     a provisioning bug that leaves them running unbilled indefinitely.
 *  C. Workspaces still on the beta-tester perk (plan_id "starter", granted
 *     via claimBetaIfApproved with no real subscription_renews_at) whose
 *     30-day trial_ends_at has passed without converting to a paid plan.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendBillingReconcileAlert, type BillingDriftFinding } from "@/lib/email/notifications";
import { logActivity } from "@/lib/activity";

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const now = new Date().toISOString();
  const findings: BillingDriftFinding[] = [];

  // A. Dead subscription link — plan_status stuck "active" past its renewal
  //    date, with no paystack_sub_code for any webhook to ever match against.
  const { data: deadLinks } = await db
    .from("workspaces")
    .select("id, name, subscription_renews_at")
    .not("paystack_customer_code", "is", null)
    .is("paystack_sub_code", null)
    .eq("plan_status", "active")
    .lt("subscription_renews_at", now);

  for (const ws of deadLinks ?? []) {
    findings.push({
      kind:          "dead_subscription_link",
      workspaceId:   ws.id,
      workspaceName: ws.name,
      detail:        `plan_status stuck "active", renewal was due ${ws.subscription_renews_at}, no paystack_sub_code to reconcile against`,
    });
  }

  // B. Never-billed active domain — provisioning bug, not currently charged at all.
  const { data: neverBilled } = await db
    .from("outreach_domains")
    .select("workspace_id, domain, mailbox_count, created_at, workspaces(name)")
    .eq("status", "active")
    .not("paystack_inbox_monthly_kobo", "is", null)
    .is("inbox_next_billing_date", null);

  for (const d of neverBilled ?? []) {
    const wsName = (d.workspaces as { name: string } | null)?.name ?? null;
    findings.push({
      kind:          "never_billed_domain",
      workspaceId:   d.workspace_id,
      workspaceName: wsName,
      detail:        `domain "${d.domain}" (${d.mailbox_count} mailbox${d.mailbox_count === 1 ? "" : "es"}) active since ${d.created_at}, never enrolled in billing`,
    });
  }

  // C. Expired, unconverted beta trial — same disambiguation as getBillingAccessStatus,
  //    and deliberately NOT filtered on plan_status so this stays in sync with exactly
  //    what the paywall itself blocks (a beta workspace can be "active" or "trialing").
  const { data: expiredBeta } = await db
    .from("workspaces")
    .select("id, name, trial_ends_at")
    .eq("plan_id", "starter")
    .is("subscription_renews_at", null)
    .not("trial_ends_at", "is", null)
    .lt("trial_ends_at", now);

  for (const ws of expiredBeta ?? []) {
    findings.push({
      kind:          "expired_beta_trial",
      workspaceId:   ws.id,
      workspaceName: ws.name,
      detail:        `beta trial ended ${ws.trial_ends_at}, never converted to a paid plan`,
    });
  }

  if (findings.length > 0) {
    await sendBillingReconcileAlert(findings).catch(e =>
      console.error("[billing-reconcile] alert email failed:", e instanceof Error ? e.message : e),
    );
    await logActivity({
      type:        "billing_drift_detected",
      title:       `Billing reconcile found ${findings.length} drifted item(s)`,
      description: findings.map(f => `${f.kind}: ${f.workspaceName ?? f.workspaceId ?? "unknown"}`).join("; "),
      metadata:    { findings },
    });
  }

  return NextResponse.json({ ok: true, findings });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
