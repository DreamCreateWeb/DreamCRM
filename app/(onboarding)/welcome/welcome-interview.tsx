'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  INTERVIEW_QUESTIONS,
  INTERVIEW_PRECHECKED_SERVICE_SLUGS,
  type OnboardingInterviewDraft,
} from '@/lib/types/onboarding-interview'
import { runOnboardingDraft, saveInterviewDraftAction, skipInterviewAction } from './actions'
import { isDeploymentSkewError } from '@/lib/auth/submit-guard'

/** Client-safe service-library row for the checkbox step. */
export interface ServicePick {
  slug: string
  name: string
  category: 'core' | 'special'
  shortDescription: string
}

type Phase = 'asking' | 'drafting' | 'reveal' | 'error'

/**
 * Welcome Interview v2. A warm scripted chat: ~6 free-text questions + ONE
 * checkbox step (services), then ONE AI pass drafts the whole site
 * (tagline / about / stats / FAQ / home SEO + the chosen canonical services)
 * and REVEALS the finished site. Free + never counted against the allowance.
 *
 * - Progress is server-persisted (debounced save on every step advance), so a
 *   refresh resumes mid-interview.
 * - On AI failure the site already has the day-0 floor — the screen says so
 *   honestly + offers retry; never a dead end.
 * - The drafting phase shows a timed checklist (reduced-motion-safe), not a
 *   bare spinner.
 */
export default function WelcomeInterview({
  services,
  siteUrl,
  resumeDraft,
}: {
  services: ServicePick[]
  siteUrl: string
  resumeDraft: OnboardingInterviewDraft | null
}) {
  // Hydrate from a resumed draft, else start fresh with the 4 starter services
  // pre-checked (mirrors the day-0 floor the clinic already has).
  const initialSlugs = resumeDraft
    ? resumeDraft.serviceSlugs
    : [...INTERVIEW_PRECHECKED_SERVICE_SLUGS]
  const [index, setIndex] = useState(resumeDraft?.step ?? 0)
  const [answers, setAnswers] = useState<Record<string, string>>(resumeDraft?.answers ?? {})
  const [serviceSlugs, setServiceSlugs] = useState<Set<string>>(new Set(initialSlugs))
  const [value, setValue] = useState('')
  const [phase, setPhase] = useState<Phase>('asking')
  const [error, setError] = useState<string | null>(null)
  const [skipped, setSkipped] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const total = INTERVIEW_QUESTIONS.length
  const q = INTERVIEW_QUESTIONS[index]
  const isLast = index === total - 1
  const isServicesStep = q.kind === 'services'
  // The text input prefill — when resuming onto a text step that already has an
  // answer, show it so the clinic can edit rather than retype.
  useEffect(() => {
    if (q.kind === 'text') setValue(answers[q.id] ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    if (!isServicesStep) inputRef.current?.focus()
  }, [index, phase, isServicesStep])

  function goToStudio() {
    window.location.assign('/website')
  }
  function viewSite() {
    window.open(siteUrl, '_blank', 'noopener,noreferrer')
  }

  // Debounced server save on step advance. Best-effort; never blocks the UI and
  // never surfaces as an uncaught rejection (e.g. a stale-deploy action id) —
  // the final draft call is what matters; a missed background save just means
  // the resume point is a step older.
  const persist = useCallback(
    (nextAnswers: Record<string, string>, nextSlugs: Set<string>, step: number) => {
      void saveInterviewDraftAction({
        answers: nextAnswers,
        serviceSlugs: Array.from(nextSlugs),
        step,
      }).catch(() => {})
    },
    [],
  )

  async function runDraft(finalAnswers: Record<string, string>, finalSlugs: Set<string>) {
    setPhase('drafting')
    setError(null)
    try {
      const res = await runOnboardingDraft(finalAnswers, Array.from(finalSlugs))
      if (res.ok) {
        setSkipped(res.skippedFields)
        setPhase('reveal')
      } else {
        setError(res.error)
        setPhase('error')
      }
    } catch (err) {
      // Deployment skew (the client bundle is from an older/newer build than the
      // server, so the Server Action id 404s) — reload to fetch fresh action ids;
      // the interview resumes from the server-persisted draft. This was the
      // "spins on the last step forever" bug: the throw used to be unhandled, so
      // the phase stayed 'drafting' indefinitely.
      if (isDeploymentSkewError(err)) {
        window.location.reload()
        return
      }
      // Any other failure: NEVER hang on the spinner. The site already has the
      // day-0 floor, so fall through to the honest "starter copy + retry" screen.
      setError(err instanceof Error ? err.message : 'The draft didn’t come through.')
      setPhase('error')
    }
  }

  function advance(nextAnswers: Record<string, string>) {
    if (!isLast) {
      const next = index + 1
      setIndex(next)
      persist(nextAnswers, serviceSlugs, next)
      return
    }
    void runDraft(nextAnswers, serviceSlugs)
  }

  function submitTextAnswer(skip = false) {
    if (phase !== 'asking' || isServicesStep) return
    const answer = skip ? '' : value.trim()
    const nextAnswers = { ...answers, [q.id]: answer }
    setAnswers(nextAnswers)
    setValue('')
    advance(nextAnswers)
  }

  function submitServicesStep() {
    if (phase !== 'asking' || !isServicesStep) return
    if (serviceSlugs.size === 0) return // min 1 — guard (button is also disabled)
    advance(answers)
  }

  function toggleSlug(slug: string) {
    setServiceSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  async function skipEntireInterview() {
    // Mark complete so siteNeedsPersonalization flips off (the day-0 floor is a
    // finished site), then land in the Studio. Best-effort — even if the
    // mark-complete fails (e.g. deploy skew), still head to the editor rather
    // than throw an uncaught rejection.
    try {
      await skipInterviewAction()
    } catch {
      /* swallow — the floor site stands; the editor is the next stop regardless */
    }
    goToStudio()
  }

  // ── Drafting takeover (stepped checklist) ──────────────────────────────
  if (phase === 'drafting') return <DraftingChecklist />

  // ── Reveal — the finished site ─────────────────────────────────────────
  if (phase === 'reveal') {
    const usedFloor = skipped.length > 0
    return (
      <div className="flex flex-col items-center justify-center text-center py-14 px-6 pop-in">
        <div className="text-4xl mb-4" aria-hidden="true">
          ✨
        </div>
        <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-100 mb-2">
          Your website is ready
        </h2>
        <p className="text-sm text-stone-500 dark:text-stone-400 max-w-sm mb-1">
          We drafted your tagline, about, services, and FAQ from what you told us. It&apos;s live
          now — and you can edit anything in seconds.
        </p>
        {usedFloor && (
          <p className="text-[12px] text-stone-400 max-w-sm mb-1">
            We kept the parts you&apos;d already edited.
          </p>
        )}
        <a
          href={siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 mb-6 inline-block max-w-full truncate rounded-full bg-stone-100 dark:bg-stone-800 px-4 py-1.5 text-[13px] font-medium text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100"
        >
          {siteUrl.replace(/^https?:\/\//, '')}
        </a>
        <div className="flex flex-col sm:flex-row gap-2 w-full max-w-sm justify-center">
          <button
            type="button"
            onClick={viewSite}
            className="btn bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900"
          >
            View your site →
          </button>
          <button
            type="button"
            onClick={goToStudio}
            className="btn bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-300"
          >
            Open the editor
          </button>
        </div>
      </div>
    )
  }

  // ── Error — never empty, always the floor + retry ──────────────────────
  if (phase === 'error') {
    return (
      <div className="flex flex-col items-center justify-center text-center py-14 px-6">
        <h2 className="text-xl font-semibold text-stone-800 dark:text-stone-100 mb-2">
          Your site is set up with our standard copy
        </h2>
        <p className="text-sm text-stone-500 dark:text-stone-400 max-w-sm mb-6">
          The AI draft didn&apos;t come through just now, so we&apos;ve left your site with our
          ready-to-use starter copy — you can personalize it anytime. Want us to try the draft
          again?
        </p>
        <div className="flex flex-col sm:flex-row gap-2 w-full max-w-sm justify-center">
          <button
            type="button"
            onClick={() => void runDraft(answers, serviceSlugs)}
            className="btn bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900"
          >
            Try the draft again
          </button>
          <button
            type="button"
            onClick={goToStudio}
            className="btn bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-300"
          >
            Edit it myself
          </button>
        </div>
      </div>
    )
  }

  // ── Conversational asking ──────────────────────────────────────────────
  const answered = INTERVIEW_QUESTIONS.slice(0, index)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 mb-3">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-stone-400">
          Question {index + 1} of {total}
        </span>
        <button
          type="button"
          onClick={() => void skipEntireInterview()}
          className="text-[12px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
        >
          Skip — I&apos;ll write it myself
        </button>
      </div>

      <div className="h-1.5 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden mb-5">
        <div
          className="h-full bg-stone-800 dark:bg-stone-200 transition-all duration-300"
          style={{ width: `${(index / total) * 100}%` }}
        />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 min-h-[16rem]">
        {answered.map((aq) => (
          <div key={aq.id} className="space-y-2">
            <Bubble who="bot">{aq.prompt}</Bubble>
            {aq.kind === 'services' ? (
              <Bubble who="user">{serviceSummary(serviceSlugs, services)}</Bubble>
            ) : answers[aq.id]?.trim() ? (
              <Bubble who="user">{answers[aq.id]}</Bubble>
            ) : (
              <Bubble who="user" muted>
                (skipped)
              </Bubble>
            )}
          </div>
        ))}
        <Bubble who="bot">{q.prompt}</Bubble>
        {q.hint && <p className="text-[12px] text-stone-400 pl-1">{q.hint}</p>}

        {isServicesStep && (
          <ServiceChecklist
            services={services}
            selected={serviceSlugs}
            onToggle={toggleSlug}
          />
        )}
      </div>

      <div className="border-t border-stone-200 dark:border-stone-700/60 pt-4">
        {isServicesStep ? (
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-stone-400">
              {serviceSlugs.size} selected
              {serviceSlugs.size === 0 && ' · pick at least one'}
            </span>
            <button
              type="button"
              onClick={submitServicesStep}
              disabled={serviceSlugs.size === 0}
              className="btn-sm bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 disabled:opacity-40"
            >
              {isLast ? 'Draft my website →' : 'Next'}
            </button>
          </div>
        ) : (
          <>
            <textarea
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submitTextAnswer(false)
                }
              }}
              rows={3}
              placeholder={q.placeholder ?? 'Type your answer…'}
              className="form-textarea w-full text-sm resize-none"
            />
            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                onClick={() => submitTextAnswer(true)}
                className="text-[13px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              >
                Skip this question
              </button>
              <button
                type="button"
                onClick={() => submitTextAnswer(false)}
                disabled={!value.trim()}
                className="btn-sm bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 disabled:opacity-40"
              >
                {isLast ? 'Draft my website →' : 'Next'}
              </button>
            </div>
            <p className="text-[11px] text-stone-400 mt-2 text-center">
              Press Enter to continue · Shift+Enter for a new line
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/** Short summary of the chosen services for the answered-bubble recap. */
function serviceSummary(selected: Set<string>, services: ServicePick[]): string {
  const names = services.filter((s) => selected.has(s.slug)).map((s) => s.name)
  if (names.length === 0) return '(none selected)'
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`
}

function ServiceChecklist({
  services,
  selected,
  onToggle,
}: {
  services: ServicePick[]
  selected: Set<string>
  onToggle: (slug: string) => void
}) {
  const core = services.filter((s) => s.category === 'core')
  const special = services.filter((s) => s.category === 'special')
  return (
    <div className="space-y-4 pt-1">
      {core.length > 0 && (
        <ServiceGroup label="Core services" items={core} selected={selected} onToggle={onToggle} />
      )}
      {special.length > 0 && (
        <ServiceGroup
          label="Special services"
          items={special}
          selected={selected}
          onToggle={onToggle}
        />
      )}
    </div>
  )
}

function ServiceGroup({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string
  items: ServicePick[]
  selected: Set<string>
  onToggle: (slug: string) => void
}) {
  return (
    <fieldset>
      <legend className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-2">
        {label}
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {items.map((s) => {
          const checked = selected.has(s.slug)
          return (
            <label
              key={s.slug}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                checked
                  ? 'border-stone-800 bg-stone-50 dark:border-stone-200 dark:bg-stone-800/60'
                  : 'border-stone-200 hover:border-stone-300 dark:border-stone-700/60'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(s.slug)}
                className="form-checkbox rounded text-stone-800 dark:text-stone-200"
              />
              <span className="min-w-0 truncate text-stone-700 dark:text-stone-200">{s.name}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** The drafting steps — a timed checklist that ticks each line as the seconds
 *  pass (~8–12s total). Pure client animation; reduced-motion-safe (the lines
 *  still appear, just without the staged reveal feel). */
const DRAFT_STEPS = [
  'Reading your answers',
  'Writing your tagline',
  'Choosing your services',
  'Drafting your FAQ',
  'Polishing the details',
] as const

function DraftingChecklist() {
  const [done, setDone] = useState(0)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced) {
      // Reduced motion: reveal all but the last as done immediately, leave the
      // final one as the active "in progress" line.
      setDone(DRAFT_STEPS.length - 1)
      return
    }
    // Tick steps every ~1.9s; stop one short so the last line reads as active
    // until the draft actually returns and the phase switches to reveal.
    let i = 0
    const id = setInterval(() => {
      i += 1
      if (i >= DRAFT_STEPS.length - 1) {
        setDone(DRAFT_STEPS.length - 1)
        clearInterval(id)
      } else {
        setDone(i)
      }
    }, 1900)
    return () => clearInterval(id)
  }, [reduced])

  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <h2 className="text-xl font-semibold text-stone-800 dark:text-stone-100 mb-1">
        Building your website…
      </h2>
      <p className="text-sm text-stone-500 dark:text-stone-400 max-w-sm mb-6">
        This takes a few seconds — hang tight.
      </p>
      <ul className="space-y-2.5 text-left">
        {DRAFT_STEPS.map((label, i) => {
          const isDone = i < done
          const isActive = i === done
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  isDone
                    ? 'bg-emerald-500 text-white'
                    : isActive
                      ? 'border-2 border-stone-300 border-t-stone-800 dark:border-stone-600 dark:border-t-stone-200 motion-safe:animate-spin'
                      : 'border-2 border-stone-200 dark:border-stone-700'
                }`}
                aria-hidden="true"
              >
                {isDone && (
                  <svg
                    viewBox="0 0 12 12"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 6.5 4.5 9 10 3" />
                  </svg>
                )}
              </span>
              <span
                className={`text-sm ${
                  isDone || isActive
                    ? 'text-stone-700 dark:text-stone-200'
                    : 'text-stone-400 dark:text-stone-500'
                }`}
              >
                {label}
                {isDone ? ' ✓' : isActive ? '…' : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener?.('change', handler)
    return () => mq.removeEventListener?.('change', handler)
  }, [])
  return reduced
}

function Bubble({
  who,
  children,
  muted,
}: {
  who: 'bot' | 'user'
  children: React.ReactNode
  muted?: boolean
}) {
  if (who === 'bot') {
    return (
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-stone-100 dark:bg-stone-800 px-4 py-2.5 text-sm text-stone-800 dark:text-stone-100">
        {children}
      </div>
    )
  }
  return (
    <div className="flex justify-end">
      <div
        className={`max-w-[85%] rounded-2xl rounded-tr-sm bg-stone-800 dark:bg-stone-200 px-4 py-2.5 text-sm text-white dark:text-stone-900 ${
          muted ? 'italic opacity-60' : ''
        }`}
      >
        {children}
      </div>
    </div>
  )
}
