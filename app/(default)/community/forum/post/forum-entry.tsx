'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { relativeTime } from '@/lib/utils'
import { postReply } from '../../actions'

interface Reply {
  id: number
  body: string
  createdAt: Date
  authorName: string | null
  authorImage: string | null
}

interface ForumEntryProps {
  thread: {
    id: number
    title: string
    body: string
    category: string
    views: number
    createdAt: Date
    authorName: string | null
    authorImage: string | null
  }
  replies: Reply[]
}

function Avatar({ name, image, size = 36 }: { name: string | null; image: string | null; size?: number }) {
  if (image) {
    return <Image className="rounded-full" src={image} width={size} height={size} alt={name ?? 'User'} unoptimized />
  }
  return (
    <div
      className="rounded-full bg-violet-200 dark:bg-violet-500/30 flex items-center justify-center text-xs font-semibold text-violet-700 dark:text-violet-200"
      style={{ width: size, height: size }}
    >
      {(name?.[0] ?? '?').toUpperCase()}
    </div>
  )
}

export default function ForumEntry({ thread, replies }: ForumEntryProps) {
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setError(null)
    startTransition(async () => {
      try {
        await postReply({ threadId: thread.id, body })
        setBody('')
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <article className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{thread.title}</h1>
        <div className="flex items-center mt-2 text-sm text-gray-500 dark:text-gray-400">
          <Avatar name={thread.authorName} image={thread.authorImage} size={28} />
          <span className="ml-2 font-medium text-violet-500">{thread.authorName ?? 'Anonymous'}</span>
          <span className="mx-2">·</span>
          <span>{relativeTime(thread.createdAt)}</span>
          <span className="mx-2">·</span>
          <span>{thread.views} views</span>
        </div>
      </header>
      <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap mb-6">{thread.body}</div>

      <hr className="my-6 border-t border-gray-100 dark:border-gray-700/60" />

      <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">
        Replies <span className="text-gray-400 dark:text-gray-500 font-medium">{replies.length}</span>
      </h2>

      <div className="space-y-4 mb-6">
        {replies.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 italic">No replies yet — be the first.</div>
        ) : (
          replies.map((r) => (
            <div key={r.id} className="flex space-x-3">
              <Avatar name={r.authorName} image={r.authorImage} size={32} />
              <div className="grow">
                <div className="text-sm">
                  <span className="font-medium text-gray-800 dark:text-gray-100">{r.authorName ?? 'Anonymous'}</span>
                  <span className="ml-2 text-gray-500 dark:text-gray-400">{relativeTime(r.createdAt)}</span>
                </div>
                <div className="mt-1 text-sm whitespace-pre-wrap">{r.body}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="sr-only" htmlFor="reply">Reply</label>
        <textarea
          id="reply"
          className="form-textarea w-full"
          rows={3}
          placeholder="Write a reply…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">{error}</div>}
        <div className="flex items-center justify-between">
          <Link href="/community/forum" className="text-sm text-violet-500 hover:text-violet-600">
            ← Back to threads
          </Link>
          <button
            type="submit"
            disabled={pending || !body.trim()}
            className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 disabled:opacity-60"
          >
            {pending ? 'Posting…' : 'Reply'}
          </button>
        </div>
      </form>
    </article>
  )
}
