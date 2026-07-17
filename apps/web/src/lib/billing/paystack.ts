/**
 * Paystack payment helper.
 * Required env vars:
 *   PAYSTACK_SECRET_KEY             — sk_live_... or sk_test_...
 *   NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY — pk_live_... or pk_test_...
 */

import { createHmac } from "crypto";

const PAYSTACK_BASE = "https://api.paystack.co";

function authHeader(): string {
  return `Bearer ${process.env.PAYSTACK_SECRET_KEY!}`;
}

async function paystackFetch<T>(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization:  authHeader(),
      "Content-Type": "application/json",
    },
    body:   body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });

  const json = (await res.json()) as { status: boolean; message: string; data: T };
  if (!json.status) throw new Error(`Paystack error: ${json.message}`);
  return json.data;
}

// ── Transaction / Checkout ─────────────────────────────────────────────────────

interface InitializeResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

interface VerifyResponse {
  status: string;
  reference: string;
  amount: number;
  fees?: number; // Paystack's transaction fee in kobo
  currency: string;
  authorization: { authorization_code: string; email: string };
  customer: { customer_code: string; email: string };
  metadata: Record<string, unknown>;
}

/** Safely reads Paystack's transaction fee (kobo) off a raw webhook payload.
 *  charge.success carries it at `data.fees`; invoice.* events nest it under
 *  `data.transaction.fees`. Returns null when absent so callers can
 *  distinguish "no fee data" (backfillable later) from a genuine zero fee. */
export function paystackFeesKobo(data: unknown): number | null {
  const d = data as { fees?: unknown; transaction?: { fees?: unknown } } | null | undefined;
  if (typeof d?.fees === "number") return d.fees;
  if (typeof d?.transaction?.fees === "number") return d.transaction.fees;
  return null;
}

export interface PaystackCheckoutParams {
  email:        string;
  amountKobo:   number;
  metadata:     Record<string, unknown>;
  callbackUrl:  string;
  reference?:   string;
  planCode?:    string;   // pass to create a subscription instead of one-off
  channels?:    string[]; // e.g. ["card", "bank", "ussd"]
}

export async function createPaystackCheckout(params: PaystackCheckoutParams): Promise<{
  authorizationUrl: string;
  reference: string;
}> {
  const data = await paystackFetch<InitializeResponse>("POST", "/transaction/initialize", {
    email:        params.email,
    amount:       params.amountKobo,
    currency:     "NGN",
    metadata:     params.metadata,
    callback_url: params.callbackUrl,
    ...(params.reference ? { reference: params.reference } : {}),
    ...(params.planCode  ? { plan: params.planCode }        : {}),
    ...(params.channels  ? { channels: params.channels }   : {}),
  });
  return { authorizationUrl: data.authorization_url, reference: data.reference };
}

export async function verifyPaystackPayment(reference: string): Promise<{
  paid: boolean;
  metadata: Record<string, unknown>;
  authorizationCode: string | null;
  customerCode: string | null;
  customerEmail: string | null;
  amountKobo: number | null;
  feesKobo: number | null;
}> {
  const data = await paystackFetch<VerifyResponse>("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
  return {
    paid:              data.status === "success",
    metadata:          data.metadata ?? {},
    authorizationCode: data.authorization?.authorization_code ?? null,
    customerCode:      data.customer?.customer_code ?? null,
    customerEmail:     data.customer?.email ?? data.authorization?.email ?? null,
    amountKobo:        typeof data.amount === "number" ? data.amount : null,
    feesKobo:          typeof data.fees === "number" ? data.fees : null,
  };
}

// ── Subscription ───────────────────────────────────────────────────────────────

export async function createPaystackSubscription(params: {
  customerCode: string;
  planCode:     string;
  startDate?:   string; // ISO 8601 — defaults to now
}): Promise<{ subscriptionCode: string; emailToken: string }> {
  const data = await paystackFetch<{ subscription_code: string; email_token: string }>(
    "POST", "/subscription",
    {
      customer:   params.customerCode,
      plan:       params.planCode,
      ...(params.startDate ? { start_date: params.startDate } : {}),
    }
  );
  return { subscriptionCode: data.subscription_code, emailToken: data.email_token };
}

export async function disablePaystackSubscription(params: {
  code:       string;
  emailToken: string;
}): Promise<void> {
  await paystackFetch("POST", "/subscription/disable", {
    code:        params.code,
    token:       params.emailToken,
  });
}

// ── Plans (for admin plan management) ─────────────────────────────────────────

/** Creates a Paystack plan and returns its plan code. Used to auto-provision
 *  the annual (2-months-free) plans from the admin plan configurator. */
export async function createPaystackPlan(params: {
  name:       string;
  amountKobo: number;
  interval:   "monthly" | "annually" | "weekly" | "biannually";
}): Promise<{ planCode: string }> {
  const data = await paystackFetch<{ plan_code: string }>("POST", "/plan", {
    name:     params.name,
    amount:   params.amountKobo,
    interval: params.interval,
    currency: "NGN",
  });
  return { planCode: data.plan_code };
}

export async function updatePaystackPlan(planCode: string, updates: {
  name?:     string;
  amountKobo?: number;
  interval?: "monthly" | "annually" | "weekly";
}): Promise<void> {
  const body: Record<string, unknown> = {};
  if (updates.name)        body.name     = updates.name;
  if (updates.amountKobo)  body.amount   = updates.amountKobo;
  if (updates.interval)    body.interval = updates.interval;
  await paystackFetch<unknown>("PUT", `/plan/${planCode}`, body);
}

// ── Charge Authorization (recurring inbox billing) ────────────────────────────

export async function chargePaystackAuthorization(params: {
  authorizationCode: string;
  email:             string;
  amountKobo:        number;
  metadata?:         Record<string, unknown>;
  reference?:        string;
}): Promise<{ reference: string; status: string; feesKobo: number | null }> {
  const data = await paystackFetch<{ reference: string; status: string; fees?: number }>(
    "POST", "/transaction/charge_authorization",
    {
      authorization_code: params.authorizationCode,
      email:              params.email,
      amount:             params.amountKobo,
      ...(params.metadata  ? { metadata:  params.metadata }  : {}),
      ...(params.reference ? { reference: params.reference } : {}),
    }
  );
  return { reference: data.reference, status: data.status, feesKobo: typeof data.fees === "number" ? data.fees : null };
}

// ── Refunds ────────────────────────────────────────────────────────────────────

export async function refundPaystackPayment(params: {
  reference:   string;
  amountKobo?: number; // omit for a full refund
  reason?:     string;
}): Promise<{ status: string }> {
  const data = await paystackFetch<{ status: string }>("POST", "/refund", {
    transaction: params.reference,
    ...(params.amountKobo ? { amount: params.amountKobo } : {}),
    ...(params.reason     ? { customer_note: params.reason, merchant_note: params.reason } : {}),
  });
  return { status: data.status };
}

// ── Webhook signature verification ────────────────────────────────────────────

export function verifyPaystackSignature(rawBody: string, signature: string): boolean {
  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}
