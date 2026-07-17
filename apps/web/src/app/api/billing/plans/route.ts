import { NextResponse } from "next/server";
import { getActivePlans } from "@/lib/billing/getActivePlans";
import { getUsdToNgn } from "@/lib/billing/exchangeRate";

/** Public endpoint — returns active plans + the current USD→NGN rate for the
 *  pricing page and settings UI (the slider does its own NGN/USD toggle). */
export async function GET() {
  const [plans, ngnPerUsd] = await Promise.all([getActivePlans(), getUsdToNgn()]);
  return NextResponse.json({ plans, ngn_per_usd: ngnPerUsd });
}
