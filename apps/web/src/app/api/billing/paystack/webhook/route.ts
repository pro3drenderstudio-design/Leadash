import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPaystackSignature, verifyPaystackPayment } from "@/lib/billing/paystack";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { purchaseDomain, type RegistrantContact } from "@/lib/outreach/porkbun";
import { registerDomain, isDomainVerified, enableDkimSigning, getSmtpCredentials } from "@/lib/outreach/ses";
import { publishDnsRecords, buildMailDnsRecords } from "@/lib/outreach/cloudflare";
import { encrypt } from "@/lib/outreach/crypto";

const WARMUP_DAYS = 21;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const rawBody   = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";

  if (!verifyPaystackSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: {
    event: string;
    data: Record<string, unknown>;
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = createAdminClient();

  // ── Plan subscription: charge.success ────────────────────────────────────────
  if (event.event === "charge.success") {
    const data       = event.data as { reference: string; metadata?: Record<string, unknown>; authorization?: { authorization_code?: string; customer_code?: string } };
    const meta       = data.metadata ?? {};
    const type       = meta.type as string | undefined;
    const workspaceId = meta.workspace_id as string | undefined;

    // Credit pack purchase
    if (type === "credit_purchase" && workspaceId) {
      const packId  = meta.pack_id  as string | undefined;
      const credits = meta.credits  as string | undefined;
      if (packId && credits) {
        const { paid } = await verifyPaystackPayment(data.reference);
        if (paid) {
          const creditsNum = parseInt(credits, 10);
          const { data: ws } = await db.from("workspaces")
            .select("lead_credits_balance").eq("id", workspaceId).single();
          if (ws) {
            await db.from("workspaces")
              .update({ lead_credits_balance: (ws.lead_credits_balance ?? 0) + creditsNum })
              .eq("id", workspaceId);
          }
          await db.from("lead_credit_transactions").insert({
            workspace_id: workspaceId,
            type:         "purchase",
            amount:       creditsNum,
            description:  `Credit pack: ${packId}`,
          });
        }
      }
      return NextResponse.json({ received: true });
    }

    // Plan subscription payment
    if (type === "plan_subscription" && workspaceId) {
      const planId = meta.plan_id as string | undefined;
      if (planId) {
        const { paid, authorizationCode, customerCode } = await verifyPaystackPayment(data.reference);
        if (paid) {
          const plan = await getPlanById(planId);
          await db
            .from("workspaces")
            .update({
              plan_id:              plan.plan_id,
              plan_status:          "active",
              max_inboxes:          plan.max_inboxes,
              max_monthly_sends:    plan.max_monthly_sends,
              max_seats:            plan.max_seats,
              ...(authorizationCode ? { paystack_auth_code: authorizationCode } : {}),
              ...(customerCode      ? { paystack_customer_code: customerCode }  : {}),
              updated_at:           new Date().toISOString(),
            })
            .eq("id", workspaceId);

          // Grant included monthly credits (initial activation — not a renewal)
          if (plan.included_credits > 0) {
            const { data: ws } = await db
              .from("workspaces")
              .select("lead_credits_balance, subscription_credits_balance")
              .eq("id", workspaceId)
              .single();
            if (ws) {
              await db.from("workspaces")
                .update({
                  lead_credits_balance:         (ws.lead_credits_balance ?? 0) + plan.included_credits,
                  subscription_credits_balance: plan.included_credits,
                })
                .eq("id", workspaceId);
            }
            await db.from("lead_credit_transactions").insert({
              workspace_id: workspaceId,
              type:         "grant",
              amount:       plan.included_credits,
              description:  `Monthly credits — ${plan.name} plan`,
            });
          }
        }
      }
      return NextResponse.json({ received: true });
    }

    // Domain purchase payment
    const domainRecordId = meta.domain_record_id as string | undefined;
    if (!domainRecordId || !workspaceId) {
      return NextResponse.json({ received: true });
    }

    const { data: domainRecord } = await db
      .from("outreach_domains")
      .select("*")
      .eq("id", domainRecordId)
      .single();

    if (!domainRecord || domainRecord.status === "active") {
      return NextResponse.json({ received: true });
    }

    const { paid, authorizationCode } = await verifyPaystackPayment(data.reference);
    if (!paid) return NextResponse.json({ received: true });

    // Store authorization code for future recurring inbox billing
    if (authorizationCode) {
      await db
        .from("outreach_domains")
        .update({ paystack_auth_code: authorizationCode })
        .eq("id", domainRecordId);
    }

    async function setStatus(status: string, errorMessage?: string) {
      await db
        .from("outreach_domains")
        .update({
          status,
          ...(errorMessage ? { error_message: errorMessage } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", domainRecordId!);
    }

    try {
      await setStatus("purchasing");

      const { data: wsSettings } = await db
        .from("workspace_settings")
        .select("registrant_first_name, registrant_last_name, registrant_email, registrant_phone, registrant_address, registrant_city, registrant_state, registrant_zip, registrant_country")
        .eq("workspace_id", workspaceId)
        .single();

      const registrant: RegistrantContact = {
        firstName: wsSettings?.registrant_first_name ?? "",
        lastName:  wsSettings?.registrant_last_name  ?? "",
        email:     wsSettings?.registrant_email      ?? "",
        phone:     wsSettings?.registrant_phone      ?? "",
        address:   wsSettings?.registrant_address    ?? "",
        city:      wsSettings?.registrant_city       ?? "",
        state:     wsSettings?.registrant_state      ?? "",
        zip:       wsSettings?.registrant_zip        ?? "",
        country:   wsSettings?.registrant_country    ?? "US",
      };

      if (!registrant.firstName || !registrant.email || !registrant.address) {
        throw new Error("Registrant contact info is incomplete. Please fill in Settings → Outreach.");
      }

      await purchaseDomain(domainRecord.domain, registrant);

      await setStatus("dns_pending");
      const { dkimTokens } = await registerDomain(domainRecord.domain);

      const dnsRecords = buildMailDnsRecords(domainRecord.domain, dkimTokens);
      await publishDnsRecords(domainRecord.domain, dnsRecords);

      await db
        .from("outreach_domains")
        .update({ dns_records: dnsRecords })
        .eq("id", domainRecordId);

      await setStatus("verifying");
      let verified = false;
      for (let attempt = 1; attempt <= 6; attempt++) {
        await sleep(10_000);
        verified = await isDomainVerified(domainRecord.domain);
        if (verified) break;
      }
      if (verified) await enableDkimSigning(domainRecord.domain);

      const smtp = getSmtpCredentials();
      const warmupEndsAt = new Date(Date.now() + WARMUP_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const explicitPrefixes: string[] | null = Array.isArray(domainRecord.mailbox_prefixes)
        ? domainRecord.mailbox_prefixes as string[]
        : null;
      const logins = explicitPrefixes
        ?? Array.from({ length: domainRecord.mailbox_count }, (_, i) => `${domainRecord.mailbox_prefix}${i + 1}`);

      for (const login of logins) {
        const email = `${login}@${domainRecord.domain}`;

        await db.from("outreach_inboxes").insert({
          workspace_id:         workspaceId,
          domain_id:            domainRecordId,
          label:                email,
          email_address:        email,
          provider:             "smtp",
          status:               "active",
          smtp_host:            smtp.host,
          smtp_port:            smtp.port,
          smtp_user:            smtp.username,
          smtp_pass_encrypted:  encrypt(smtp.password),
          imap_host:            null,
          imap_port:            null,
          daily_send_limit:     30,
          warmup_enabled:       true,
          warmup_target_daily:  30,
          warmup_ramp_per_week: 3,
          warmup_ends_at:       warmupEndsAt,
          first_name:           domainRecord.first_name ?? null,
          last_name:            domainRecord.last_name  ?? null,
        });
      }

      await db
        .from("outreach_domains")
        .update({ status: "active", warmup_ends_at: warmupEndsAt, updated_at: new Date().toISOString() })
        .eq("id", domainRecordId);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[paystack-webhook] Provision failed for ${domainRecord.domain}:`, msg);
      await setStatus("failed", msg);
    }

    return NextResponse.json({ received: true });
  }

  // ── Subscription created — store subscription code ───────────────────────────
  if (event.event === "subscription.create") {
    const data = event.data as {
      subscription_code?: string;
      customer?: { metadata?: { workspace_id?: string } };
    };
    const subCode     = data.subscription_code;
    const workspaceId = data.customer?.metadata?.workspace_id;
    if (subCode && workspaceId) {
      await db
        .from("workspaces")
        .update({ paystack_sub_code: subCode })
        .eq("id", workspaceId);
    }
    return NextResponse.json({ received: true });
  }

  // ── Recurring billing cycle — grant monthly credits ─────────────────────────────
  if (event.event === "invoice.update") {
    const inv = event.data as {
      status?: string;
      subscription?: { subscription_code?: string; plan?: { plan_code?: string } };
    };
    // Only act on paid invoices for active subscriptions
    if (inv.status === "success" && inv.subscription?.subscription_code) {
      const subCode = inv.subscription.subscription_code;

      // Find the workspace tied to this subscription
      const { data: ws } = await db
        .from("workspaces")
        .select("id, plan_id, lead_credits_balance")
        .eq("paystack_sub_code", subCode)
        .maybeSingle();

      if (ws) {
        const plan = await getPlanById(ws.plan_id ?? "free");
        if (plan.included_credits > 0) {
          const currentSub   = ws.subscription_credits_balance ?? 0;
          const currentTotal = ws.lead_credits_balance ?? 0;
          // Renewal: expire unused subscription credits, grant new allocation
          const newTotal = currentTotal - currentSub + plan.included_credits;
          await db.from("workspaces")
            .update({
              lead_credits_balance:         Math.max(0, newTotal),
              subscription_credits_balance: plan.included_credits,
            })
            .eq("id", ws.id);
          await db.from("lead_credit_transactions").insert({
            workspace_id: ws.id,
            type:         "grant",
            amount:       plan.included_credits,
            description:  `Monthly credits — ${plan.name} plan renewal`,
          });
        }
      }
    }
    return NextResponse.json({ received: true });
  }

  // ── Subscription disabled — downgrade to free ─────────────────────────────────
  if (event.event === "subscription.disable" || event.event === "invoice.payment_failed") {
    const data = event.data as {
      subscription_code?: string;
    };
    const subCode = data.subscription_code;
    if (subCode) {
      const freePlan = await getPlanById("free");
      await db
        .from("workspaces")
        .update({
          plan_id:           "free",
          plan_status:       "canceled",
          paystack_sub_code: null,
          max_inboxes:       freePlan.max_inboxes,
          max_monthly_sends: freePlan.max_monthly_sends,
          max_seats:         freePlan.max_seats,
          updated_at:        new Date().toISOString(),
        })
        .eq("paystack_sub_code", subCode);
    }
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
