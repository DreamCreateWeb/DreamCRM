'use client'

import { useState } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import type { SocialPostView } from '@/lib/types/zernio'
import PostHistory from './post-history'
import CalendarView from './calendar-view'

/**
 * The right-hand panel of the Social Posts surface: a Calendar / List toggle
 * over the org's posts. Calendar shows scheduled + published posts on a month
 * grid; List is the chronological history. Both are read-only views over the
 * same `posts` (delete lives on the list cards).
 */
export default function PostsView({ posts }: { posts: SocialPostView[] }) {
  const [view, setView] = useState<'list' | 'calendar'>('list')

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Your posts {posts.length > 0 && <span className="font-mono-num text-gray-400">· {posts.length}</span>}
        </h2>
        <div className="inline-flex rounded-full bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] p-0.5" role="group" aria-label="View">
          <Toggle active={view === 'list'} onClick={() => setView('list')}>
            List
          </Toggle>
          <Toggle active={view === 'calendar'} onClick={() => setView('calendar')}>
            Calendar
          </Toggle>
        </div>
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon="✍️"
          title="Write your first post"
          body="Share a same-week opening, a new-patient offer, or an upcoming event — to Google and your social channels at once."
        />
      ) : view === 'list' ? (
        <PostHistory posts={posts} />
      ) : (
        <CalendarView posts={posts} />
      )}
    </div>
  )
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-[12px] font-medium transition ${
        active
          ? 'bg-teal-500 text-white dark:bg-teal-400 dark:text-gray-900'
          : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100'
      }`}
    >
      {children}
    </button>
  )
}
