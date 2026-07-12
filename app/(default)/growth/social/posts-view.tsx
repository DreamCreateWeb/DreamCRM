'use client'

import { useState } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import type { SocialPostView, ComposerChannel } from '@/lib/types/zernio'
import PostHistory from './post-history'
import CalendarView from './calendar-view'
import PostFeed from '@/components/social-posts/post-feed'

type View = 'showcase' | 'list' | 'calendar'

/**
 * The right-hand panel of the Social Posts surface: a Showcase / List / Calendar
 * toggle over the org's posts. Showcase drops the whole post history into a
 * tablet mock of each platform's home feed (scroll it like the real timeline);
 * List is the chronological history; Calendar places scheduled + published posts
 * on a month grid. All read-only over the same `posts` (delete lives on the
 * list cards).
 */
export default function PostsView({
  posts,
  channels,
  clinicName,
}: {
  posts: SocialPostView[]
  channels: ComposerChannel[]
  clinicName: string
}) {
  const [view, setView] = useState<View>('showcase')

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Your posts {posts.length > 0 && <span className="font-mono-num text-gray-400">· {posts.length}</span>}
        </h2>
        <div className="inline-flex rounded-full bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] p-0.5" role="group" aria-label="View">
          <Toggle active={view === 'showcase'} onClick={() => setView('showcase')}>
            Showcase
          </Toggle>
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
      ) : view === 'showcase' ? (
        <PostFeed posts={posts} channels={channels} clinicName={clinicName} />
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
