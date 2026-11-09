import { findVisitType, OTHER_VISIT_TYPE_ID, type VisitType } from '@/lib/types/visit-types'

/**
 * The ONE patient-facing name of a visit. The clinic's own visit types
 * (Settings → visit types) carry the labels, so a custom "Implant consult"
 * reads as exactly that on the card, the history, the records page and the
 * calendar file. 'Visit' only when the id names nothing the clinic defined —
 * and for the catalog's "Other / not sure" escape hatch, which is a booking
 * reason, not a name a patient wants on their card.
 */
export function portalVisitLabel(types: VisitType[], type: string | null | undefined): string {
  if (!type || type === OTHER_VISIT_TYPE_ID) return 'Visit'
  const label = findVisitType(types, type)?.label?.trim()
  return label || 'Visit'
}
