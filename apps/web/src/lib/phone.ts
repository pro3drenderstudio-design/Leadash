/**
 * Phone-number normalisation, tuned for Nigerian numbers.
 *
 * WhatsApp webhooks deliver numbers as digits-only with the country code
 * baked in ("2348012345678"), but users on our funnel forms almost always
 * type the local format ("08012345678", "080-1234-5678", "+234 801 234 5678").
 * Without normalisation those look like different contacts and the "reply
 * to the person who filled the form" automation misses.
 *
 * `normalisePhoneNG` strips everything that isn't a digit or the leading +,
 * removes the country prefix if present, drops a leading trunk 0, then
 * re-adds the 234 prefix. Output is always digits-only without the +
 * ("2348012345678"), which matches WhatsApp's wa_id format.
 *
 * Returns null when the input can't sensibly be interpreted as a NG number
 * (empty, too short after cleaning).
 */
export function normalisePhoneNG(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Keep only digits and a leading + (which we strip immediately).
  let digits = String(raw).replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!digits) return null;

  // Strip 234 prefix if the caller already gave a full E.164-ish number,
  // so we start from the "national" number in every branch.
  if (digits.startsWith("234")) digits = digits.slice(3);
  // Drop the leading trunk 0 that Nigerians commonly type on local numbers.
  if (digits.startsWith("0")) digits = digits.slice(1);

  // Sanity gate: NG mobiles are 10 digits national (e.g. 8012345678).
  if (digits.length < 7 || digits.length > 15) return null;

  return "234" + digits;
}
