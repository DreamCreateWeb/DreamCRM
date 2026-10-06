'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { TONE_TEXT } from '@/lib/ui/encodings'
import { FEATURE_BY_KEY, FEATURE_INTRO, type FeatureKey } from '@/lib/feature-switches'
import { enableFeatureAction } from '@/app/(default)/feature-switch-actions'

/**
 * THE INTRO SHELL — the insurance intro's shape (what it does, what to
 * know, ONE button), as a presentational frame every door shares. The
 * generic `FeatureIntro` fills it from the registry; a door with real
 * setup (S5: Intake Forms, Growth, Payments) fills it with its own facts
 * and setup between the "what to know" list and the button.
 */
export function IntroShell({
  eyebrow,
  title,
  lede,
  does,
  know,
  pill = FEATURE_INTRO.notOn,
  testId = 'feature-intro',
  feature,
  children,
}: {
  eyebrow: string
  title: string
  lede: string
  does: readonly string[]
  know: readonly string[]
  pill?: string
  testId?: string
  feature?: FeatureKey
  /** The door's own facts, setup and button. */
  children?: ReactNode
}) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
      <PageHeader eyebrow={eyebrow} title={title} subtitle={lede} actions={<StatusPill tone="neutral" label={pill} />} />

      <section className="v2-card px-5 py-5 sm:px-6 sm:py-6" data-testid={testId} data-feature={feature}>
        <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">What it does</p>
        <ul className="mt-2 space-y-2">
          {does.map((line) => (
            <li key={line} className="flex gap-2 text-sm text-gray-800 dark:text-gray-100">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">What to know</p>
        <ul className="mt-2 space-y-1.5">
          {know.map((line) => (
            <li key={line} className="text-sm text-gray-600 dark:text-gray-300">
              {line}
            </li>
          ))}
        </ul>

        {children}
      </section>
    </div>
  )
}

/**
 * The one button. Calls the generic enable action (or a door's own
 * `onTurnOn`, which must return the same shape) and refreshes so the
 * layout's gate re-renders with the page behind it. A refusal renders
 * inline. The confirm-free path: turning a feature ON needs no dialog.
 */
export function TurnOnButton({
  feature,
  label,
  onTurnOn,
}: {
  feature: FeatureKey
  label: string
  /** A door's own action (setup + switch). Defaults to the generic switch. */
  onTurnOn?: () => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function turnOn() {
    setError(null)
    startTransition(async () => {
      const r = await (onTurnOn ? onTurnOn() : enableFeatureAction(feature))
      if (!r.ok) {
        setError(r.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="mt-6">
      {error && (
        <p className={`mb-3 text-xs ${TONE_TEXT.warn}`} role="alert">
          {error}
        </p>
      )}
      <ActionButton variant="primary" breath pending={pending} onClick={turnOn}>
        {FEATURE_INTRO.turnOn(label)}
      </ActionButton>
    </div>
  )
}

/** The sentence a member reads instead of the button. */
export function AskManager() {
  return <p className="mt-6 text-sm text-gray-600 dark:text-gray-300">{FEATURE_INTRO.askManager}</p>
}

/**
 * THE GENERIC INTRO CARD — the registry's copy in the shell, with the one
 * button. Doors with real setup (S5) compose `IntroShell` + `TurnOnButton`
 * themselves and are handed to `FeatureGate` through its `intro` slot.
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
  const def = FEATURE_BY_KEY[feature]
  return (
    <IntroShell eyebrow={eyebrow} title={label} lede={def.lede} does={def.does} know={def.know} feature={feature}>
      {canManage ? <TurnOnButton feature={feature} label={label} /> : <AskManager />}
    </IntroShell>
  )
}
