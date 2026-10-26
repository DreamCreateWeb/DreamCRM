'use client'

/**
 * Deployment-skew resilience for auth-critical forms.
 *
 * We deploy on every merge (dozens of times a day). A page rendered by an old
 * build can submit a Server Action that the NEW server no longer recognizes —
 * Next.js then throws:
 *
 *   "Failed to find Server Action "…". This request might be from an older or
 *    newer deployment."
 *
 * Auth + invite pages are the worst hit: they're opened from EMAIL LINKS and
 * may sit open for hours/days across many deploys. The fix is to detect that
 * specific failure and hard-reload (preserving the current URL incl. token
 * params), which re-fetches the fresh action ids — the user just sees a brief
 * "we shipped an update, refreshing…" instead of a raw error.
 *
 * This module is isomorphic-safe (the reload only fires in the browser). The
 * classifier itself lives in `lib/deployment-skew.ts` — ONE home since
 * 2026-10-26; this file carried its own copy for the auth screens before the
 * dashboard-wide one existed, and two copies of "is this the redeploy throw"
 * drift the first time Next rewords it. Re-exported here so the ten screens
 * that import it from this path keep working unchanged.
 */

import { isDeploymentSkewError } from '@/lib/deployment-skew'

export { isDeploymentSkewError }

/** Reload the current page (URL + token params intact). Browser-only. */
export function reloadPreservingUrl(): void {
  if (typeof window !== 'undefined') {
    window.location.reload()
  }
}

/**
 * Wrap a Server Action (or auth-client) call so a deployment-skew failure
 * triggers a transparent reload instead of bubbling a raw error. On skew it
 * calls `onSkew` (so the caller can flip UI to a "refreshing…" message) and
 * then reloads — the returned promise never resolves in that case (the page is
 * navigating away). Any OTHER error is re-thrown for the caller to handle
 * normally.
 *
 * @example
 *   const details = await guardedCall(() => getInvitationDetails(token), () =>
 *     setStep({ type: 'refreshing' }))
 */
export async function guardedCall<T>(fn: () => Promise<T>, onSkew?: () => void): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (isDeploymentSkewError(err)) {
      onSkew?.()
      reloadPreservingUrl()
      // Hang the promise — we're reloading; resolving/rejecting would let the
      // caller render a flash of error UI before navigation.
      return await new Promise<T>(() => {})
    }
    throw err
  }
}
