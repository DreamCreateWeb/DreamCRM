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
 * This module is intentionally dependency-free and isomorphic-safe (the reload
 * only fires in the browser).
 */

/**
 * True when an unknown thrown value is the Next.js stale-server-action error
 * (or an adjacent action-not-found / deployment-mismatch error). Matches on
 * the message AND digest because Next surfaces it differently depending on
 * whether the action rejected on the server (digest) or the fetch failed.
 */
export function isDeploymentSkewError(err: unknown): boolean {
  if (!err) return false
  const parts: string[] = []
  if (typeof err === 'string') parts.push(err)
  if (err instanceof Error) {
    parts.push(err.message)
    const digest = (err as { digest?: unknown }).digest
    if (typeof digest === 'string') parts.push(digest)
  } else if (typeof err === 'object') {
    const o = err as { message?: unknown; digest?: unknown }
    if (typeof o.message === 'string') parts.push(o.message)
    if (typeof o.digest === 'string') parts.push(o.digest)
  }
  const haystack = parts.join(' ').toLowerCase()
  if (!haystack) return false
  return (
    haystack.includes('failed to find server action') ||
    haystack.includes('older or newer deployment') ||
    // Next sometimes serializes this as a generic action-id miss.
    (haystack.includes('server action') && haystack.includes('deployment'))
  )
}

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
