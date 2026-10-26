import { ACTION_FAILED_MESSAGE, STALE_APP_MESSAGE, isDeploymentSkewError } from '@/lib/deployment-skew'

/**
 * THE ONE WRAPPER a client component awaits a server action through
 * (promoted from the Studio on 2026-10-26; the Studio's own module re-exports
 * it with its own copy bound).
 *
 * A server action that REFUSES (a validation error) resolves to
 * `{ ok: false, error }` and needs nothing. One that THROWS — the network
 * dropped, the server errored, or the server was redeployed and no longer
 * knows this build's action id — escapes every bare `await`: the status
 * sticks on "Saving…", busy flags never reset, the button is dead until the
 * person refreshes. That was the "editor freezes, refresh to continue" the
 * first client lived with in the Studio (1,624 refusals in 14 days of prod
 * logs), and every other panel in the dashboard awaited its actions the same
 * way.
 *
 * The result shape stays the action's own, with one addition: `stale: true`
 * when the throw was the redeploy case, so the host can offer a REFRESH
 * instead of a retry — a retry re-sends the same dead action id.
 *
 * The law (CLAUDE.md, 2026-10-23): a client component never bare-awaits a
 * server action; busy flags reset in a `finally`; offer Refresh, never retry.
 * `tests/ui/no-bare-await.test.ts` holds the tree to it.
 */
export type ActionFailure = { ok: false; error: string; stale?: true }

export type RunActionOptions = {
  /** What the person reads when the throw was a redeploy under their tab.
   *  Defaults to the dashboard-wide line; the Studio binds its own, which
   *  mentions the field they were typing in. */
  staleMessage?: string
}

export async function runAction<T extends { ok: boolean }>(
  fn: () => Promise<T>,
  opts: RunActionOptions = {},
): Promise<T | ActionFailure> {
  try {
    return await fn()
  } catch (err) {
    if (isDeploymentSkewError(err)) return { ok: false, error: opts.staleMessage ?? STALE_APP_MESSAGE, stale: true }
    return { ok: false, error: ACTION_FAILED_MESSAGE }
  }
}

export function isStaleFailure(res: { ok: boolean; stale?: true }): res is ActionFailure & { stale: true } {
  return !res.ok && res.stale === true
}
