import Link from 'next/link'
import { PageHero, PrimaryCta, GhostCta, Eyebrow } from '@/components/marketing/ui'

export const metadata = {
  title: 'Why DreamCRM — what this platform believes',
  alternates: { canonical: '/why' },
  description:
    'DreamCRM is the patient-relationship platform for dental practices. Dental-only, wraps the PMS you already run, warm software for real front desks — with our gaps marked and no lock-in.',
}

/**
 * The manifesto page (2026-07-19 positioning shift): identity-first, not
 * vendor-comparison-first. This page says what the PLATFORM believes — not
 * a team page, not a feature list. Consolidation economics live down-funnel
 * (compare pages + blog campaign); this is who the product is.
 */
const BELIEFS: Array<{ title: string; body: string }> = [
  {
    title: 'Dental-only, on purpose, forever',
    body: 'Every default, template, reminder cadence, and integration is built for a dental practice — recall intervals, operatories, insurance checks, hygiene reappointment. Generic CRMs make your practice adapt to them. We adapted to you before you arrived, and we don’t dilute that by chasing other industries.',
  },
  {
    title: 'We wrap your PMS. We don’t replace it.',
    body: 'Your practice management system is the system of record for clinical truth — charts, procedures, claims. It should stay that way. DreamCRM is the relationship layer around it: the website, booking, portal, messages, reviews, and recall that your PMS was never built to do well. Two-way sync through sanctioned integrations, so every change lands in your own audit trail.',
  },
  {
    title: 'Software for front desks, not analysts',
    body: 'The person running your morning isn’t reading dashboards — they’re juggling a phone, a waiting room, and a schedule that changed twice before 9am. So the product talks like a person: “3 still need a text,” never “3 records pending confirmation.” It leads with what needs doing, makes it one click, and celebrates what got done instead of shaming what didn’t.',
  },
  {
    title: 'Alive, not archived',
    body: 'A practice is a living thing — bookings land, patients confirm, reviews arrive. Your software should feel that way. Every number in DreamCRM carries its own pulse, every screen answers “what’s happening right now,” and nothing worth knowing hides behind a report you have to remember to run.',
  },
  {
    title: 'Our gaps are marked',
    body: 'No VoIP phones. No SMS yet — it’s on the roadmap, not on the invoice. Open Dental’s API fee is theirs and we say so. Every comparison page on this site lists what the other vendor does better. We’d rather lose a deal honestly than win one that turns into a support ticket titled “this isn’t what I was told.”',
  },
  {
    title: 'Leaving is allowed',
    body: 'Month-to-month, no contract, no setup fee. Your website content exports with you, and your PMS never stopped being the source of truth. Lock-in is a business model for vendors who expect you to want to leave. We’d rather build the thing you don’t want to leave.',
  },
]

export default function WhyPage() {
  return (
    <>
      <PageHero
        eyebrow="Why DreamCRM"
        title="The patient-relationship platform for dental practices"
        sub="One system for everything between you and your patients — built on a few beliefs we’re not flexible about."
      />

      <section className="mx-auto max-w-3xl px-4 pb-4 pt-2 sm:px-6">
        <p className="text-[1.05rem] leading-relaxed text-gray-600">
          Most dental software is built for the back office: billing engines with a
          patient list attached, dashboards designed for consultants. DreamCRM is
          built for the other half of the practice — the relationship half. The
          website a patient finds you on, the booking that gets them in the chair,
          the portal that answers their questions at 9pm, the message that makes a
          no-show a reschedule, the review that brings the next family in. One
          system, one login, wrapped around the PMS your team already knows.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          {BELIEFS.map((b) => (
            <div key={b.title} className="rounded-2xl border border-gray-200 bg-white p-7">
              <h2 className="text-[1.1rem] font-bold text-gray-950">{b.title}</h2>
              <p className="mt-2.5 text-[0.92rem] leading-relaxed text-gray-600">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-gray-100 bg-gray-50/70">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <Eyebrow>See it, don&apos;t take our word</Eyebrow>
          <h2 className="text-[1.7rem] font-bold leading-tight tracking-tight sm:text-[2.1rem]">
            The proof is a login away
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[0.95rem] leading-relaxed text-gray-600">
            Seven days of everything, no card, no call. Or walk through a fully
            populated practice first and see how a Tuesday actually feels.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <PrimaryCta href="/signup">Start your free trial</PrimaryCta>
            <GhostCta href="/product">Tour the platform</GhostCta>
          </div>
          <p className="mt-6 text-[0.85rem] text-gray-500">
            Weighing us against another vendor?{' '}
            <Link href="/compare" className="font-semibold text-teal-700 hover:underline">
              Read the honest comparisons →
            </Link>
          </p>
        </div>
      </section>
    </>
  )
}
