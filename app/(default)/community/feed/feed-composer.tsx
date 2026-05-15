'use client'

import { useState, useTransition } from 'react'
import { postFeedPost } from '../actions'

export default function FeedComposer({ userName }: { userName: string }) {
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setError(null)
    startTransition(async () => {
      try {
        await postFeedPost({ body })
        setBody('')
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5"
    >
      <div className="flex items-center space-x-3 mb-5">
        <div className="rounded-full shrink-0 w-10 h-10 bg-violet-200 dark:bg-violet-500/30 flex items-center justify-center font-semibold text-violet-700 dark:text-violet-200">
          {(userName?.[0] ?? 'U').toUpperCase()}
        </div>
        <div className="grow">
          <label htmlFor="status-input" className="sr-only">
            What&apos;s happening, {userName}?
          </label>
          <input
            id="status-input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="form-input w-full bg-gray-100 dark:bg-gray-700 border-transparent focus:bg-white dark:focus:bg-gray-800 placeholder-gray-500"
            type="text"
            placeholder={`What's happening, ${userName}?`}
          />
        </div>
      </div>
      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">{error}</div>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white whitespace-nowrap disabled:opacity-60"
        >
          {pending ? 'Sending…' : 'Send →'}
        </button>
      </div>
    </form>
  )
}
