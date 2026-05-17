'use client'

import { useState, useTransition } from 'react'
import { sendFeedback } from '../actions'

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
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-4">Give Feedback</h2>
            <div className="text-sm">Our product depends on customer feedback to improve.</div>
          </div>

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
                            ? 'bg-violet-500 border-violet-500'
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

        <footer>
          <div className="flex flex-col px-6 py-5 border-t border-gray-200 dark:border-gray-700/60">
            {feedback?.error && (
              <div className="mb-3 text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">{feedback.error}</div>
            )}
            {feedback?.ok && (
              <div className="mb-3 text-sm text-green-700 bg-green-50 dark:bg-green-500/10 px-3 py-2 rounded">{feedback.ok}</div>
            )}
            <div className="flex self-end">
              <button type="button" onClick={() => { setMessage(''); setRating(3); setFeedback(null) }} className="btn dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300">Cancel</button>
              <button type="submit" disabled={pending} className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white ml-3 disabled:opacity-60">
                {pending ? 'Sending…' : 'Send Feedback'}
              </button>
            </div>
          </div>
        </footer>
      </form>
    </div>
  )
}
