import Link from 'next/link'
import { Eyebrow, PrimaryCta, GhostCta } from '@/components/marketing/ui'
import { JsonLd, breadcrumbLd } from '@/lib/marketing/seo'
import RoiCalculator from './roi-calculator'

export const metadata = {
  title: 'Dental recall ROI calculator — what missed hygiene visits cost',
  description:
    'Free calculator: enter your active patients, recall rate, and hygiene visit value — see what off-schedule patients cost your practice each year, and what winning some back is worth. Runs in your browser; nothing is sent to us.',
  alternates: { canonical: '/roi' },
}

export default function RoiPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'Recall ROI calculator', path: '/roi' },
        ])}
      />
      <section className="border-b border-gray-100 bg-gradient-to-b from-teal-50/60 to-white">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <div className="mkt-enter"><Eyebrow>Free calculator</Eyebrow></div>
          <h1 className="mkt-enter mkt-d1 text-[2rem] font-extrabold leading-tight tracking-tight sm:text-[2.5rem]">
            What are missed hygiene visits costing you?
          </h1>
          <p className="mkt-enter mkt-d2 mt-4 text-[0.98rem] leading-relaxed text-gray-700">
            Every practice has patients who quietly fell off the recall schedule. Put in three
            numbers you already know and see what that&apos;s worth per year — the math runs right
            here in your browser.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <RoiCalculator />
      </section>

      <section className="border-t border-gray-100 bg-gray-50/70">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <h2 className="text-[1.3rem] font-bold tracking-tight">How the math works (all of it)</h2>
          <p className="mt-3 text-[0.92rem] leading-relaxed text-gray-600">
            Patients off the schedule × two hygiene visits a year × your average visit value = what’s
            at stake. The three columns apply a 10%, 25%, and 40% win-back rate to that number —
            hedged on purpose, because a recall engine reaches people; it doesn’t teleport them into
            chairs. There’s no projection of <em>your</em> results here: the only practice-specific
            numbers on this page are the ones you typed.
          </p>
          <p className="mt-3 text-[0.92rem] leading-relaxed text-gray-600">
            The part software actually changes is the <span className="font-semibold">asking</span>.
            Most practices ask once, by hand, when someone remembers. A recall engine asks every due
            patient, every cycle, forever — email first, with a booking link — and reports the only
            number that matters: booked back. That’s the exact funnel DreamCRM runs and shows you,
            and we published the scripts free:{' '}
            <Link href="/resources/dental-recall-scripts" className="font-semibold text-teal-700 hover:underline">
              the recall scripts
            </Link>
            .
          </p>
          <div className="mt-8 text-center">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <PrimaryCta href="/signup">Start free — 7 days, no card</PrimaryCta>
              <GhostCta href="/grade">Grade your practice free</GhostCta>
            </div>
            <p className="mt-4 text-[0.8rem] text-gray-500">
              $200/mo flat, month-to-month — the break-even line above is the whole pitch.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
