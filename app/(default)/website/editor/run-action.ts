import { STALE_STUDIO_MESSAGE } from '@/lib/deployment-skew'
import { runAction as runActionShared, type ActionFailure } from '@/lib/run-action'

/**
 * The Studio's door onto the shared wrapper. `runAction` was born here
 * (2026-10-23) and was promoted to `lib/run-action.ts` on 2026-10-26 so every
 * panel in the dashboard awaits its actions the same way; this module stays
 * so the Studio's imports, its source guards and its tests are untouched.
 *
 * The one thing it adds: the Studio's OWN stale copy. The dashboard-wide line
 * says "anything you saved is safe"; the Studio's also warns that text still
 * open in a field needs typing again, because a half-edited section is the
 * thing a refresh loses here.
 */
export { isStaleFailure, type ActionFailure } from '@/lib/run-action'

export function runAction<T extends { ok: boolean }>(fn: () => Promise<T>): Promise<T | ActionFailure> {
  return runActionShared(fn, { staleMessage: STALE_STUDIO_MESSAGE })
}
