import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";

const FALLBACK_RATE = 1700;
const BUFFER        = 100;

const fetchDbRate = unstable_cache(
  async (): Promise<number | null> => {
    try {
      const db = createAdminClient();
      const { data } = await db.from("platform_config").select("usd_to_ngn").single();
      const rate = data?.usd_to_ngn;
      if (typeof rate === "number" && rate >= 100) return rate;
      return null;
    } catch {
      return null;
    }
  },
  ["usd_ngn_rate"],
  { tags: ["usd_ngn_rate"], revalidate: 3600 },
);

const fetchLiveRate = unstable_cache(
  async (): Promise<number> => {
    try {
      const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD", {
        next: { revalidate: 3600 },
      });
      if (!res.ok) return FALLBACK_RATE;
      const data = await res.json() as { rates?: Record<string, number> };
      const rate = data.rates?.NGN;
      if (!rate || rate < 100) return FALLBACK_RATE;
      return rate;
    } catch {
      return FALLBACK_RATE;
    }
  },
  ["usd_ngn_live_rate"],
  { tags: ["usd_ngn_live_rate"], revalidate: 3600 },
);

/**
 * Returns the USD→NGN rate + ₦100 buffer.
 * Prefers the admin-set rate from platform_config.
 * Falls back to the live ExchangeRate-API, then ₦1700 if both fail.
 */
export async function getUsdToNgn(): Promise<number> {
  const dbRate = await fetchDbRate();
  if (dbRate !== null) return dbRate + BUFFER;
  const liveRate = await fetchLiveRate();
  return liveRate + BUFFER;
}
