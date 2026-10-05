'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { TONE_TEXT } from '@/lib/ui/encodings'
import { INSURANCE_DRIVER_LABEL, INSURANCE_INTRO, isPracticeDriver, type InsuranceDriverId } from '@/lib/insurance-eligibility'
import { enableInsuranceAction } from './actions'

/**
 * THE INTRO CARD (2026-10-05). What the clinic meets before the tool is on:
 * what it does, what to know, and ONE button. "Enable and set up" opens the
 * setup beneath it (the practice NPI — the only thing a payer needs from
 * the practice), and "Turn on insurance checks" flips the switch. Members
 * see the card without the button; an owner or admin turns it on. The tool
 * itself renders the moment the page refreshes.
 */
export default function InsuranceIntro({
  orgName,
  canManage,
  driver,
  npi,
}: {
  orgName: string
  canManage: boolean
  driver: InsuranceDriverId
  /** The practice NPI already on the Business profile, if any. */
  npi: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [npiValue, setNpiValue] = useState(npi ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const label = INSURANCE_DRIVER_LABEL[driver]
  const live = driver === 'stedi'

  function turnOn() {
    setError(null)
    startTransition(async () => {
      const r = await enableInsuranceAction({ npi: npiValue })
      if (!r.ok) {
        setError(r.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
      <PageHeader
        eyebrow={`Daily · ${orgName}`}
        title="Insurance"
        subtitle={INSURANCE_INTRO.lede}
        actions={<StatusPill tone="neutral" label="Not turned on" />}
      />

      <section className="v2-card px-5 py-5 sm:px-6 sm:py-6" data-testid="insurance-intro">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{INSURANCE_INTRO.title}</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">What it does</p>
        <ul className="mt-2 space-y-2">
          {INSURANCE_INTRO.does.map((line) => (
            <li key={line} className="flex gap-2 text-sm text-gray-800 dark:text-gray-100">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">What to know</p>
        <ul className="mt-2 space-y-1.5">
          {INSURANCE_INTRO.know.map((line) => (
            <li key={line} className="text-sm text-gray-600 dark:text-gray-300">
              {line}
            </li>
          ))}
        </ul>
        {isPracticeDriver(driver) && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Right now every answer is a <span className="font-medium">{label.pill.toLowerCase()}</span> — {label.title}
          </p>
        )}

        {!open && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {canManage ? (
              <ActionButton variant="primary" breath onClick={() => setOpen(true)}>
                {INSURANCE_INTRO.enable}
              </ActionButton>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-300">{INSURANCE_INTRO.askManager}</p>
            )}
          </div>
        )}

        {open && canManage && (
          <form
            className="mt-6 v2-well px-4 py-4 space-y-3"
            data-testid="insurance-setup"
            onSubmit={(e) => {
              e.preventDefault()
              turnOn()
            }}
            noValidate
          >
            <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Set up</p>
            <div>
              <label htmlFor="ins-setup-npi" className="block text-sm font-medium text-gray-800 dark:text-gray-100">
                {INSURANCE_INTRO.npiLabel}
                {!live && <span className="font-normal text-gray-500 dark:text-gray-400"> (optional for now)</span>}
              </label>
              <input
                id="ins-setup-npi"
                className="form-input w-full sm:max-w-xs mt-1 text-sm font-mono-num"
                inputMode="numeric"
                autoComplete="off"
                placeholder="10 digits"
                value={npiValue}
                onChange={(e) => setNpiValue(e.target.value)}
                aria-describedby="ins-setup-npi-help"
              />
              <p id="ins-setup-npi-help" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {INSURANCE_INTRO.npiHelp}
              </p>
            </div>
            {error && (
              <p className={`text-xs ${TONE_TEXT.warn}`} role="alert">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <ActionButton type="submit" variant="primary" pending={pending}>
                {INSURANCE_INTRO.turnOn}
              </ActionButton>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
                Not now
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
