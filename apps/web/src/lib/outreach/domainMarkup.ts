/**
 * Domain registration markup — the admin adds a flat or percentage markup on
 * top of the raw Namecheap registration price. Shared so the domain search UI
 * can show the marked-up price the user will actually be charged (not the raw
 * wholesale price), matching what /outreach/domains/checkout charges.
 */
import { createAdminClient } from "@/lib/supabase/server";

export interface DomainMarkup {
  type:  "none" | "flat" | "percent";
  value: number;
}

export async function getDomainMarkup(): Promise<DomainMarkup> {
  try {
    const db = createAdminClient();
    const { data } = await db.from("admin_settings").select("key, value")
      .in("key", ["domain_markup_type", "domain_markup_value"]);
    const map = Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
    const type = (map.domain_markup_type as string) ?? "flat";
    const value = Number(map.domain_markup_value ?? 1);
    return { type: type as DomainMarkup["type"], value: Number.isFinite(value) ? value : 1 };
  } catch {
    return { type: "flat", value: 1 };
  }
}

/** The markup amount (USD) added on top of a raw registration price. */
export function markupAmount(rawPriceUsd: number, markup: DomainMarkup): number {
  if (rawPriceUsd <= 0 || markup.type === "none") return 0;
  if (markup.type === "percent") return rawPriceUsd * (markup.value / 100);
  return markup.value; // flat
}

/** Final displayed/charged registration price (USD) = raw + markup. */
export function priceWithMarkup(rawPriceUsd: number, markup: DomainMarkup): number {
  if (rawPriceUsd <= 0) return 0;
  return rawPriceUsd + markupAmount(rawPriceUsd, markup);
}
