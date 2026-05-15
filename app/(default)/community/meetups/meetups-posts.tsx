'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { formatShortDate } from '@/lib/utils'
import { rsvpToMeetup } from '../actions'

export interface MeetupItem {
  id: number
  title: string
  description: string | null
  location: string | null
  startsAt: Date
  endsAt: Date
  imageUrl: string | null
  capacity: number | null
  hostName: string | null
  rsvpCount: number
}

export default function MeetupsPosts({ meetups }: { meetups: MeetupItem[] }) {
  const [pending, startTransition] = useTransition()

  function handleRsvp(id: number) {
    startTransition(async () => {
      await rsvpToMeetup(id, 'going')
    })
  }

  if (meetups.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-8 text-center text-sm text-gray-500 dark:text-gray-400">
        No meetups yet. Click <strong>Add Meetup</strong> to create one.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      {meetups.map((m) => (
        <article key={m.id} className="col-span-full sm:col-span-6 xl:col-span-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl overflow-hidden flex flex-col">
          <div className="aspect-video bg-gradient-to-br from-violet-400 via-sky-400 to-emerald-400 dark:from-violet-700 dark:via-sky-700 dark:to-emerald-700 flex items-center justify-center">
            {m.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.imageUrl} alt={m.title} className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl">📅</span>
            )}
          </div>
          <div className="p-5 flex flex-col grow">
            <header className="grow">
              <Link href={`/community/meetups/post?id=${m.id}`} className="inline-flex font-semibold text-gray-800 dark:text-gray-100 mb-1 hover:text-violet-500">
                <h2 className="text-lg leading-snug">{m.title}</h2>
              </Link>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                {formatShortDate(m.startsAt)} · {m.location ?? 'Online'}
              </div>
              {m.description && <p className="text-sm line-clamp-2">{m.description}</p>}
            </header>
            <footer className="flex items-center justify-between mt-4">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {m.rsvpCount}/{m.capacity ?? '∞'} attending
              </div>
              <button
                type="button"
                onClick={() => handleRsvp(m.id)}
                disabled={pending}
                className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 disabled:opacity-60"
              >
                {pending ? 'Saving…' : 'RSVP'}
              </button>
            </footer>
          </div>
        </article>
      ))}
    </div>
  )
}
