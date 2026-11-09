'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import OnboardingFrame from '../onboarding-frame'
import { checkClinicSlug, submitOnboarding, type SlugCheckResult } from '../actions'
import { isDeploymentSkewError } from '@/lib/auth/submit-guard'
import { TONE_PILL } from '@/lib/ui/encodings'
import { clearOnboardingState, loadOnboardingState, saveOnboardingState } from '@/lib/onboarding/storage'
import { isValidClinicSlug } from '@/lib/onboarding/slug'
import { PMS_ANSWER_CHOICES } from '@/lib/onboarding/pms-answer'
import { slugify } from '@/lib/utils'
import { TRIAL_DAYS } from '@/lib/trial'
import { ActionButton } from '@/components/ui/action-button'

/** Premium-warm presets from the design charter (DESIGN.md). */
const BRAND_PRESETS: Array<{ value: string; label: string }> = [
  { value: '#9CAF9F', label: 'Sage' },
  { value: '#7C9CB8', label: 'Dusty blue' },
  { value: '#D4A284', label: 'Terracotta' },
  { value: '#E87B5E', label: 'Coral' },
  { value: '#F0A658', label: 'Warm amber' },
  { value: '#7C3AED', label: 'Violet' },
]

type SlugStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'result'; slug: string; result: SlugCheckResult }

/**
 * Screen 3 of 3 — the software the practice runs, the web address + brand
 * color, and the no-card trial start. This is where the real writes happen
 * (submitOnboarding); no Stripe call, no card. The software question can be
 * skipped — the first-week cockpit asks again.
 */
export default function Onboarding02() {
  const [slug, setSlug] = useState('')
  const [touched, setTouched] = useState(false)
  const [status, setStatus] = useState<SlugStatus>({ kind: 'idle' })
  const [brandColor, setBrandColor] = useState<string>(BRAND_PRESETS[0].value)
  const [pmsAnswer, setPmsAnswer] = useState<string>('')
  const [pmsVendorName, setPmsVendorName] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Suggest from the practice name; restore a prior pick on back-nav.
  useEffect(() => {
    const draft = loadOnboardingState()
    if (draft.brandColor) setBrandColor(draft.brandColor)
    if (draft.pmsAnswer) setPmsAnswer(draft.pmsAnswer)
    if (draft.pmsVendorName) setPmsVendorName(draft.pmsVendorName)
    const initial = draft.slug || slugify(draft.practiceName ?? '') || ''
    if (initial) {
      setSlug(initial)
      runCheck(initial)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function runCheck(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value || value.length < 3 || !isValidClinicSlug(value)) {
      setStatus(value ? { kind: 'result', slug: value, result: { available: false, reason: 'invalid' } } : { kind: 'idle' })
      return
    }
    setStatus({ kind: 'checking' })
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await checkClinicSlug(value)
        setStatus({ kind: 'result', slug: value, result })
      } catch {
        // Network blip — let them proceed; submitOnboarding re-validates.
        setStatus({ kind: 'idle' })
      }
    }, 400)
  }

  function onSlugChange(raw: string) {
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setTouched(true)
    setSlug(cleaned)
    runCheck(cleaned)
  }

  const available = status.kind === 'result' && status.slug === slug && status.result.available
  const blocked =
    status.kind === 'checking' || (status.kind === 'result' && status.slug === slug && !status.result.available)

  /** `skipSoftware` sends no answer at all — null is "not asked", never a guess. */
  function submit(skipSoftware: boolean) {
    setError(null)
    const answer = skipSoftware ? '' : pmsAnswer
    const vendorName = answer === 'other' ? pmsVendorName.trim() : ''
    if (answer === 'other' && !vendorName) {
      setError('Tell us what your software is called — or pick Not sure.')
      return
    }
    startTransition(async () => {
      try {
        saveOnboardingState({ slug, brandColor, pmsAnswer: answer || undefined, pmsVendorName: vendorName || undefined })
        const draft = loadOnboardingState()
        await submitOnboarding({
          practiceName: draft.practiceName,
          phone: draft.phone,
          street: draft.street,
          city: draft.city,
          state: draft.state,
          postalCode: draft.postalCode,
          country: draft.country,
          slug,
          brandColor,
          pmsAnswer: answer || undefined,
          pmsVendorName: vendorName || undefined,
          // The signer-upper is almost always AT the clinic — their browser
          // timezone is the best default for clinic_profile.timezone (the
          // whole app's wall-clock; otherwise everyone silently defaults to
          // Eastern). Adjustable later in Settings → Clinic.
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        clearOnboardingState()
        // Full reload so the freshly-set session.activeOrganizationId is visible
        // on the next request (tenant context resolution runs in the layout and
        // won't pick up a server-action-mutated session through router.push).
        window.location.assign('/onboarding-complete')
      } catch (err) {
        if (isDeploymentSkewError(err)) {
          setError('We just shipped an update — refreshing…')
          window.location.reload()
          return
        }
        setError((err as Error).message)
      }
    })
  }

  return (
    <OnboardingFrame step={3}>
      <h1 className="text-3xl text-ink-900 font-bold mb-2">Your software and your web address</h1>
      <p className="text-sm text-ink-600 mb-6">
        Last step. Your {TRIAL_DAYS}-day free trial starts when you finish — no card needed.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(false)
        }}
      >
        <div className="space-y-7 mb-8">
          <fieldset>
            <legend className="block text-sm font-medium mb-1">Which practice software do you use?</legend>
            <p className="mb-3 text-xs text-ink-500">
              So we can connect your patients and appointments. Skip it if you&apos;re not sure — we&apos;ll ask again.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PMS_ANSWER_CHOICES.map((c) => {
                const selected = pmsAnswer === c.id
                return (
                  <label
                    key={c.id}
                    className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm text-ink-800 focus-within:ring-2 focus-within:ring-teal-600 ${
                      selected
                        ? 'border-teal-600 bg-teal-50 dark:bg-teal-500/10'
                        : 'border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pms-answer"
                      value={c.id}
                      checked={selected}
                      onChange={() => setPmsAnswer(c.id)}
                      className="h-4 w-4 accent-teal-600"
                    />
                    {c.label}
                  </label>
                )
              })}
            </div>
            {pmsAnswer === 'other' && (
              <div className="mt-3">
                <label className="block text-sm font-medium mb-1" htmlFor="pms-vendor-name">
                  What is it called?
                </label>
                <input
                  id="pms-vendor-name"
                  className="form-input w-full"
                  type="text"
                  maxLength={80}
                  value={pmsVendorName}
                  onChange={(e) => setPmsVendorName(e.target.value)}
                />
              </div>
            )}
          </fieldset>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="slug">
              Web address <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <div className="flex items-center">
              <input
                id="slug"
                className="form-input w-full rounded-r-none"
                type="text"
                required
                minLength={3}
                autoComplete="off"
                spellCheck={false}
                placeholder="bright-smile"
                value={slug}
                onChange={(e) => onSlugChange(e.target.value)}
              />
              <span className="shrink-0 rounded-r-lg border border-l-0 border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                .dreamcreatestudio.com
              </span>
            </div>
            <div className="mt-1.5 min-h-[1.25rem] text-xs" aria-live="polite">
              {status.kind === 'checking' && <span className="text-ink-500">Checking availability…</span>}
              {available && (
                <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                  ✓ {slug}.dreamcreatestudio.com is yours
                </span>
              )}
              {status.kind === 'result' && status.slug === slug && !status.result.available && (
                <span className="text-rose-600 dark:text-rose-300">
                  {status.result.reason === 'invalid'
                    ? 'Use at least 3 characters — lowercase letters, numbers, and hyphens.'
                    : status.result.reason === 'reserved'
                      ? 'That one is reserved.'
                      : 'That address is taken.'}
                  {status.result.suggestion && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="font-medium underline hover:no-underline"
                        onClick={() => onSlugChange(status.result.suggestion!)}
                      >
                        Try {status.result.suggestion}
                      </button>
                    </>
                  )}
                </span>
              )}
              {!touched && status.kind === 'idle' && <span className="text-ink-500">This is where patients will book.</span>}
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium mb-2">Brand color</span>
            <div className="flex flex-wrap items-center gap-2">
              {BRAND_PRESETS.map((preset) => {
                const selected = brandColor.toLowerCase() === preset.value.toLowerCase()
                return (
                  <button
                    key={preset.value}
                    type="button"
                    title={preset.label}
                    aria-label={`${preset.label} (${preset.value})`}
                    aria-pressed={selected}
                    onClick={() => setBrandColor(preset.value)}
                    className={`h-10 w-10 rounded-full border-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${
                      selected ? 'border-ink-900 scale-110' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: preset.value }}
                  />
                )
              })}
              <label className="ml-1 inline-flex items-center gap-2 text-xs text-ink-500">
                <input
                  type="color"
                  aria-label="Custom brand color"
                  className="h-10 w-10 cursor-pointer rounded-full border border-gray-200 dark:border-gray-700/60 bg-transparent p-1"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                />
                Custom
              </label>
            </div>
            <p className="mt-1.5 text-xs text-ink-500">Buttons and accents on your site use this. Change it anytime.</p>
          </div>
        </div>

        {error && (
          <div role="alert" className={`mb-4 text-sm ${TONE_PILL.urgent} px-3 py-2 rounded`}>
            {error}
          </div>
        )}
        <div className="space-y-3">
          <ActionButton type="submit" variant="primary" pending={pending} disabled={blocked || !slug} className="w-full">
            Start my {TRIAL_DAYS}-day free trial →
          </ActionButton>
          <p className="text-xs text-ink-500 text-center">
            No card required. Set up billing whenever you&apos;re ready within the {TRIAL_DAYS} days.
          </p>
          <div className="flex items-center justify-between">
            <Link className="text-sm underline hover:no-underline text-ink-600" href="/onboarding-01">
              ← Back
            </Link>
            <button
              type="button"
              className="min-h-10 px-2 text-sm underline hover:no-underline text-ink-600 disabled:opacity-50"
              disabled={pending || blocked || !slug}
              onClick={() => submit(true)}
            >
              Skip the software question
            </button>
          </div>
        </div>
      </form>
    </OnboardingFrame>
  )
}
