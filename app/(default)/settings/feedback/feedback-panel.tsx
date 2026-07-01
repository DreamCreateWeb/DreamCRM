'use client'

import { useState, useTransition } from 'react'
import { sendFeedback } from '../actions'
import { ActionButton } from '@/components/ui/action-button'
import { SettingsTabs } from '../settings-tabs'
import {
  FEEDBACK_CATEGORIES,
  DEFAULT_FEEDBACK_CATEGORY,
} from './feedback-categories'

const MESSAGE_MAX = 4000

// The 1–5 NPS scale, labelled so the endpoints are unmistakable and every step
// carries a word (mirrors the "how likely to recommend" question).
const SCALE = [
  { value: 1, label: 'Not likely' },
  { value: 2, label: 'Unlikely' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Likely' },
  { value: 5, label: 'Extremely likely' },
] as const

export default function FeedbackPanel() {
  const [category, setCategory] = useState<string>(DEFAULT_FEEDBACK_CATEGORY)
  const [rating, setRating] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string } | null>(null)

  const activeCat = FEEDBACK_CATEGORIES.find((c) => c.id === category)
  const selected = SCALE.find((s) => s.value === rating)
  const remaining = MESSAGE_MAX - message.length

  function reset() {
    setCategory(DEFAULT_FEEDBACK_CATEGORY)
    setRating(null)
    setMessage('')
    setFeedback(null)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) {
      setFeedback({ error: 'Please share a little detail before submitting.' })
      return
    }
    if (message.length > MESSAGE_MAX) {
      setFeedback({ error: `Please keep it under ${MESSAGE_MAX.toLocaleString()} characters.` })
      return
    }
    setFeedback(null)
    startTransition(async () => {
      try {
        // `rating` is optional — a topic + a note is a valid submission even
        // without the NPS score. Category writes to the real feedback.category
        // column (was hardcoded 'nps' before).
        await sendFeedback({ category, rating, message: message.trim() })
        reset()
        setFeedback({ ok: 'Thanks for the feedback — we read every note.' })
      } catch (err) {
        setFeedback({ error: (err as Error).message })
      }
    })
  }

  return (
    <div className="grow">
      <form onSubmit={onSubmit}>
        <div className="p-6">
          <SettingsTabs
            tabs={[
              {
                id: 'feedback',
                label: 'Feedback',
                subtabs: [
                  {
                    id: 'send',
                    label: 'Send feedback',
                    content: (
                      <div className="space-y-8">
                        {/* Topic — writes to feedback.category so the admin inbox can filter. */}
                        <section>
                          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1.5">
                            What's this about?
                          </h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                            Pick the closest topic so we can route it to the right person.
                          </p>
                          <label className="sr-only" htmlFor="feedback-category">
                            Feedback topic
                          </label>
                          <select
                            id="feedback-category"
                            className="form-select w-full max-w-sm"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                          >
                            {FEEDBACK_CATEGORIES.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          {activeCat && (
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{activeCat.hint}</p>
                          )}
                        </section>

                        {/* NPS-style 1–5 recommend score — optional. */}
                        <section>
                          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1.5">
                            How likely are you to recommend DreamCRM to a friend or colleague?
                          </h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                            Optional — a quick read on how we're doing.
                          </p>
                          <div
                            role="radiogroup"
                            aria-label="How likely are you to recommend DreamCRM, from 1 (not likely) to 5 (extremely likely)"
                            className="flex flex-wrap gap-2"
                          >
                            {SCALE.map((s) => {
                              const on = rating === s.value
                              return (
                                <button
                                  key={s.value}
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  aria-label={`${s.value} — ${s.label}`}
                                  title={s.label}
                                  onClick={() => setRating(on ? null : s.value)}
                                  className={`flex h-11 w-11 items-center justify-center rounded-[var(--r-md)] border text-base font-semibold font-mono-num tabular-nums transition-colors ${
                                    on
                                      ? 'bg-teal-500/10 border-teal-500/50 text-teal-700 dark:text-teal-300 ring-1 ring-inset ring-[color:var(--color-hairline-strong)]'
                                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                                  }`}
                                >
                                  {s.value}
                                </button>
                              )
                            })}
                          </div>
                          <div className="mt-2 flex w-full max-w-[15.25rem] justify-between text-xs text-gray-500 dark:text-gray-400">
                            <span>Not likely</span>
                            <span>Extremely likely</span>
                          </div>
                          <p className="mt-2 text-xs text-gray-600 dark:text-gray-300" aria-live="polite">
                            {selected ? (
                              <>
                                Selected: <span className="font-medium text-gray-800 dark:text-gray-100">{selected.value} — {selected.label}</span>
                                {' · '}
                                <button
                                  type="button"
                                  onClick={() => setRating(null)}
                                  className="text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 underline"
                                >
                                  clear
                                </button>
                              </>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500">No score selected (optional)</span>
                            )}
                          </p>
                        </section>

                        {/* Free-text — required, char-counted to 4000. */}
                        <section>
                          <div className="mb-2 flex items-baseline justify-between gap-3">
                            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                              Tell us more
                            </h3>
                            <span
                              className={`text-xs font-mono-num tabular-nums ${
                                remaining < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : remaining <= 100
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-gray-400 dark:text-gray-500'
                              }`}
                              aria-live="polite"
                            >
                              {message.length.toLocaleString()} / {MESSAGE_MAX.toLocaleString()}
                            </span>
                          </div>
                          <label className="sr-only" htmlFor="feedback">
                            Leave feedback
                          </label>
                          <textarea
                            id="feedback"
                            className="form-textarea w-full focus:border-gray-300"
                            rows={5}
                            maxLength={MESSAGE_MAX}
                            placeholder="What's working well? What could we improve? Anything confusing?"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            required
                          />
                        </section>
                      </div>
                    ),
                  },
                ],
              },
            ]}
          />
        </div>

        <footer>
          <div className="flex flex-col px-6 py-5 border-t border-gray-200 dark:border-gray-700/60">
            {feedback?.error && (
              <div className="mb-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 px-3 py-2 rounded">{feedback.error}</div>
            )}
            {feedback?.ok && (
              <div className="mb-3 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-3 py-2 rounded">{feedback.ok}</div>
            )}
            <div className="flex self-end gap-3">
              <ActionButton variant="secondary" onClick={reset} disabled={pending}>
                Cancel
              </ActionButton>
              <ActionButton variant="primary" type="submit" disabled={pending || !message.trim()}>
                {pending ? 'Sending…' : 'Send feedback'}
              </ActionButton>
            </div>
          </div>
        </footer>
      </form>
    </div>
  )
}
