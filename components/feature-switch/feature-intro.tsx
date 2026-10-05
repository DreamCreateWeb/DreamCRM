'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { TONE_TEXT } from '@/lib/ui/encodings'
import { FEATURE_BY_KEY, FEATURE_INTRO, type FeatureKey } from '@/lib/feature-switches'
import { enableFeatureAction } from '@/app/(default)/feature-switch-actions'

/**
 * THE GENERIC INTRO CARD — the insurance intro's shape (what it does, what
 * to know, ONE button) for every switched module that has no setup of its
 * own. The copy is the registry's (lib/feature-switches.ts), so the card
 * and the sidebar label agree, and a feature that grows a real setup (S5:
 * Intake Forms, Growth, Payments) swaps this for its own intro by setting
 * `ownIntro` rather than editing here.
 */
export default function FeatureIntro({
  feature,
  label,
  eyebrow,
  canManage,
}: {
  feature: FeatureKey
  label: string
  eyebrow: string
  canManage: boolean
}) {
  const router = useRouter()
  const def = FEATURE_BY_KEY[feature]
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function turnOn() {
    setError(null)
    startTransition(async () => {
      const r = await enableFeatureAction(feature)
      if (!r.ok) {
        setError(r.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
      <PageHeader eyebrow={eyebrow} title={label} subtitle={def.lede} actions={<StatusPill tone="neutral" label={FEATURE_INTRO.notOn} />} />

      <section className="v2-card px-5 py-5 sm:px-6 sm:py-6" data-testid="feature-intro" data-feature={feature}>
        <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">What it does</p>
        <ul className="mt-2 space-y-2">
          {def.does.map((line) => (
            <li key={line} className="flex gap-2 text-sm text-gray-800 dark:text-gray-100">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">What to know</p>
        <ul className="mt-2 space-y-1.5">
          {def.know.map((line) => (
            <li key={line} className="text-sm text-gray-600 dark:text-gray-300">
              {line}
            </li>
          ))}
        </ul>

        {error && (
          <p className={`mt-4 text-xs ${TONE_TEXT.warn}`} role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {canManage ? (
            <ActionButton variant="primary" breath pending={pending} onClick={turnOn}>
              {FEATURE_INTRO.turnOn(label)}
            </ActionButton>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300">{FEATURE_INTRO.askManager}</p>
          )}
        </div>
      </section>
    </div>
  )
}
