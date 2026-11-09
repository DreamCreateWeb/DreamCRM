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
  /**
   * Pre-visit prep instructions appended to this type's reminder emails
   * ("eat a light meal beforehand", "arrange a ride home"). Empty = none.
   */
  prepInstructions: string
  /**
   * Aftercare — the practice's own words, emailed the EVENING of a completed
   * visit of this type (ML-28, the `post_visit_care` lane: 6 PM clinic-local,
   * inside quiet hours, once per visit). Empty = nothing is sent for this
   * type. Optional on the type so older stored settings keep type-checking;
   * `resolveVisitTypes` always fills it — a stored entry with NO key gets the
   * standard default for its id, a stored '' stays '' (blank is the switch).
   */
  aftercareInstructions?: string
  /**
   * The day after a completed visit of this type, the Dream Team files a
   * "How are you feeling?" check-in for a yes (ML-28, `postop_checkin`).
   * Default true for the procedures that earn one (extraction, root canal,
   * implant); same absent-vs-stored rule as `aftercareInstructions`.
   */
  checkInAfter?: boolean
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
/**
 * Standard aftercare, keyed by visit-type id (ML-28). Short, honest, generic
 * dental aftercare a practice can send as-is or rewrite in its own words.
 * Keyed by ID rather than by position in the default list so a clinic-added
 * "Crown" or "Whitening" type (slugged 'crown' / 'whitening') picks its
 * default up too. No prices, no promises, no medical specifics a practice
 * did not state.
 */
export const DEFAULT_AFTERCARE_BY_ID: Readonly<Record<string, string>> = {
  cleaning:
    'Your teeth may feel a little sensitive for a day or two — that is normal after a cleaning. Keep brushing twice a day and flossing once; a soft-bristled brush is kindest while things settle.',
  filling:
    'Wait until the numbness wears off before eating so you do not bite your cheek or tongue. Some sensitivity to hot and cold for a few days is normal. If your bite feels high or uneven once the numbness is gone, give us a call — a quick adjustment fixes it.',
  extraction:
    'Keep gentle pressure on the gauze for the next 30–45 minutes. For the first 24 hours: no straws, no smoking, no rinsing or spitting, and skip hot drinks — all of them can loosen the clot that protects the site. Soft foods today, and rest. Mild swelling and discomfort are expected; call us if bleeding does not ease or pain gets worse after day three.',
  root_canal:
    'Wait until the numbness wears off before eating, and chew on the other side until your permanent filling or crown is in place. Some tenderness for a few days is normal and over-the-counter pain relief usually covers it. Call us if the pain is severe, the swelling grows, or the temporary filling comes out.',
  crown:
    'If you have a temporary crown, chew on the other side and avoid sticky or hard foods until the permanent one is placed. Some sensitivity is normal for a few days. If the temporary comes loose, keep it and call us — we will seat it again.',
  whitening:
    'Your teeth may be sensitive for a day or two. For the next 48 hours, skip anything that would stain a white shirt — coffee, tea, red wine, dark sauces — and avoid smoking. A sensitivity toothpaste helps if you need it.',
  implant:
    'Keep gentle pressure on the gauze for the first hour. For 24 hours: no straws, no smoking, no vigorous rinsing. Soft foods for the next few days, and keep the area clean with gentle brushing around it. Some swelling and bruising are expected; call us if pain or swelling increases after day three.',
}

/**
 * The visit types that earn a day-after "How are you feeling?" (ML-28). A
 * set of IDs for the same reason as the aftercare map: an extraction is an
 * extraction whether the practice kept the default type or added its own.
 */
export const CHECK_IN_AFTER_BY_DEFAULT: ReadonlySet<string> = new Set(['extraction', 'root_canal', 'implant'])

export const DEFAULT_VISIT_TYPES: VisitType[] = [
  { id: 'checkup', label: 'Checkup', durationMinutes: 30, bookablePublic: true, bookablePortal: true, depositCents: 0, prepInstructions: '', aftercareInstructions: '', checkInAfter: false },
  { id: 'cleaning', label: 'Cleaning', durationMinutes: 30, bookablePublic: true, bookablePortal: true, depositCents: 0, prepInstructions: '', aftercareInstructions: DEFAULT_AFTERCARE_BY_ID.cleaning, checkInAfter: false },
  { id: 'consultation', label: 'Consultation', durationMinutes: 30, bookablePublic: true, bookablePortal: true, depositCents: 0, prepInstructions: '', aftercareInstructions: '', checkInAfter: false },
  { id: 'emergency', label: 'Emergency / tooth pain', durationMinutes: 30, bookablePublic: true, bookablePortal: false, depositCents: 0, prepInstructions: '', aftercareInstructions: '', checkInAfter: false },
  { id: 'filling', label: 'Filling', durationMinutes: 30, bookablePublic: false, bookablePortal: false, depositCents: 0, prepInstructions: '', aftercareInstructions: DEFAULT_AFTERCARE_BY_ID.filling, checkInAfter: false },
  { id: 'extraction', label: 'Extraction', durationMinutes: 45, bookablePublic: false, bookablePortal: false, depositCents: 0, prepInstructions: '', aftercareInstructions: DEFAULT_AFTERCARE_BY_ID.extraction, checkInAfter: true },
  { id: 'root_canal', label: 'Root canal', durationMinutes: 60, bookablePublic: false, bookablePortal: false, depositCents: 0, prepInstructions: '', aftercareInstructions: DEFAULT_AFTERCARE_BY_ID.root_canal, checkInAfter: true },
  { id: OTHER_VISIT_TYPE_ID, label: 'Other / not sure', durationMinutes: 30, bookablePublic: true, bookablePortal: true, depositCents: 0, prepInstructions: '', aftercareInstructions: '', checkInAfter: false },
]

/** Clamp a duration into a sane booking range (one slot .. a half-day). */
function cleanDuration(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 30
  return Math.min(480, Math.max(15, Math.round(n)))
}

/** Trim + cap prep instructions (plain text appended to reminder emails). */
function cleanPrep(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, 600)
}

/** Aftercare: the practice's words, trimmed + capped (an email paragraph, not
 *  a pamphlet). ABSENT (no key — settings stored before ML-28) → the standard
 *  default for the id; a stored string — even '' — is the practice's own
 *  choice and wins. Blank is how a type is switched off. */
function cleanAftercare(v: unknown, id: string): string {
  if (v === undefined) return DEFAULT_AFTERCARE_BY_ID[id] ?? ''
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, 800)
}

/** The day-after check-in flag: absent → the standard default for the id;
 *  stored → the practice's choice. */
function cleanCheckInAfter(v: unknown, id: string): boolean {
  if (v === undefined) return CHECK_IN_AFTER_BY_DEFAULT.has(id)
  return !!v
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
      prepInstructions: cleanPrep(r.prepInstructions),
      aftercareInstructions: cleanAftercare(r.aftercareInstructions, id),
      checkInAfter: cleanCheckInAfter(r.checkInAfter, id),
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
 * Prep instructions for a visit-type id ('' when none / unknown id).
 */
export function visitTypePrepInstructions(stored: unknown, id: string | null | undefined): string {
  const found = findVisitType(resolveVisitTypes(stored), id)
  return found?.prepInstructions ?? ''
}

/**
 * Aftercare for a visit-type id ('' when none / unknown id) — the words the
 * post-visit-care lane emails the evening of a completed visit (ML-28).
 */
export function visitTypeAftercare(stored: unknown, id: string | null | undefined): string {
  const found = findVisitType(resolveVisitTypes(stored), id)
  return found?.aftercareInstructions ?? ''
}

/**
 * Does a completed visit of this type earn a day-after check-in (ML-28)?
 * Unknown id → false.
 */
export function visitTypeChecksInAfter(stored: unknown, id: string | null | undefined): boolean {
  const found = findVisitType(resolveVisitTypes(stored), id)
  return found?.checkInAfter ?? false
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
