/**
 * THE lead-age label (single home, 2026-07-21): hours roll into days into
 * months so nobody reads "888h ago" and has to divide by 24. Used by the
 * Leads board and the Overview new-leads attention card — one voice.
 */
export function leadAgeLabel(ageHours: number): string {
  if (ageHours < 1) return 'just now'
  if (ageHours < 24) return `${ageHours}h ago`
  const days = Math.floor(ageHours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}
