'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import OnboardingHeader from '../onboarding-header'
import OnboardingImage from '../onboarding-image'
import OnboardingProgress from '../onboarding-progress'
import { checkClinicSlug, saveOnboardingStep3, type SlugCheckResult } from '../actions'
import { isDeploymentSkewError } from '@/lib/auth/submit-guard'
import { loadOnboardingState, saveOnboardingState } from '@/lib/onboarding/storage'
import { isValidClinicSlug } from '@/lib/onboarding/slug'
import { slugify } from '@/lib/utils'
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

export default function Onboarding03() {
  const [slug, setSlug] = useState('')
  const [touched, setTouched] = useState(false)
  const [status, setStatus] = useState<SlugStatus>({ kind: 'idle' })
  const [brandColor, setBrandColor] = useState<string>(BRAND_PRESETS[0].value)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Suggest from the practice name; restore a prior pick on back-nav.
  useEffect(() => {
    const draft = loadOnboardingState()
    if (draft.brandColor) setBrandColor(draft.brandColor)
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

  const available =
    status.kind === 'result' && status.slug === slug && status.result.available
  const blocked =
    status.kind === 'checking' ||
    (status.kind === 'result' && status.slug === slug && !status.result.available)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        saveOnboardingState({ slug, brandColor })
        await saveOnboardingStep3({ slug, brandColor })
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
    <main className="bg-white dark:bg-gray-900">
      <div className="relative flex">
        <div className="w-full md:w-1/2">
          <div className="min-h-[100dvh] h-full flex flex-col after:flex-1">
            <div className="flex-1">
              <OnboardingHeader />
              <OnboardingProgress step={3} />
            </div>
            <div className="px-4 py-8">
              <div className="max-w-md mx-auto">
                <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">
                  Pick your web address
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Your practice website goes live here the moment you finish — you can connect your
                  own domain later.
                </p>
                <form onSubmit={onSubmit}>
                  <div className="space-y-5 mb-8">
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="slug">
                        Web address <span className="text-rose-500">*</span>
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
                        {status.kind === 'checking' && <span className="text-gray-500 dark:text-gray-400">Checking availability…</span>}
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
                        {!touched && status.kind === 'idle' && (
                          <span className="text-gray-500 dark:text-gray-400">This is where patients will book.</span>
                        )}
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
                              className={`h-9 w-9 rounded-full border-2 transition ${
                                selected
                                  ? 'border-gray-900 dark:border-gray-100 scale-110'
                                  : 'border-transparent hover:scale-105'
                              }`}
                              style={{ backgroundColor: preset.value }}
                            />
                          )
                        })}
                        <label className="ml-1 inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <input
                            type="color"
                            aria-label="Custom brand color"
                            className="h-9 w-9 cursor-pointer rounded-full border border-gray-200 dark:border-gray-700/60 bg-transparent p-1"
                            value={brandColor}
                            onChange={(e) => setBrandColor(e.target.value)}
                          />
                          Custom
                        </label>
                      </div>
                      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                        Buttons and accents on your site use this. Change it anytime.
                      </p>
                    </div>
                  </div>
                  {error && (
                    <div className="mb-4 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded">{error}</div>
                  )}
                  <div className="flex items-center justify-between">
                    <Link className="text-sm underline hover:no-underline text-gray-600 dark:text-gray-400" href="/onboarding-02">
                      ← Back
                    </Link>
                    <ActionButton type="submit" variant="primary" disabled={pending || blocked || !slug}>
                      {pending ? 'Saving…' : 'Next step →'}
                    </ActionButton>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
        <OnboardingImage />
      </div>
    </main>
  )
}
