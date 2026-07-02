'use client'

import { useState } from 'react'
import { getMyReferralLinkAction } from '@/app/(portal)/patient/actions'
import { PortalCard, PORTAL_INK, PORTAL_MUTED, PORTAL_BORDER } from '@/components/patient-portal/ui'

/**
 * Refer-a-friend share card on the portal home. The link mints lazily — only
 * when the patient actually taps to share — via getMyReferralLinkAction; on
 * phones we hand the URL to the native share sheet, elsewhere it copies.
 */
export default function ReferCard({
  brand,
  clinicName,
  referredCount,
}: {
  brand: string
  clinicName: string
  referredCount: number
}) {
  const [state, setState] = useState<'idle' | 'working' | 'shared' | 'copied' | 'error'>('idle')
  const [error, setError] = useState('')

  async function share() {
    setState('working')
    setError('')
    const r = await getMyReferralLinkAction()
    if (!r.ok) {
      setError(r.error)
      setState('error')
      return
    }
    const shareData = {
      title: clinicName,
      text: `I go to ${clinicName} — you can grab a time online here:`,
      url: r.shareUrl,
    }
    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData)
        setState('shared')
        return
      } catch {
        // Share sheet dismissed — fall through to copy so the tap still helps.
      }
    }
    try {
      await navigator.clipboard.writeText(r.shareUrl)
      setState('copied')
    } catch {
      setError(r.shareUrl) // clipboard blocked — show the raw link to copy by hand
      setState('error')
    }
  }

  return (
    <PortalCard>
      <p className="text-[1.05rem] font-semibold" style={{ color: PORTAL_INK }}>
        Know someone looking for a dentist?
      </p>
      <p className="mt-1 text-[0.9rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
        Share your personal link — it takes them straight to booking with us, and we’ll know they
        came from you.
      </p>
      {referredCount > 0 && (
        <p className="mt-2 text-[0.85rem] font-medium" style={{ color: brand }}>
          You’ve sent {referredCount === 1 ? 'a friend' : `${referredCount} friends`} our way — thank
          you.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={share}
          disabled={state === 'working'}
          className="rounded-full px-5 py-2.5 text-[0.9rem] font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: brand }}
        >
          {state === 'working' ? 'One sec…' : 'Share my link'}
        </button>
        {state === 'copied' && (
          <span className="text-[0.85rem] font-medium" style={{ color: PORTAL_MUTED }}>
            Link copied — paste it anywhere.
          </span>
        )}
        {state === 'shared' && (
          <span className="text-[0.85rem] font-medium" style={{ color: PORTAL_MUTED }}>
            Thanks for spreading the word.
          </span>
        )}
      </div>
      {state === 'error' && error && (
        <p
          className="mt-3 break-all rounded-xl px-3 py-2 text-[0.82rem]"
          style={{ border: `1px solid ${PORTAL_BORDER}`, color: PORTAL_MUTED }}
        >
          {error}
        </p>
      )}
    </PortalCard>
  )
}
