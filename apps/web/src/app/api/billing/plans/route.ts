import { NextResponse } from "next/server";
import { getActivePlans } from "@/lib/billing/getActivePlans";

/** Public endpoint — returns active plans for the pricing page and settings UI. */
export async function GET() {
  const plans = await getActivePlans();
  return NextResponse.json({ plans });
}
