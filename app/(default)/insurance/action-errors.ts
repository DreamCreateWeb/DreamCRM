/**
 * A failed insurance action reports `errors` (field → message). A THROWN one
 * (a redeploy under the tab, a dropped connection) comes back through
 * `runAction` as `{ ok: false, error }` — fold it into the same shape under
 * `_form` so every caller shows it where it already shows a form error.
 */
export function failureErrors(r: { errors: Record<string, string> } | { error: string }): Record<string, string> {
  return 'errors' in r ? r.errors : { _form: r.error }
}
