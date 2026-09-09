import Link from 'next/link'
import { Eyebrow, CheckIcon } from '@/components/marketing/ui'
import { JsonLd, breadcrumbLd, faqPageLd } from '@/lib/marketing/seo'
import ApplyForm from './apply-form'

export const metadata = {
  title: 'DreamCRM partner program — 10% recurring for dental consultants & advisors',
  description:
    'Refer dental practices to DreamCRM and earn 10% of every payment, month after month, for as long as they stay. For practice consultants, dental CPAs and bookkeepers, IT providers, and agencies.',
  alternates: { canonical: '/partner-program' },
}

/** Rendered verbatim below AND emitted as FAQPage schema — one source. */
const FAQ = [
  {
    q: 'How much does the DreamCRM partner program pay?',
    a: 'The standard rate is 10% of every payment from every practice you refer — recurring, month after month, for as long as they stay subscribed. At the $200/mo plan that’s $20 per practice per month. Your exact rate and term are written into your partner agreement, so there’s never a surprise.',
  },
  {
    q: 'How do payouts work?',
    a: 'Commissions accrue automatically the moment a referred practice’s invoice is paid — you can watch them accrue live in your partner portal. Payouts go straight to your bank through Stripe, once your accrued balance reaches the $25 minimum.',
  },
  {
    q: 'How are my referrals tracked?',
    a: 'You introduce the practice (or send them our way and tell us), and we tag them to you when their account is created. Every referral, its status, and every dollar accrued is visible in your partner portal — no spreadsheets, no chasing.',
  },
  {
    q: 'Who is this for?',
    a: 'People dental practices already trust: practice-management consultants and coaches, dental CPAs and bookkeepers, IT providers, marketing agencies, and study-club leaders. If practices ask you “what software should we use?”, this program pays you for the answer you’d give anyway — and DreamCRM is easy to stand behind: $200/mo published, month-to-month, free 7-day trial, no contracts.',
  },
]

export default function PartnerProgramPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Partner program', path: '/partner-program' },
          ]),
          faqPageLd(FAQ),
        ]}
      />
      <section className="border-b border-gray-100 bg-gradient-to-b from-teal-50/60 to-white">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <div className="mkt-enter"><Eyebrow>Partner program</Eyebrow></div>
          <h1 className="mkt-enter mkt-d1 text-[2rem] font-extrabold leading-tight tracking-tight sm:text-[2.5rem]">
            You advise dental practices. Get paid when they thrive.
          </h1>
          <p className="mkt-enter mkt-d2 mt-4 text-[0.98rem] leading-relaxed text-gray-700">
            Refer a practice to DreamCRM and earn <strong>10% of every payment they make</strong> —
            recurring, for as long as they stay. Live tracking in your own partner portal, payouts
            straight to your bank.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              step: '1',
              title: 'Introduce a practice',
              body: 'Send them to the free trial, or make a warm intro — whatever fits how you work. We tag the account to you.',
            },
            {
              step: '2',
              title: 'They subscribe',
              body: '$200/mo, month-to-month, no contract — an easy recommendation to stand behind, because they can leave anytime.',
            },
            {
              step: '3',
              title: 'You earn on every invoice',
              body: '10% accrues automatically each time they pay. Watch it live in your portal; Stripe deposits it once you clear $25.',
            },
          ].map((s) => (
            <div key={s.step} className="rounded-xl border border-gray-200 p-6">
              <p className="text-[0.78rem] font-bold uppercase tracking-wider text-teal-700">Step {s.step}</p>
              <h2 className="mt-1 text-[1.1rem] font-bold text-gray-950">{s.title}</h2>
              <p className="mt-2 text-[0.88rem] leading-relaxed text-gray-600">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-teal-200 bg-teal-50/40 p-6 sm:p-8">
          <h2 className="text-[1.15rem] font-bold tracking-tight">The math, plainly</h2>
          <p className="mt-2 text-[0.92rem] leading-relaxed text-gray-700">
            Ten practices on DreamCRM = <strong>$200/mo</strong> to you, every month, for work you
            already do: being the person practices trust for advice. There&apos;s no quota, no
            minimum, and the product does its own convincing — a free 7-day trial, a published
            price, and{' '}
            <Link href="/grade" className="font-semibold text-teal-700 hover:underline">
              a free practice grade
            </Link>{' '}
            you can run with a client in five minutes.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              '10% of every paid invoice, standard',
              'Recurring — not a one-time bounty',
              'Live referral + commission tracking portal',
              'Stripe payouts to your bank ($25 minimum)',
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-[0.88rem] text-gray-700">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-gray-100 bg-gray-50/70">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <h2 className="mb-6 text-center text-[1.4rem] font-bold tracking-tight">Common questions</h2>
          <div className="space-y-4">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-xl border border-gray-200 bg-white p-5 open:shadow-sm">
                <summary className="cursor-pointer list-none text-[0.95rem] font-bold text-gray-900 [&::-webkit-details-marker]:hidden">
                  <span className="mr-2 inline-block text-teal-600 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
                  {f.q}
                </summary>
                <p className="mt-3 text-[0.9rem] leading-relaxed text-gray-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6" id="apply">
        <h2 className="mb-2 text-center text-[1.4rem] font-bold tracking-tight">Apply</h2>
        <p className="mx-auto mb-6 max-w-xl text-center text-[0.9rem] leading-relaxed text-gray-600">
          Tell us who you work with. A real person reads every application, and fits get their
          partner invite within a couple of business days.
        </p>
        <ApplyForm />
      </section>
    </>
  )
}
