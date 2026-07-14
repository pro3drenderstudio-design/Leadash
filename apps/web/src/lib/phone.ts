/**
 * Phone-number normalisation, safe for international numbers.
 *
 * Previous implementation blindly prefixed `234` to anything that didn't
 * already start with it — which mangled non-Nigerian numbers (e.g. a UK
 * `+447700900123` became `234447700900123`). WhatsApp accepted inbound
 * messages tagged by the real wa_id, but our outbound `sendWhatsapp` used
 * the mangled stored value and never reached the recipient.
 *
 * Rules of the fixed normaliser (input can be any of the shapes users type):
 *   • Starts with `+` or `00` → E.164, keep the country code intact.
 *   • Starts with `234` and looks like a valid NG number → keep as-is.
 *   • Starts with `0` (Nigerian trunk) + 10 digits after → NG national,
 *     strip 0 and prefix 234.
 *   • Exactly 10 digits starting with 7/8/9 (NG mobile without trunk)
 *     → prefix 234.
 *   • Any other pattern → return the digits as-is. We DON'T guess a
 *     country code — better to store the number as typed than to make
 *     up a wrong one.
 *
 * Output shape: digits-only, no `+`. Matches WhatsApp Cloud API's wa_id
 * format so contact linkage on inbound messages works cleanly. Returns
 * null when the input can't sensibly be interpreted as a phone (empty,
 * length outside 7-15 digits after cleaning).
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const rawStr = String(raw).trim();
  if (!rawStr) return null;

  // Was the caller giving us an explicit E.164-shaped input? If yes, we
  // must NOT re-prefix a country code onto it later — the caller already
  // told us which country by using + or 00.
  const hadE164Prefix = /^(\+|00)/.test(rawStr);

  // Strip everything that isn't a digit, then normalise the international
  // dialing prefix if present.
  let digits = rawStr.replace(/\D/g, "");
  if (rawStr.startsWith("00")) digits = digits.replace(/^00/, "");

  if (!digits) return null;
  if (digits.length < 7 || digits.length > 15) return null;

  // Already Nigerian E.164 (234 + 10-digit mobile starting 7/8/9).
  if (/^234[789]\d{9}$/.test(digits)) return digits;

  // Nigerian E.164 length but a wrong 4th digit — likely a real
  // international number that a previous version of this function
  // mangled (`234` + a UK/US/ZA/etc. wa_id). Strip the fake 234 and
  // re-run through the same normaliser recursively — one hop only.
  if (/^234[0-6]/.test(digits) || (digits.startsWith("234") && digits.length > 13)) {
    return normaliseInternational(digits.slice(3));
  }

  // If the caller explicitly gave us +/00 prefix, honor it as E.164 and
  // don't touch the country code at all — just strip separators.
  if (hadE164Prefix) return normaliseInternational(digits);

  // Nigerian national with trunk zero (e.g. 08012345678).
  if (/^0[789]\d{9}$/.test(digits)) return "234" + digits.slice(1);

  // Bare NG mobile without trunk or country code (e.g. 8012345678).
  if (/^[789]\d{9}$/.test(digits)) return "234" + digits;

  // Unknown shape — return as-is rather than fabricating a country code.
  // Preserves the digits verbatim so an admin can spot and fix it.
  return digits;
}

// Sanity gate for a raw international number. Same length check as the
// main function so we don't return junk.
function normaliseInternational(digits: string): string | null {
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

/**
 * @deprecated Kept for one release so existing imports don't break.
 * Use {@link normalisePhone} — it handles international numbers correctly.
 */
export const normalisePhoneNG = normalisePhone;
