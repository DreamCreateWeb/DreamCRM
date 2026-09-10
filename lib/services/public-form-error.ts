import 'server-only'

/**
 * What a patient is told when a public form can't be submitted.
 *
 * The sibling of `lib/services/checkout-error.ts`, for the other half of the
 * patient-facing surface: the booking widget, the request-a-visit form, the
 * contact form, the chat bubble and intake. Same reasoning, same shape.
 *
 * Every one of those raises TWO kinds of failure and they must not be shown
 * the same way:
 *
 *  - Something the patient can act on — "that slot is no longer available",
 *    "please add an email so we can reach you", "that time is too soon to book
 *    online". Those sentences are written FOR them, and hiding one behind a
 *    generic line turns a fixable form into a broken one. They throw
 *    `PublicFormError`.
 *
 *  - Anything else — the database down, an email provider throwing, a bug.
 *    The patient can do nothing with the underlying text and on a PUBLIC
 *    clinic page it is at best confusing and at worst leaks internals. Those
 *    surface as PUBLIC_FORM_UNAVAILABLE_MESSAGE and are logged server-side.
 *
 * A plain `throw` out of a server action is not a third option, and that was
 * the bug: Next.js replaces the message with an opaque digest in production,
 * so every one of those carefully worded lines reached the patient as "An
 * error occurred in the Server Components render". A patient whose slot had
 * just been taken was told nothing, and had no way to learn that picking
 * another time would work. Public entry points return a result rather than
 * throwing.
 */
export const PUBLIC_FORM_UNAVAILABLE_MESSAGE =
  'We couldn’t send that just now, and nothing was saved. Please try again in a few minutes — or give the office a call and we’ll take care of it.'

/** An error whose message was written for the patient and is safe to show. */
export class PublicFormError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublicFormError'
  }
}

/**
 * The shape every public form entry point returns. `data` carries whatever the
 * caller needs on success — `null` for the forms that only need "it landed".
 */
export type PublicFormResult<T = null> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Turn a thrown submission failure into the public result shape. `scope` is the
 * log prefix ('clinic-site.booking', 'intake', …) — it is never shown to anyone.
 */
export function publicFormFailure(scope: string, err: unknown): { ok: false; error: string } {
  if (err instanceof PublicFormError) return { ok: false, error: err.message }
  // Not a message we wrote — log the real thing where staff can find it and
  // tell the patient something true and actionable instead.
  console.error(`[${scope}] submission failed`, err)
  return { ok: false, error: PUBLIC_FORM_UNAVAILABLE_MESSAGE }
}
