'use client'

import { STALE_APP_MESSAGE } from '@/lib/deployment-skew'

/**
 * The Refresh offer that rides beside an inline error line when the failure
 * was a redeploy under the tab (`runAction` returns STALE_APP_MESSAGE). Refresh,
 * never retry: a retry re-sends the same dead action id. Renders nothing for
 * any other error, so a surface can drop it next to its error text.
 */
export function StaleRefresh({ error }: { error: string | null | undefined }) {
  if (error !== STALE_APP_MESSAGE) return null
  return (
    <>
      {' '}
      <button type="button" onClick={() => window.location.reload()} className="underline font-semibold">
        Refresh
      </button>
    </>
  )
}
