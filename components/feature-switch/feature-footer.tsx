'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useConfirmSafe } from '@/components/ui/confirm-dialog'
import { TONE_TEXT } from '@/lib/ui/encodings'
import { FEATURE_BY_KEY, FEATURE_INTRO, type FeatureKey } from '@/lib/feature-switches'
import { disableFeatureAction } from '@/app/(default)/feature-switch-actions'

/**
 * The way back out: one quiet line at the foot of a switched-on module's
 * ROOT page ("Turn off My Day"). It rides the module's layout, so it
 * reads the pathname and stays silent on every sub-page — "Turn off
 * Growth" under the campaign editor would be a trap, not a setting.
 * Owners and admins only; members see nothing. The confirm is awaited
 * BEFORE the transition (an async transition holds renders, and a dialog
 * inside one never paints).
 */
export default function FeatureFooter({ feature, canManage }: { feature: FeatureKey; canManage: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const confirm = useConfirmSafe()
  const def = FEATURE_BY_KEY[feature]
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  if (!canManage || pathname !== def.path) return null

  async function turnOff() {
    setError(null)
    const ok = await confirm({
      title: FEATURE_INTRO.turnOff(def.label),
      message: FEATURE_INTRO.turnOffConfirm(def.label),
      confirmLabel: FEATURE_INTRO.turnOff(def.label),
    })
    if (!ok) return
    startTransition(async () => {
      const r = await disableFeatureAction(feature)
      if (!r.ok) {
        setError(r.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-8 w-full max-w-7xl mx-auto" data-testid="feature-footer" data-feature={feature}>
      <button
        type="button"
        onClick={turnOff}
        disabled={pending}
        className="text-xs text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-60"
      >
        {FEATURE_INTRO.turnOff(def.label)}
      </button>
      {error && (
        <p className={`mt-1 text-xs ${TONE_TEXT.warn}`} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
