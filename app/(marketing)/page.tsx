import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'
import { getServerSession } from '@/lib/session'
import { PLANS } from '@/lib/stripe-config'
import { DEMO_URL } from '@/lib/marketing/site'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import {
  Eyebrow,
  SectionTitle,
  PrimaryCta,
  GhostCta,
  CheckIcon,
  DashboardMock,
  PortalMock,
} from '@/components/marketing/ui'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'DreamCRM — the front-office platform for dental practices',
  description:
    'Website, online booking, patient portal, messaging, reviews, recall, and an online store — one system, wrapped around the PMS you already run. $99–199/mo, month-to-month.',
  openGraph: {
    title: 'DreamCRM — the front-office platform for dental practices',
    description:
      'Replace the website vendor, booking tool, portal, review tool, and recall service with one system. Keep your PMS.',
    type: 'website',
  },
}

const PILLARS: Array<{ title: string; body: string; href: string }> = [
  { title: 'Practice website', body: 'A real site on your address, edited by clicking the page itself. AI drafts, you approve.', href: '/product#website' },
  { title: 'Online booking', body: 'Live availability, visit-type rules, after-hours capture. Bookings push into your PMS.', href: '/product#booking' },
  { title: 'Patient portal', body: 'Confirm, self-reschedule, forms, balances, payments — in your branding, feature-by-feature toggles.', href: '/product#portal' },
  { title: 'Unified messages', body: 'Portal threads + patient email merge per patient. Waiting patients get a visible aging edge.', href: '/product#messages' },
  { title: 'Reviews', body: 'Post-visit requests; patients’ words become testimonials on your site with one click.', href: '/product#reviews' },
  { title: 'Recall & outreach', body: 'Self-maintaining audiences, warm templates, and a funnel measured in booked visits.', href: '/product#recall' },
  { title: 'Shop & memberships', body: 'Whitening kits and in-house plans, sold on your site, paid to your bank via Stripe.', href: '/product#shop' },
  { title: 'Open Dental sync', body: 'Two-way through the official API only — every write in your audit trail.', href: '/product#integrations' },
]

export default async function MarketingHome() {
  const ctx = await getTenantContext()
  if (ctx) {
    if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
    redirect('/dashboard')
  }
  const session = await getServerSession()
  if (session?.user) redirect('/onboarding-01')

  return (
    <>
      {/* ── Hero ── */}
      <section className="border-b border-gray-100 bg-gradient-to-b from-violet-50/60 to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1 text-[0.78rem] font-semibold text-violet-700">
              Built for dental practices · works with Open Dental
            </p>
            <h1 className="text-[2.4rem] font-extrabold leading-[1.06] tracking-tight text-gray-950 sm:text-[3.1rem]">
              Run your whole front office from one system
            </h1>
            <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed text-gray-600">
              Website, online booking, patient portal, messaging, reviews, recall, and an online
              store — the five or six subscriptions a typical practice juggles, replaced by one.
              Your PMS stays exactly where it is.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <PrimaryCta href="/signup">Start free setup</PrimaryCta>
              <GhostCta href="/product">Tour the platform</GhostCta>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[0.85rem] text-gray-600">
              {['$99–199/mo flat', 'Month-to-month', '10-minute setup', 'Official PMS APIs only'].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckIcon className="h-3.5 w-3.5 text-violet-600" />
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="relative">
            <DashboardMock />
            <div className="absolute -bottom-8 -left-4 hidden w-44 md:block lg:-left-10">
              <div className="scale-[0.62] origin-bottom-left">
                <PortalMock />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── The consolidation math ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>The problem</Eyebrow>
            <h2 className="text-[1.7rem] font-bold leading-tight tracking-tight sm:text-[2.1rem]">
              Your front office runs on six tools that don&apos;t talk to each other
            </h2>
            <p className="mt-4 text-[0.98rem] leading-relaxed text-gray-600">
              A website agency. A booking widget. A reminder service. A review tool. A recall
              vendor. A job board. Typical practices report $800–$2,000 a month across the stack —
              and the patient still has to re-enter their name at every step. DreamCRM is those
              jobs as <em>one</em> product, so a website lead becomes a patient, the patient gets a
              portal, and the visit triggers a review request with nobody copying data between tabs.
            </p>
            <div className="mt-6 flex gap-3">
              <GhostCta href="/compare">See how we compare ↗</GhostCta>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 p-2">
            <table className="w-full text-[0.875rem]">
              <thead>
                <tr className="text-left text-[0.72rem] font-bold uppercase tracking-wider text-gray-400">
                  <th className="px-3 py-2">Replaces</th>
                  <th className="px-3 py-2 text-right">Typical spend</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Website agency retainer', '$150–500/mo'],
                  ['Online booking vendor', '$200–350/mo'],
                  ['Patient communications suite', '$250–400/mo'],
                  ['Review management tool', '$100–300/mo'],
                  ['Recall / reactivation service', '$150–300/mo'],
                  ['Job board listings', '$100–400/mo'],
                ].map(([tool, price]) => (
                  <tr key={tool} className="border-t border-gray-100">
                    <td className="px-3 py-2.5 font-medium text-gray-800">{tool}</td>
                    <td className="px-3 py-2.5 text-right text-gray-400 line-through">{price}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-violet-200 bg-violet-50/60">
                  <td className="px-3 py-3 font-bold text-gray-950">DreamCRM — all of it</td>
                  <td className="px-3 py-3 text-right font-bold text-violet-700">$99–199/mo</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Pillars ── */}
      <section className="border-y border-gray-100 bg-gray-50/70">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionTitle sub="Eight jobs, one login. Every card links to the full walkthrough.">
            Everything patient-facing, in one place
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((p) => (
              <Link
                key={p.title}
                href={p.href}
                className="group rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-violet-300"
              >
                <h3 className="text-[0.98rem] font-bold text-gray-950">{p.title}</h3>
                <p className="mt-1.5 text-[0.85rem] leading-relaxed text-gray-600">{p.body}</p>
                <span className="mt-3 inline-block text-[0.82rem] font-semibold text-violet-600 group-hover:underline">
                  Learn more →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison teaser ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionTitle sub="We publish honest comparisons — including what each vendor does better than us.">
          Evaluating the alternatives?
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {COMPARISONS.map((c) => (
            <Link
              key={c.slug}
              href={`/compare/${c.slug}`}
              className="rounded-xl border border-gray-200 p-4 transition-colors hover:border-violet-300"
            >
              <p className="text-[0.78rem] font-semibold text-gray-400">DreamCRM vs</p>
              <p className="mt-0.5 text-[1.05rem] font-bold text-gray-950">{c.name}</p>
              <p className="mt-1 text-[0.78rem] leading-snug text-gray-500">{c.category}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Pricing teaser ── */}
      <section className="border-t border-gray-100 bg-gray-50/70">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionTitle sub="Published on the page, no discovery call. Annual billing gets two months free.">
            Flat pricing, month-to-month
          </SectionTitle>
          <div className="grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-xl border bg-white p-6 ${plan.id === 'pro' ? 'border-violet-400 ring-1 ring-violet-400' : 'border-gray-200'}`}
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[1rem] font-bold">{plan.name}</h3>
                  {plan.id === 'pro' && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.7rem] font-bold text-violet-700">
                      Most popular
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[2rem] font-extrabold tracking-tight">
                  ${plan.price}
                  <span className="text-[0.85rem] font-medium text-gray-500"> /mo</span>
                </p>
                <ul className="mt-4 space-y-2">
                  {plan.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[0.85rem] text-gray-700">
                      <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/pricing"
                  className="mt-5 inline-block text-[0.85rem] font-semibold text-violet-600 hover:underline"
                >
                  Full plan details →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="rounded-2xl bg-gray-950 px-8 py-14 text-center">
          <h2 className="mx-auto max-w-2xl text-[1.8rem] font-bold leading-tight tracking-tight text-white sm:text-[2.2rem]">
            See it running before you sign up for anything
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[0.95rem] leading-relaxed text-gray-400">
            Acme Dental is a fully-populated demo practice — browse its public website, then start
            your own setup whenever you&apos;re convinced.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <PrimaryCta href="/signup">Get started</PrimaryCta>
            <a
              href={DEMO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-white/25 px-5 py-2.5 text-[0.92rem] font-semibold text-white hover:border-white/50"
            >
              Visit the demo practice ↗
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
