'use client'

import type { RunActionOptions } from '@/lib/run-action'
import { GhostButton, PortalErrorText } from './ui'

/**
 * A patient mid-tap on a survey, plan, booking or review page when a deploy
 * lands is never stranded (ML-03). A server action addressed by an older
 * build's id is REFUSED by Next with a thrown error; `runAction` turns that
 * into `{ ok: false, stale: true }` and the form shows ONE calm line plus a
 * Reload — never a retry, which would re-send the same dead action id.
 *
 * The line is the patient's, not the dashboard's: no product name, nothing
 * about "saving", and it does not promise that what they sent landed.
 */
export const PORTAL_STALE_MESSAGE = 'This page was updated while it was open. Reload to continue.'

/** Hand to `runAction(() => action(…), PORTAL_RUN)` so a redeploy reads in the portal's voice. */
export const PORTAL_RUN: RunActionOptions = { staleMessage: PORTAL_STALE_MESSAGE }

/** The error line under a failed action; when the failure was the redeploy
 *  case it carries the Reload. Same role=alert, same tone as PortalErrorText. */
export function PortalActionError({ error }: { error: string | null | undefined }) {
  if (!error) return null
  return (
    <>
      <PortalErrorText>{error}</PortalErrorText>
      {error === PORTAL_STALE_MESSAGE && (
        <div className="mt-2">
          <GhostButton onClick={() => window.location.reload()} className="underline underline-offset-2">
            Reload
          </GhostButton>
        </div>
      )}
    </>
  )
}

/** Just the Reload, for forms whose own error line is custom-styled. */
export function PortalReloadWhenStale({ error }: { error: string | null | undefined }) {
  if (error !== PORTAL_STALE_MESSAGE) return null
  return (
    <div className="mt-2">
      <GhostButton onClick={() => window.location.reload()} className="underline underline-offset-2">
        Reload
      </GhostButton>
    </div>
  )
}
