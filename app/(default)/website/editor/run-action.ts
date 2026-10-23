import { ACTION_FAILED_MESSAGE, STALE_STUDIO_MESSAGE, isDeploymentSkewError } from '@/lib/deployment-skew'

/**
 * Every server action the Studio awaits goes through here. A server action
 * that REFUSES (a validation error) resolves to `{ ok: false, error }` and
 * needs nothing; one that THROWS — the network dropped, the server errored,
 * or the server was redeployed and no longer knows this build's action id —
 * used to escape every caller: the status stuck on "Saving…", busy flags
 * never reset, the canvas never heard back. That was the "editor freezes,
 * refresh to continue" the first client lived with.
 *
 * The result shape stays the action's own, with one addition: `stale: true`
 * when the throw was the redeploy case, so the host can offer a refresh
 * instead of a retry.
 */
export type ActionFailure = { ok: false; error: string; stale?: true }

export async function runAction<T extends { ok: boolean }>(fn: () => Promise<T>): Promise<T | ActionFailure> {
  try {
    return await fn()
  } catch (err) {
    if (isDeploymentSkewError(err)) return { ok: false, error: STALE_STUDIO_MESSAGE, stale: true }
    return { ok: false, error: ACTION_FAILED_MESSAGE }
  }
}

export function isStaleFailure(res: { ok: boolean; stale?: true }): res is ActionFailure & { stale: true } {
  return !res.ok && res.stale === true
}
