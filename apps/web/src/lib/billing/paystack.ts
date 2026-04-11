/**
 * Paystack payment helper.
 *
 * Docs: https://paystack.com/docs/api/
 *
 * Required env vars:
 *   PAYSTACK_SECRET_KEY              — sk_live_... or sk_test_...
 *   NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY  — pk_live_... or pk_test_...
 */

const PAYSTACK_BASE = "https://api.paystack.co";

function authHeader(): string {
  return `Bearer ${process.env.PAYSTACK_SECRET_KEY!}`;
}

async function paystackFetch<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization:  authHeader(),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as { status: boolean; message: string; data: T };
  if (!json.status) throw new Error(`Paystack error: ${json.message}`);
  return json.data;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface InitializeResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

interface VerifyResponse {
  status: string; // "success" | "failed" | "abandoned" | ...
  reference: string;
  amount: number;
  currency: string;
  metadata: Record<string, unknown>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface PaystackCheckoutParams {
  email:       string;
  amountKobo:  number;           // amount in kobo (1 NGN = 100 kobo)
  metadata:    Record<string, unknown>;
  callbackUrl: string;
  reference?:  string;
}

/**
 * Initialise a Paystack payment and return the hosted checkout URL.
 */
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
  });

  return {
    authorizationUrl: data.authorization_url,
    reference:        data.reference,
  };
}

/**
 * Verify a Paystack transaction by reference.
 * Returns { paid: true } only when status is "success".
 */
export async function verifyPaystackPayment(reference: string): Promise<{
  paid: boolean;
  metadata: Record<string, unknown>;
}> {
  const data = await paystackFetch<VerifyResponse>("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
  return {
    paid:     data.status === "success",
    metadata: data.metadata ?? {},
  };
}

/**
 * Verify a Paystack webhook signature.
 * Paystack signs the request body with HMAC-SHA512 using your secret key.
 */
export function verifyPaystackSignature(rawBody: string, signature: string): boolean {
  const { createHmac } = require("crypto") as typeof import("crypto");
  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}
