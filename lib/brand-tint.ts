/**
 * Brand alpha tints — replaces the `${brand}1F`-style literals scattered
 * through the templates. Two problems with the raw form: the hex alpha
 * suffix is unreadable ("1F is… 12%?"), and it silently breaks when `brand`
 * isn't a 6-digit hex (shorthand `#9CF`, or a var() string) — the suffix
 * just corrupts the color. This helper names the intent and degrades safely.
 * Pure + client-safe.
 */

/** #RRGGBB + alpha(0..1) → #RRGGBBAA. Non-6-digit input returns the input
 *  untouched (an un-tinted brand beats a corrupted color). */
export function brandTint(brand: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(brand)) return brand
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
  return `${brand}${a.toString(16).padStart(2, '0').toUpperCase()}`
}
