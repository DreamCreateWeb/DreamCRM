import type { Metadata } from 'next'
import GradeForm from './grade-form'

export const metadata: Metadata = {
  title: 'Grade your dental practice’s online presence — DreamCRM',
  description:
    'Free grader for dental practices: your website, your Google Business listing, and your reviews — scored in seconds, with what patients actually experience.',
}

/**
 * The practice grader (docs/marketing-engine.md, slice 2) — the marketing
 * site's first interactive door: worth linking, worth ranking, and the
 * report it produces is the pitch in the practice's own numbers.
 */
export default function GradePage() {
  return (
    <div className="bg-white">
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid items-start gap-12 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Free grader</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-950 text-balance">
              How does your practice look to a patient searching right now?
            </h1>
            <p className="mt-4 max-w-lg text-gray-600">
              We check the three things patients actually see — your website, your Google Business
              listing, and your reviews — and grade them the way a patient experiences them. Takes
              about ten seconds, and the report is yours either way.
            </p>
            <ul className="mt-8 space-y-4 text-sm text-gray-700">
              <li className="flex gap-3">
                <span aria-hidden="true">🌐</span>
                <span>
                  <strong className="font-semibold">Your website</strong> — secure, phone-ready,
                  bookable after hours, and readable in a Google result.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true">📍</span>
                <span>
                  <strong className="font-semibold">Your Google listing</strong> — findable on the map,
                  open, and pointing at the right website.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true">⭐</span>
                <span>
                  <strong className="font-semibold">Your reviews</strong> — the stars and the volume
                  patients filter by before they ever call.
                </span>
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-6 sm:p-8">
            <GradeForm />
          </div>
        </div>
      </section>
    </div>
  )
}
