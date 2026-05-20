import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

// Fetch live USD/NGN rate — tries exchangerate-api, falls back to admin override, then default
async function getLiveRate(): Promise<number> {
  try {
    const res = await fetch(
      `https://open.er-api.com/v6/latest/USD`,
      { next: { revalidate: 300 } }
    );
    if (res.ok) {
      const data = await res.json() as { rates?: { NGN?: number } };
      if (data.rates?.NGN && data.rates.NGN > 100) return data.rates.NGN;
    }
  } catch { /* fall through */ }
  return 1580; // Fallback rate
}

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const { db } = auth;

  // Check for admin manual override
  const { data: override } = await db
    .from("admin_settings")
    .select("value")
    .eq("key", "leadpay_fx_rate_override")
    .maybeSingle();

  let rate: number;
  if (override?.value && !isNaN(parseFloat(String(override.value)))) {
    rate = parseFloat(String(override.value));
  } else {
    rate = await getLiveRate();
  }

  // Apply spread from settings
  const { data: spreadSetting } = await db
    .from("admin_settings")
    .select("value")
    .eq("key", "leadpay_fx_spread_pct")
    .maybeSingle();
  const spreadPct = spreadSetting?.value ? parseFloat(String(spreadSetting.value)) : 2.5;
  const clientRate = rate * (1 - spreadPct / 100);

  return NextResponse.json({
    mid_rate:   Math.round(rate * 100) / 100,
    client_rate: Math.round(clientRate * 100) / 100,
    spread_pct:  spreadPct,
    currency:    "NGN",
    base:        "USD",
    updated_at:  new Date().toISOString(),
  });
}
