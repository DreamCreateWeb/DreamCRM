import { notFound } from 'next/navigation'
import { getMeetingByToken, listAvailableSlots, formatMeetingTime } from '@/lib/services/prospect-meetings'
import { groupSlotsByDay } from '@/lib/prospect-booking'
import BookingForm from './booking-form'

export const metadata = {
  title: 'Book your Dream Create demo',
  description: 'Pick a time for a quick walkthrough.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * Public prospect demo self-booking — `https://…/d/<token>`. The prospect
 * lands from the outreach link; the token IS the auth (the /r /w /c /b
 * pattern). Slots are the owner's availability shown in the prospect's own
 * timezone; booking emails both sides an add-to-calendar link.
 */
export default async function DemoBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const view = await getMeetingByToken(token)
  if (!view) notFound()

  const tz = view.prospectTimeZone
  const booked = view.meeting.status === 'booked' && view.meeting.scheduledAt
  const closed = ['canceled', 'completed', 'no_show'].includes(view.meeting.status)

  // Only compute slots when we still need to offer them.
  let dayGroups: Array<{ dayKey: string; label: string; slots: Array<{ iso: string; time: string }> }> = []
  let bookingEnabled = true
  if (!closed) {
    const avail = await listAvailableSlots()
    bookingEnabled = avail.enabled
    const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })
    dayGroups = groupSlotsByDay(avail.slots, tz).map((g) => ({
      dayKey: g.dayKey,
      label: g.label,
      slots: g.slots.map((s) => ({ iso: s.toISOString(), time: timeFmt.format(s) })),
    }))
  }

  const tzAbbrev =
    new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value ?? ''

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white dark:from-gray-900 dark:to-gray-950 flex items-start justify-center px-4 py-12 sm:py-20">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <div className="text-sm font-semibold tracking-wide text-teal-700 dark:text-teal-300">DREAM CREATE</div>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            {booked ? 'Your demo is booked' : 'Book your demo'}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {booked
              ? 'We look forward to showing you around.'
              : `A quick ${view.meeting.durationMin}-minute walkthrough — see exactly what we'd build for ${view.prospectName}.`}
          </p>
        </div>

        <div className="rounded-2xl border border-[color:var(--color-hairline)] bg-white dark:bg-gray-900 p-6 shadow-sm">
          {closed ? (
            <p className="text-center text-gray-500 dark:text-gray-400">
              This booking link is no longer active.
            </p>
          ) : booked ? (
            <BookingForm
              token={token}
              durationMin={view.meeting.durationMin}
              tzAbbrev={tzAbbrev}
              dayGroups={dayGroups}
              bookingEnabled={bookingEnabled}
              confirmedTime={formatMeetingTime(view.meeting.scheduledAt as Date, tz)}
              defaultName={view.meeting.attendeeName}
              defaultEmail={view.meeting.attendeeEmail}
            />
          ) : (
            <BookingForm
              token={token}
              durationMin={view.meeting.durationMin}
              tzAbbrev={tzAbbrev}
              dayGroups={dayGroups}
              bookingEnabled={bookingEnabled}
              confirmedTime={null}
              defaultName={view.meeting.attendeeName}
              defaultEmail={view.meeting.attendeeEmail}
            />
          )}
        </div>
      </div>
    </div>
  )
}
