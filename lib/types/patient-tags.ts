/**
 * Client-safe patient-tag types + the fixed color palette.
 *
 * Tags carry a color from a small curated set (not arbitrary hex) so chips stay
 * legible + on-brand everywhere they render — the patient list, the detail
 * editor, the audience builder. Each tone maps to a Tailwind class pair for the
 * chip; `gray` is the neutral default.
 */

export const PATIENT_TAG_COLORS = [
  'gray',
  'teal',
  'indigo',
  'violet',
  'amber',
  'rose',
  'emerald',
  'sky',
] as const

export type PatientTagColor = (typeof PATIENT_TAG_COLORS)[number]

export function isPatientTagColor(v: unknown): v is PatientTagColor {
  return typeof v === 'string' && (PATIENT_TAG_COLORS as readonly string[]).includes(v)
}

/** Normalize an unknown color to a valid tone (defaults to gray). */
export function coerceTagColor(v: unknown): PatientTagColor {
  return isPatientTagColor(v) ? v : 'gray'
}

/** Chip class pair per tone (background + text + ring), light + dark. */
export const TAG_CHIP_CLASSES: Record<PatientTagColor, string> = {
  gray: 'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-700/40 dark:text-gray-200 dark:ring-gray-600',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800',
}

/** A small swatch class (solid dot) per tone — for the color picker. */
export const TAG_DOT_CLASSES: Record<PatientTagColor, string> = {
  gray: 'bg-gray-400',
  teal: 'bg-teal-500',
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
}

export const MAX_TAG_NAME_LEN = 32

/** A tag as surfaced to the UI (catalog row, optionally with a usage count). */
export interface PatientTagView {
  id: string
  name: string
  color: PatientTagColor
  /** Patients currently carrying this tag (only populated by the catalog list). */
  patientCount?: number
}
