/**
 * Client-safe topic buckets for a feedback submission, stored on the existing
 * `feedback.category` text column (which used to be hardcoded to 'nps'). Kept
 * local to the feedback page so both the submit form and the platform-admin
 * inbox share one list — the form writes an id, the inbox filters + labels by
 * it. Adding a bucket is a one-line edit here, no migration (the column is a
 * free-text `text` with a 40-char cap enforced by `FeedbackInput`).
 *
 * `general` is the render-safe fallback: it's what `FeedbackInput` defaults to,
 * so any legacy row (incl. the old 'nps' rows) that isn't one of the ids below
 * still gets a readable label in the inbox.
 */
export interface FeedbackCategory {
  id: string
  label: string
  /** One-line hint shown under the picker so the buckets aren't ambiguous. */
  hint: string
}

export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = [
  { id: 'booking', label: 'Booking & scheduling', hint: 'Online booking, appointments, reminders' },
  { id: 'billing', label: 'Billing & payments', hint: 'Plans, invoices, the shop, memberships' },
  { id: 'website', label: 'Website & studio', hint: 'Your public site and the website editor' },
  { id: 'reports', label: 'Reports & analytics', hint: 'Dashboards, the overview, exports' },
  { id: 'other', label: 'Something else', hint: 'Anything not covered above' },
] as const

/** The bucket a fresh submission starts on (also the schema default). */
export const DEFAULT_FEEDBACK_CATEGORY = 'other'

const LABEL_BY_ID = new Map(FEEDBACK_CATEGORIES.map((c) => [c.id, c.label]))

/**
 * Human label for a stored category id. Falls back to a Title-Cased version of
 * an unknown id (so a legacy 'nps'/'general' row reads as "Nps"/"General"
 * rather than a raw slug) — the inbox never shows a blank pill.
 */
export function feedbackCategoryLabel(id: string): string {
  const known = LABEL_BY_ID.get(id)
  if (known) return known
  if (!id) return 'General'
  return id.charAt(0).toUpperCase() + id.slice(1)
}
