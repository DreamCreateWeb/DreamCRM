import SearchForm from '@/components/search-form'
import MeetupsPosts, { type MeetupItem } from './meetups-posts'
import PaginationNumeric from '@/components/pagination-numeric'
import AddMeetupModal from './add-meetup-modal'
import { requireUser } from '@/lib/session'
import { listMeetups } from '@/lib/services/community'

export const metadata = {
  title: 'Meetups - DreamCRM',
  description: 'Discover and host meetups',
}

export const dynamic = 'force-dynamic'

export default async function Meetups() {
  await requireUser()
  const meetups = await listMeetups({ upcomingOnly: false })
  const items: MeetupItem[] = meetups.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    location: m.location,
    startsAt: m.startsAt,
    endsAt: m.endsAt,
    imageUrl: m.imageUrl,
    capacity: m.capacity,
    hostName: m.hostName,
    rsvpCount: m.rsvpCount,
  }))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-5">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Discover Meetups</h1>
        </div>
        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          <SearchForm placeholder="Search…" />
          <AddMeetupModal />
        </div>
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400 italic mb-4">
        {items.length} {items.length === 1 ? 'meetup' : 'meetups'}
      </div>
      <MeetupsPosts meetups={items} />
      <div className="mt-8">
        <PaginationNumeric />
      </div>
    </div>
  )
}
