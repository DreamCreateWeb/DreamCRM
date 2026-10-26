/**
 * Pure helpers for the one failure a long-lived tab cannot recover from on its
 * own: calling a server action that no longer exists because the server was
 * redeployed under it. Next.js rejects such a call with a thrown Error (never
 * an `{ ok: false }` result), so every awaited action in a client component
 * needs a catch that can tell this case from an ordinary failure.
 *
 * THIS IS THE ONE HOME of that classifier (2026-10-26). It had two: this one
 * and a copy in `lib/auth/submit-guard.ts` that the auth, onboarding and
 * invite screens imported, each matching a slightly different set of shapes.
 * Two classifiers for one failure drift the first time Next changes its
 * wording, so `submit-guard` re-exports this one and the two pattern sets are
 * merged below. The shared wrapper every client component should await an
 * action through is `runAction` in `lib/run-action.ts`.
 */

const SKEW_PATTERNS = [
  /failed to find server action/i,
  /older or newer deployment/i,
  /server action .* was not found on the server/i,
  /unrecognized\s*action/i,
]

/** True when `err` is Next's "this action id is from another build" refusal.
 *  Reads the message AND the digest, because Next surfaces it differently
 *  depending on whether the action rejected on the server (digest) or the
 *  fetch itself failed (message); a bare string is read as a message. */
export function isDeploymentSkewError(err: unknown): boolean {
  if (!err) return false
  const e = err as { name?: unknown; message?: unknown; digest?: unknown }
  const name = typeof e.name === 'string' ? e.name : ''
  if (name === 'UnrecognizedActionError') return true
  const text = [typeof e.message === 'string' ? e.message : '', typeof e.digest === 'string' ? e.digest : '', typeof err === 'string' ? err : '']
    .filter(Boolean)
    .join('\n')
  if (!text) return false
  if (SKEW_PATTERNS.some((re) => re.test(text))) return true
  // Next sometimes serializes this as a generic action-id miss: the words
  // "server action" and "deployment" present, in either order, with none of
  // the canonical sentences. Carried over from the auth copy of this check.
  return /server action/i.test(text) && /deployment/i.test(text)
}

/** What a stale Studio tab reads before it refreshes. */
export const STALE_STUDIO_MESSAGE =
  'The Studio was updated while you were editing. Refresh to keep editing — everything you already saved is safe; text still open in a field will need typing again.'

/** The dashboard-wide version of the same prompt. */
export const STALE_APP_MESSAGE = 'DreamCRM was updated while this tab was open. Refresh to keep working — anything you saved is safe.'

/** The honest line for a save that threw for some other reason. */
export const ACTION_FAILED_MESSAGE = 'That didn’t save — check your connection and try again.'

/** True when two build ids are both known and differ. An unknown side never
 *  reports skew: a missing id is a configuration gap, not a redeploy. */
export function buildsDiffer(mine: string | null | undefined, theirs: string | null | undefined): boolean {
  if (!mine || !theirs) return false
  if (mine === 'dev' || theirs === 'dev') return false
  return mine !== theirs
}
