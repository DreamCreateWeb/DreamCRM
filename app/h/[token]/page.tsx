import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCaptureByToken } from '@/lib/services/event-capture'
import { eventTaggedUrl } from '@/lib/event-capture'
import { GRADER_UTM_SOURCE } from '@/lib/marketing-attribution'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your headshot — Dream Create',
  robots: { index: false, follow: false },
}

/**
 * The attendee's page — /h/<token>, token IS the auth. The photo, its
 * download, and the scan card. The one marketing door here is tagged
 * with the event's attribution so the dials can see what a conference
 * floor is worth.
 */
export default async function HeadshotPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const view = await getCaptureByToken(token)
  if (!view) notFound()
  const reportHref = view.grade
    ? `/g/${view.grade.token}?utm_source=${GRADER_UTM_SOURCE}&utm_medium=web&utm_campaign=${encodeURIComponent(view.eventSlug)}`
    : null
  const homeHref = eventTaggedUrl('', '/', view.eventSlug, 'web')
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-xl px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">{view.eventName}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Hi {view.firstName} — here’s your headshot.</h1>
        {view.photoUrl ? (
          <>
            {/* Not <SiteImage>: this is a platform page, not a clinic site, and
                the file is served as-is so the download is the original. */}
            <img
              src={view.photoUrl}
              alt={`${view.firstName}'s headshot`}
              className="mt-6 w-full max-w-md rounded-2xl shadow-lg"
            />
            <a
              href={view.photoUrl}
              download
              target="_blank"
              rel="noopener"
              className="mt-5 inline-flex rounded-lg bg-gray-900 px-5 py-3 text-base font-semibold text-white"
            >
              Download full size
            </a>
          </>
        ) : (
          <p className="mt-6 rounded-xl bg-gray-50 p-5 text-gray-700">
            Your photo is being edited — it’ll land in your inbox shortly. This page will show it too.
          </p>
        )}

        {view.grade ? (
          <section className="mt-10 rounded-2xl border border-gray-200 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Your practice’s online scan</p>
            <p className="mt-2 text-lg font-semibold">
              {view.practiceName}
              {view.grade.letter && view.grade.overall != null
                ? ` graded ${view.grade.letter} (${view.grade.overall}/100)`
                : ''}
            </p>
            <p className="mt-1 text-sm text-gray-600">
              What a patient searching right now actually sees — your website, your Google listing, your reviews — and
              what fixes it.
            </p>
            {reportHref ? (
              <a href={reportHref} className="mt-4 inline-flex rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white">
                See the full report →
              </a>
            ) : null}
          </section>
        ) : null}

        <p className="mt-10 text-sm text-gray-500">
          Made by Dream Create{view.organizer ? `, ${view.organizer}’s web partner` : ''}.{' '}
          <a href={homeHref} className="text-teal-700 underline">See what DreamCRM does for a practice →</a>
        </p>
      </div>
    </main>
  )
}
