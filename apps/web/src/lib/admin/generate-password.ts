/**
 * Cryptographically-secure temp password generator for admin-initiated
 * account creation and admin resets. 14 chars, guaranteed one of each
 * class (upper, lower, digit, symbol) so it always clears typical
 * password-strength policies. Chars sampled from a set stripped of
 * ambiguous glyphs (0/O, 1/l/I) so users don't misread when reading a
 * password out loud over the phone as a fallback.
 */
import { randomInt } from "node:crypto";

const UPPER  = "ABCDEFGHJKLMNPQRSTUVWXYZ";  // no I, O
const LOWER  = "abcdefghijkmnpqrstuvwxyz";  // no l, o
const DIGIT  = "23456789";                  // no 0, 1
const SYMBOL = "!@#$%&*+=?";

function pick(source: string): string {
  return source[randomInt(0, source.length)];
}

function shuffle(chars: string[]): string[] {
  // Fisher–Yates with crypto-quality randomness.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
}

export function generateTempPassword(length = 14): string {
  if (length < 8) throw new Error("length must be >= 8");
  const required = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)];
  const pool = UPPER + LOWER + DIGIT + SYMBOL;
  const rest: string[] = [];
  for (let i = 0; i < length - required.length; i++) rest.push(pick(pool));
  return shuffle([...required, ...rest]).join("");
}
