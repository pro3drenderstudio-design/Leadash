import { unstable_cache } from "next/cache";

const FALLBACK_RATE = 1700;
const BUFFER        = 100;

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
  ["usd_ngn_rate"],
  { tags: ["usd_ngn_rate"], revalidate: 3600 },
);

/** Returns the live USD→NGN rate + ₦100 buffer. Cached 1 hour. Falls back to ₦1700. */
export async function getUsdToNgn(): Promise<number> {
  const rate = await fetchLiveRate();
  return rate + BUFFER;
}
