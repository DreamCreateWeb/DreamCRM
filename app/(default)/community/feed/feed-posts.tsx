'use client'

import { useTransition } from 'react'
import Image from 'next/image'
import { relativeTime } from '@/lib/utils'
import { likeFeedPostAction } from '../actions'

export interface FeedPostItem {
  id: number
  body: string
  imageUrl: string | null
  likes: number
  comments: number
  createdAt: Date
  authorName: string | null
  authorImage: string | null
}

function Avatar({ name, image, size = 40 }: { name: string | null; image: string | null; size?: number }) {
  if (image) {
    return <Image className="rounded-full" src={image} width={size} height={size} alt={name ?? 'User'} unoptimized />
  }
  return (
    <div
      className="rounded-full bg-violet-200 dark:bg-violet-500/30 flex items-center justify-center text-sm font-semibold text-violet-700 dark:text-violet-200 shrink-0"
      style={{ width: size, height: size }}
    >
      {(name?.[0] ?? '?').toUpperCase()}
    </div>
  )
}

export default function FeedPosts({ posts }: { posts: FeedPostItem[] }) {
  const [pending, startTransition] = useTransition()

  function handleLike(id: number) {
    startTransition(async () => {
      await likeFeedPostAction(id)
    })
  }

  if (posts.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5 text-sm text-gray-500 dark:text-gray-400">
        Nothing in the feed yet. Be the first to post.
      </div>
    )
  }

  return (
    <>
      {posts.map((p) => (
        <article key={p.id} className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5">
          <header className="flex items-center mb-4">
            <Avatar name={p.authorName} image={p.authorImage} />
            <div className="ml-3">
              <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm">
                {p.authorName ?? 'Anonymous'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{relativeTime(p.createdAt)}</div>
            </div>
          </header>
          <div className="text-sm whitespace-pre-wrap mb-3">{p.body}</div>
          {p.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt="" className="rounded-lg mb-3 max-h-96 w-full object-cover" />
          )}
          <div className="flex items-center space-x-4 text-sm">
            <button
              onClick={() => handleLike(p.id)}
              disabled={pending}
              className="flex items-center text-gray-500 hover:text-violet-500 disabled:opacity-60"
            >
              <svg className="fill-current mr-1.5" width="16" height="16" viewBox="0 0 16 16">
                <path d="M14.682 2.318A4.485 4.485 0 0011.5 1 4.377 4.377 0 008 2.707 4.383 4.383 0 004.5 1a4.5 4.5 0 00-3.182 7.682L8 15l6.682-6.318a4.5 4.5 0 000-6.364z" />
              </svg>
              {p.likes}
            </button>
            <div className="flex items-center text-gray-500">
              <svg className="fill-current mr-1.5" width="16" height="16" viewBox="0 0 16 16">
                <path d="M8 0C3.6 0 0 3.1 0 7s3.6 7 8 7h.6l5.4 2v-4.4c1.2-1.2 2-2.8 2-4.6 0-3.9-3.6-7-8-7z" />
              </svg>
              {p.comments}
            </div>
          </div>
        </article>
      ))}
    </>
  )
}
