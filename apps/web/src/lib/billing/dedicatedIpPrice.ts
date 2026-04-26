/**
 * Returns the current dedicated IP price from admin_settings.
 * Falls back to the defaults if the setting has not been configured.
 */
import { createAdminClient } from "@/lib/supabase/server";

const DEFAULT_PRICE_NGN = 78_400;
const DEFAULT_PRICE_USD = 49;

export async function getDedicatedIpPrice(): Promise<{ priceNgn: number; priceUsd: number }> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("admin_settings")
      .select("key, value")
      .in("key", ["dedicated_ip_price_ngn", "dedicated_ip_price_usd"]);

    const map = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
    const priceNgn = Number(map.get("dedicated_ip_price_ngn")) || DEFAULT_PRICE_NGN;
    const priceUsd = Number(map.get("dedicated_ip_price_usd")) || DEFAULT_PRICE_USD;
    return { priceNgn, priceUsd };
  } catch {
    return { priceNgn: DEFAULT_PRICE_NGN, priceUsd: DEFAULT_PRICE_USD };
  }
}
