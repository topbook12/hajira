/**
 * Phone normalization — the #1 login blocker in the field.
 *
 * The same Bangladeshi number arrives in many shapes depending on the phone,
 * the keyboard and the user's habit:
 *
 *   01521706294      local format (11 digits, what most people type)
 *   +8801521706294   international with +
 *   8801521706294    international without +
 *   1521706294       dropped trunk 0 (10 digits)
 *
 * Before normalization these were FOUR different accounts; a student who
 * signed up with one format and later logged in with another silently
 * created a second, empty account (or hit the teacher's row) — which looked
 * exactly like "my data won't load on my phone".
 *
 * Canonical storage format: 01XXXXXXXXX (11 digits, BD local).
 */
export function normalizeBdPhone(raw: string): string {
  let digits = String(raw || '').replace(/\D/g, '')

  // 8801XXXXXXXXX (13) -> drop country code -> 1XXXXXXXXX
  if (digits.length === 13 && digits.startsWith('880')) {
    digits = digits.slice(3)
  } else if (digits.length === 12 && digits.startsWith('80')) {
    // 80 1XXXXXXXXX — someone dropped one 8
    digits = digits.slice(2)
  }

  // 1XXXXXXXXX (10, trunk 0 dropped) -> 01XXXXXXXXX
  if (digits.length === 10 && digits.startsWith('1')) {
    digits = '0' + digits
  }

  return digits
}

/** True when the normalized number is a plausible BD mobile number. */
export function isBdMobile(normalized: string): boolean {
  return /^01[3-9]\d{8}$/.test(normalized)
}
