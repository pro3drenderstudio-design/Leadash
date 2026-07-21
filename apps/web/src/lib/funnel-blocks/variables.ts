/**
 * Dynamic merge variables for funnel pages.
 *
 * Authors drop tokens like `{next_active_cohort_date}` anywhere in a text
 * block; they're resolved to live values when the public page is server-
 * rendered (SEO-friendly, no client flash). Only registered keys are replaced,
 * so stray braces in normal copy are left untouched.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface FunnelVariable {
  key: string;
  label: string;
  sample: string;
}

/** Registry surfaced in the builder's "Insert variable" helper. */
export const FUNNEL_VARIABLES: FunnelVariable[] = [
  { key: "next_active_cohort_date",       label: "Next cohort date",         sample: "Monday, July 27" },
  { key: "next_active_cohort_date_short", label: "Next cohort date (short)", sample: "Jul 27" },
  { key: "next_active_cohort_weekday",    label: "Next cohort weekday",      sample: "Monday" },
  { key: "next_active_cohort_number",     label: "Next cohort number",       sample: "3" },
];

const WAT = "Africa/Lagos";

/**
 * Resolve live values for the merge variables. Currently academy/cohort-scoped
 * (the enrolling cohort of `productSlug`, default the 7-day challenge). Never
 * throws — an unresolved key is simply left as-is by the interpolator.
 */
export async function resolveFunnelVariableValues(
  db: SupabaseClient,
  opts?: { productSlug?: string },
): Promise<Record<string, string>> {
  const slug = opts?.productSlug ?? "challenge-7day";
  const values: Record<string, string> = {};
  try {
    const { data: prod } = await db.from("academy_products").select("id").eq("slug", slug).maybeSingle();
    if (!prod) return values;
    // The enrolling cohort (is_default) is the "next" one people can still join.
    const { data: cohort } = await db
      .from("academy_cohorts")
      .select("cohort_number, starts_at")
      .eq("product_id", prod.id)
      .eq("is_default", true)
      .maybeSingle();
    if (cohort?.starts_at) {
      const d = new Date(cohort.starts_at as string);
      values.next_active_cohort_date = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: WAT }).format(d);
      values.next_active_cohort_date_short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: WAT }).format(d);
      values.next_active_cohort_weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: WAT }).format(d);
    }
    if (cohort?.cohort_number != null) values.next_active_cohort_number = String(cohort.cohort_number);
  } catch {
    /* leave tokens unresolved */
  }
  return values;
}

/**
 * Replace every registered `{key}` token in an arbitrary JSON-serialisable
 * value (e.g. a blocks array) with its resolved value. Works on text wherever
 * it appears — headlines, body copy, button labels — by operating on the JSON
 * string. Values are JSON-escaped so they can't corrupt the structure.
 */
export function interpolateFunnelVariables<T>(data: T, values: Record<string, string>): T {
  const keys = Object.keys(values);
  if (keys.length === 0) return data;
  let json = JSON.stringify(data);
  if (!json.includes("{")) return data;
  for (const key of keys) {
    const val = values[key];
    if (!val) continue;
    const token = `{${key}}`;
    if (!json.includes(token)) continue;
    const safe = JSON.stringify(val).slice(1, -1); // escaped, without the surrounding quotes
    json = json.split(token).join(safe);
  }
  return JSON.parse(json) as T;
}
