/**
 * Pure helpers for the one failure a long-lived tab cannot recover from on its
 * own: calling a server action that no longer exists because the server was
 * redeployed under it. Next.js rejects such a call with a thrown Error (never
 * an `{ ok: false }` result), so every awaited action in a client component
 * needs a catch that can tell this case from an ordinary failure.
 */

const SKEW_PATTERNS = [
  /failed to find server action/i,
  /older or newer deployment/i,
  /server action .* was not found on the server/i,
  /unrecognized\s*action/i,
]

/** True when `err` is Next's "this action id is from another build" refusal. */
export function isDeploymentSkewError(err: unknown): boolean {
  if (!err) return false
  const e = err as { name?: unknown; message?: unknown; digest?: unknown }
  const name = typeof e.name === 'string' ? e.name : ''
  if (name === 'UnrecognizedActionError') return true
  const text = [typeof e.message === 'string' ? e.message : '', typeof e.digest === 'string' ? e.digest : '', typeof err === 'string' ? err : '']
    .filter(Boolean)
    .join('\n')
  return SKEW_PATTERNS.some((re) => re.test(text))
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
