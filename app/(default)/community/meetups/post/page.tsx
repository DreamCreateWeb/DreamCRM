import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/session'
import { getMeetup, listMeetups } from '@/lib/services/community'
import { formatShortDate, formatTime } from '@/lib/utils'
import RsvpButtons from './rsvp-buttons'

export const metadata = {
  title: 'Meetup - DreamCRM',
  description: 'Meetup detail',
}

export const dynamic = 'force-dynamic'

export default async function MeetupPost({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requireUser()
  const params = await searchParams
  let id = params.id ? Number(params.id) : NaN
  if (Number.isNaN(id)) {
    const ms = await listMeetups()
    if (ms.length === 0) notFound()
    id = ms[0].id
  }
  const m = await getMeetup(id)
  if (!m) notFound()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
      <Link href="/community/meetups" className="text-sm text-violet-500 hover:text-violet-600">
        ← Back to meetups
      </Link>
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl overflow-hidden mt-4">
        <div className="aspect-[3/1] bg-gradient-to-br from-violet-400 via-sky-400 to-emerald-400">
          {m.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.imageUrl} alt={m.title} className="w-full h-full object-cover" />
          ) : null}
        </div>
        <div className="p-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">{m.title}</h1>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {formatShortDate(m.startsAt)} · {formatTime(m.startsAt)} – {formatTime(m.endsAt)} ·{' '}
            {m.location ?? 'Online'}
          </div>
          {m.description && <p className="whitespace-pre-wrap text-sm mb-6">{m.description}</p>}
          <RsvpButtons meetupId={m.id} />
        </div>
      </div>
    </div>
  )
}
