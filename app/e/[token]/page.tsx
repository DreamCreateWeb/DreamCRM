import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getEventByCaptureToken } from '@/lib/services/event-capture'
import CaptureForm from './capture-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Free headshot — Dream Create',
  robots: { index: false, follow: false },
}

/**
 * The conference floor's capture page — /e/<token>, the EVENT's token is
 * the auth (Part 10.8). Lives on the owner's own phone; the attendee types
 * their details, ticks the release, chooses the opt-in, and the headshot
 * (from the phone now, or the camera later) reaches their inbox with the
 * Practice Scan riding along.
 */
export default async function EventCapturePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const event = await getEventByCaptureToken(token)
  if (!event) notFound()
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-md px-5 py-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">{event.organizer ?? 'Dream Create'}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your free headshot</h1>
        <p className="mt-2 text-sm text-gray-600">
          Tell us where to send it. We’ll also run your practice’s free online scan and send the report
          with the photo — no strings.
        </p>
        <CaptureForm token={token} eventName={event.name} organizer={event.organizer} />
      </div>
    </main>
  )
}
