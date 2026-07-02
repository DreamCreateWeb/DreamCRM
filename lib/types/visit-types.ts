/**
 * Client-safe visit-type catalog. The per-clinic list lives in
 * `clinic_profile.visit_type_settings` (jsonb); when null,
 * `resolveVisitTypes()` returns the universal defaults so a clinic can book the
 * day it signs up with no configuration.
 *
 * The catalog is consumed in three places: the front-desk "Book appointment"
 * drawer, the public booking widget, and the patient portal. Each entry carries
 * a duration (so booking can compute endTime) plus two bookable flags that gate
 * whether the public widget / portal offer it.
 *
 * `appointment.type` stays a free string — we store the visit-type `id`. The
 * resolver always appends an "Other" escape hatch so patients/staff can book a
 * reason that isn't in the configured list.
 */

export interface VisitType {
  /** Stable id, stored as `appointment.type`. Slug-like (e.g. 'root_canal'). */
  id: string
  /** Display label shown in pickers. */
  label: string
  /** Default appointment length in minutes — drives the booking endTime. */
  durationMinutes: number
  /** Offered in the public booking widget. */
  bookablePublic: boolean
  /** Offered in the patient-portal booking form. */
  bookablePortal: boolean
  /**
   * Card deposit (cents) collected at PUBLIC online booking, credited toward
   * the visit. 0 = none. Only takes effect when the clinic's Stripe Connect
   * account is active — without it booking proceeds deposit-free (fail open;
   * a payments hiccup must never block a patient from booking).
   */
  depositCents: number
}

export type VisitTypeSettings = VisitType[]

/** Final escape-hatch option appended to every resolved list so a patient or
 *  the front desk can always book a reason that isn't in the catalog. */
export const OTHER_VISIT_TYPE_ID = 'other'

/**
 * Universal default catalog — the union of the three lists that were
 * previously hardcoded across the front-desk drawer, the public widget, and the
 * portal. Durations are conservative 30-minute defaults except where a longer
 * appointment is the obvious norm (root canal / new-patient exam). Procedure
 * visits (filling / extraction / root canal) default to NOT publicly bookable —
 * those are scheduled by the front desk after a consult, matching the portal's
 * "procedure visits excluded by default" decision (the wrong-type
 * schedule-buster fix).
 */
export const DEFAULT_VISIT_TYPES: VisitType[] = [
  { id: 'checkup', label: 'Checkup', durationMinutes: 30, bookablePublic: true, bookablePortal: true, depositCents: 0 },
  { id: 'cleaning', label: 'Cleaning', durationMinutes: 30, bookablePublic: true, bookablePortal: true, depositCents: 0 },
  { id: 'consultation', label: 'Consultation', durationMinutes: 30, bookablePublic: true, bookablePortal: true, depositCents: 0 },
  { id: 'emergency', label: 'Emergency / tooth pain', durationMinutes: 30, bookablePublic: true, bookablePortal: false, depositCents: 0 },
  { id: 'filling', label: 'Filling', durationMinutes: 30, bookablePublic: false, bookablePortal: false, depositCents: 0 },
  { id: 'extraction', label: 'Extraction', durationMinutes: 45, bookablePublic: false, bookablePortal: false, depositCents: 0 },
  { id: 'root_canal', label: 'Root canal', durationMinutes: 60, bookablePublic: false, bookablePortal: false, depositCents: 0 },
  { id: OTHER_VISIT_TYPE_ID, label: 'Other / not sure', durationMinutes: 30, bookablePublic: true, bookablePortal: true, depositCents: 0 },
]

/** Clamp a duration into a sane booking range (one slot .. a half-day). */
function cleanDuration(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 30
  return Math.min(480, Math.max(15, Math.round(n)))
}

/** Clamp a deposit into 0..$1,000 whole cents. Absent/malformed → 0 (off) —
 *  most clinics don't charge one, so off is always the safe default. */
function cleanDeposit(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(100_000, Math.round(n))
}

function cleanId(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const id = v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return id.length > 0 ? id : null
}

/**
 * Resolve the stored jsonb into a clean `VisitType[]`. Null / malformed →
 * `DEFAULT_VISIT_TYPES`. A stored array is sanitized (ids slugged + de-duped,
 * durations clamped, flags coerced to booleans) and an "Other" escape hatch is
 * guaranteed at the end so booking never dead-ends.
 *
 * Pure + client-safe — used by the public widget, the portal, and the
 * front-desk drawer, plus the practice settings editor.
 */
export function resolveVisitTypes(stored: unknown): VisitType[] {
  if (!Array.isArray(stored) || stored.length === 0) return structuredClone(DEFAULT_VISIT_TYPES)

  const seen = new Set<string>()
  const out: VisitType[] = []
  for (const raw of stored) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const id = cleanId(r.id) ?? cleanId(r.label)
    if (!id || seen.has(id)) continue
    const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim() : id.replace(/_/g, ' ')
    seen.add(id)
    out.push({
      id,
      label,
      durationMinutes: cleanDuration(r.durationMinutes),
      // Default both flags true when absent so a clinic-added type is bookable
      // unless they explicitly turn it off in the editor.
      bookablePublic: r.bookablePublic === undefined ? true : !!r.bookablePublic,
      bookablePortal: r.bookablePortal === undefined ? true : !!r.bookablePortal,
      depositCents: cleanDeposit(r.depositCents),
    })
  }

  if (out.length === 0) return structuredClone(DEFAULT_VISIT_TYPES)
  // Guarantee an "Other" fallback so booking always has an escape hatch.
  if (!out.some((t) => t.id === OTHER_VISIT_TYPE_ID)) {
    out.push({ ...DEFAULT_VISIT_TYPES[DEFAULT_VISIT_TYPES.length - 1] })
  }
  return out
}

/** Look up one visit type by id within a resolved list. */
export function findVisitType(types: VisitType[], id: string | null | undefined): VisitType | null {
  if (!id) return null
  return types.find((t) => t.id === id) ?? null
}

/**
 * Duration (minutes) for a given visit-type id against the stored settings.
 * Falls back to 30 when the id is unknown — the historical default.
 */
export function visitTypeDuration(stored: unknown, id: string | null | undefined): number {
  const found = findVisitType(resolveVisitTypes(stored), id)
  return found?.durationMinutes ?? 30
}

/**
 * Deposit (cents) required at public booking for a visit-type id. Unknown id
 * (incl. the "Other" escape hatch unless explicitly configured) → 0.
 */
export function visitTypeDepositCents(stored: unknown, id: string | null | undefined): number {
  const found = findVisitType(resolveVisitTypes(stored), id)
  return found?.depositCents ?? 0
}

/** Public-bookable subset (widget). */
export function publicVisitTypes(stored: unknown): VisitType[] {
  return resolveVisitTypes(stored).filter((t) => t.bookablePublic)
}

/** Portal-bookable subset (portal booking form). */
export function portalVisitTypes(stored: unknown): VisitType[] {
  return resolveVisitTypes(stored).filter((t) => t.bookablePortal)
}
