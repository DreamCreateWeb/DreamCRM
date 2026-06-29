'use client'

import { useState, useTransition } from 'react'
import { sendFeedback } from '../actions'
import { ActionButton } from '@/components/ui/action-button'
import { SettingsTabs } from '../settings-tabs'

export default function FeedbackPanel() {
  const [rating, setRating] = useState<number | null>(3)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string } | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) {
      setFeedback({ error: 'Please share a little detail before submitting.' })
      return
    }
    setFeedback(null)
    startTransition(async () => {
      try {
        await sendFeedback({ category: 'nps', rating, message })
        setMessage('')
        setRating(3)
        setFeedback({ ok: 'Thanks for the feedback!' })
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
                      <div className="space-y-6">
          <section>
            <h3 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-6">
              How likely would you recommend us to a friend or colleague?
            </h3>
            <div className="w-full max-w-xl">
              <div className="relative">
                <div className="absolute left-0 top-1/2 -mt-px w-full h-0.5 bg-gray-200 dark:bg-gray-700/60" aria-hidden="true"></div>
                <ul className="relative flex justify-between w-full">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <li key={n} className="flex">
                      <button
                        type="button"
                        onClick={() => setRating(n)}
                        aria-label={`${n} out of 5`}
                        className={`w-3 h-3 rounded-full border-2 ${
                          rating === n
                            ? 'bg-teal-500 border-teal-500'
                            : 'bg-white dark:bg-gray-800 border-gray-400 dark:border-gray-500'
                        }`}
                      />
                    </li>
                  ))}
                </ul>
              </div>
              <div className="w-full flex justify-between text-sm text-gray-500 dark:text-gray-400 italic mt-3">
                <div>Not at all</div>
                <div>Extremely likely</div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-5">Tell us in words</h3>
            <label className="sr-only" htmlFor="feedback">Leave feedback</label>
            <textarea
              id="feedback"
              className="form-textarea w-full focus:border-gray-300"
              rows={4}
              placeholder="I really enjoy…"
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
              <ActionButton variant="secondary" onClick={() => { setMessage(''); setRating(3); setFeedback(null) }}>Cancel</ActionButton>
              <ActionButton variant="primary" type="submit" disabled={pending}>
                {pending ? 'Sending…' : 'Send feedback'}
              </ActionButton>
            </div>
          </div>
        </footer>
      </form>
    </div>
  )
}
