'use client'

import { useState, useTransition } from 'react'
import { rsvpToMeetup } from '../../actions'

const STATUSES = [
  { key: 'going' as const, label: "I'm going" },
  { key: 'maybe' as const, label: 'Maybe' },
  { key: 'not_going' as const, label: 'Not going' },
]

export default function RsvpButtons({ meetupId }: { meetupId: number }) {
  const [selected, setSelected] = useState<'going' | 'maybe' | 'not_going' | null>(null)
  const [pending, startTransition] = useTransition()

  function handleClick(status: 'going' | 'maybe' | 'not_going') {
    startTransition(async () => {
      await rsvpToMeetup(meetupId, status)
      setSelected(status)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {STATUSES.map((s) => (
        <button
          key={s.key}
          type="button"
          disabled={pending}
          onClick={() => handleClick(s.key)}
          className={`btn-sm ${
            selected === s.key
              ? 'bg-gray-900 text-gray-100 dark:bg-gray-100 dark:text-gray-800'
              : 'border-gray-200 dark:border-gray-700/60 text-gray-800 dark:text-gray-300'
          } disabled:opacity-60`}
        >
          {s.label}
        </button>
      ))}
      {selected && <span className="text-sm text-gray-500 dark:text-gray-400">RSVP saved.</span>}
    </div>
  )
}
