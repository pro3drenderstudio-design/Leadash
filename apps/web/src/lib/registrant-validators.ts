/**
 * Input sanitizers for the Domain Registrant fields. Each function strips
 * disallowed characters as the user types, so invalid input never lands in
 * state. Names allow Unicode letters via \p{L} so non-ASCII names (Müller,
 * O'Brien, Saint-Denis, José) work out of the box.
 */

/** Letters (any script), spaces, hyphens, apostrophes. No digits or symbols. */
export function sanitizeName(input: string): string {
  return input.replace(/[^\p{L} '\-]/gu, "");
}

/** Letters and spaces only. Used for state/province free-form input. */
export function sanitizeLettersOnly(input: string): string {
  return input.replace(/[^\p{L} ]/gu, "");
}

/** ISO-style country code: letters only, force uppercase, hard-cap at 2 chars. */
export function sanitizeCountryCode(input: string): string {
  return input.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2);
}

/**
 * Alphanumeric + spaces + hyphens, capped at 10 chars. Covers US ZIP (10001),
 * US ZIP+4 (10001-1234), UK (SW1A 1AA), Canada (K1A 0B1), etc.
 */
export function sanitizeZip(input: string): string {
  return input.replace(/[^A-Za-z0-9 \-]/g, "").slice(0, 10);
}
