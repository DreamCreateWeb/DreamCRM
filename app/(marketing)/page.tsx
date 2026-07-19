import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'
import { getServerSession } from '@/lib/session'
import { PLANS } from '@/lib/stripe-config'
import { DEMO_URL } from '@/lib/marketing/site'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { JsonLd, softwareApplicationLd } from '@/lib/marketing/seo'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import {
  Eyebrow,
  SectionTitle,
  PrimaryCta,
  GhostCta,
  CheckIcon,
  DashboardMock,
  PortalMock,
  MarqueeStrip,
  HERO_DOT_GRID,
} from '@/components/marketing/ui'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'DreamCRM — the front-office platform for dental practices',
  description:
    'Website, online booking, patient portal, messaging, reviews, recall, and an online store — one system, wrapped around the PMS you already run. 7-day free trial, no card. $150–500/mo after, month-to-month.',
  openGraph: {
    title: 'DreamCRM — the front-office platform for dental practices',
    description:
      'Replace the website vendor, booking tool, portal, review tool, and recall service with one system. Keep your PMS.',
    type: 'website',
    // A page-level openGraph block replaces the inherited one wholesale,
    // dropping the root file-convention image — re-add it explicitly
    // (resolved absolute via metadataBase).
    images: ['/opengraph-image'],
  },
}

const PILLARS: Array<{ title: string; body: string; href: string; glyph: React.ReactNode }> = [
  {
    title: 'Practice website',
    body: 'A real site on your address, edited by clicking the page itself. AI drafts, you approve.',
    href: '/product#website',
    glyph: <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-13ZM3 8.5h18M6 6h.01" />,
  },
  {
    title: 'Online booking',
    body: 'Live availability, visit-type rules, after-hours capture. Bookings push into your PMS.',
    href: '/product#booking',
    glyph: <><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M3.5 10h17M8 2.5V7m8-4.5V7M8.5 14.5l2.5 2.5 4.5-5" /></>,
  },
  {
    title: 'Patient portal',
    body: 'Confirm, self-reschedule, forms, balances, payments — your branding, your toggles.',
    href: '/product#portal',
    glyph: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  },
  {
    title: 'Unified messages',
    body: 'Portal threads + patient email merge per patient. Waiting patients get an aging edge.',
    href: '/product#messages',
    glyph: <path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12Z" />,
  },
  {
    title: 'Reviews',
    body: 'Patients write in their words; you feature the best on your site with one click.',
    href: '/product#reviews',
    glyph: <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9L12 3.5Z" />,
  },
  {
    title: 'Recall & outreach',
    body: 'Self-maintaining audiences and a funnel measured in booked visits, not opens.',
    href: '/product#recall',
    glyph: <path d="M4 12a8 8 0 1 1 2.3 5.6M4 12V7m0 5h5" />,
  },
  {
    title: 'Shop & memberships',
    body: 'Whitening kits and in-house plans, sold on your site, paid out to your own bank.',
    href: '/product#shop',
    glyph: <><path d="M5 8h14l-1 12a1.5 1.5 0 0 1-1.5 1.3h-9A1.5 1.5 0 0 1 6 20L5 8Z" /><path d="M9 10.5V6a3 3 0 0 1 6 0v4.5" /></>,
  },
  {
    title: 'Open Dental sync',
    body: 'Two-way through the official API only — every write lands in your audit trail.',
    href: '/product#integrations',
    glyph: <path d="M9 7h6a4 4 0 0 1 0 8h-2m-4 2H5a4 4 0 0 1 0-8h2m1 4h8" />,
  },
]

const TENETS: Array<{ title: string; body: string }> = [
  {
    title: 'The price is on the page',
    body: '$150–500/mo, published. No discovery call, no custom quote, no per-feature add-ons appearing on invoice three.',
  },
  {
    title: 'Our gaps are marked',
    body: 'No VoIP phones. No SMS texting yet — it\u2019s on the roadmap, not on the invoice. It says so on the pricing page and in every comparison — before you buy, not after.',
  },
  {
    title: 'Official APIs only',
    body: 'Open Dental has publicly warned about vendors writing into its database directly. Every write we make goes through the sanctioned API, into your audit trail.',
  },
  {
    title: 'Leaving is allowed',
    body: 'Month-to-month, no contract. Your PMS stays the system of record and your website content exports with you. Lock-in is not a feature.',
  },
]



export default async function MarketingHome() {
  const ctx = await getTenantContext()
  if (ctx) {
    if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
    if (ctx.tenantType === 'partner') redirect('/partner')
    redirect('/dashboard')
  }
  const session = await getServerSession()
  if (session?.user) redirect('/onboarding-01')

  return (
    <>
      <JsonLd data={softwareApplicationLd(PLANS)} />
      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b border-gray-100">
        <div className="absolute inset-0 opacity-40" style={HERO_DOT_GRID} aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white to-transparent" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 lg:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mkt-enter mb-5 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white px-3.5 py-1.5 text-[0.78rem] font-semibold text-teal-700 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-600" aria-hidden="true" />
              Built for dental practices · syncs with Open Dental
            </p>
            <h1 className="mkt-enter mkt-d1 text-[2.6rem] font-extrabold leading-[1.04] tracking-tight text-gray-950 sm:text-[3.5rem]">
              Your whole front office.
              <br />
              <span className="bg-gradient-to-r from-teal-600 to-teal-400 bg-clip-text text-transparent">
                One calm system.
              </span>
            </h1>
            <p className="mkt-enter mkt-d2 mx-auto mt-6 max-w-2xl text-[1.08rem] leading-relaxed text-gray-600">
              The website, booking, portal, messages, reviews, recall, and shop your practice juggles
              across five or six vendors — finally one system that just talks to itself. And your
              PMS? It stays exactly where it is.
            </p>
            <div className="mkt-enter mkt-d3 mt-8 flex flex-wrap items-center justify-center gap-3">
              <PrimaryCta href="/signup">Start your free trial</PrimaryCta>
              <GhostCta href="/product">Tour the platform</GhostCta>
            </div>
            <div className="mkt-enter mkt-d4 mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[0.85rem] text-gray-600">
              {['7 days of Premium free', 'No card to start', '$150–500/mo after, flat', 'Month-to-month'].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckIcon className="h-3.5 w-3.5 text-teal-700" />
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="mkt-enter mkt-d4 mt-14 flex items-end justify-center gap-6">
            <div className="mkt-float w-full max-w-3xl">
              <DashboardMock />
            </div>
            <div className="mkt-float-slow hidden shrink-0 lg:block">
              <PortalMock />
            </div>
          </div>
          <p className="mt-4 text-center text-[0.78rem] font-medium text-gray-400">
            The front desk&apos;s morning huddle — and the portal your patients see.
          </p>
        </div>
      </section>

      <MarqueeStrip />

      {/* ── The consolidation math ── */}
      <ScrollReveal as="section" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>The problem</Eyebrow>
            <h2 className="text-[1.7rem] font-bold leading-tight tracking-tight sm:text-[2.1rem]">
              Six tools. Six logins.
              <br />
              Six invoices. Zero shared data.
            </h2>
            <p className="mt-4 text-[0.98rem] leading-relaxed text-gray-600">
              A typical practice spends $800–$2,000 a month across patient-facing tools that
              don&apos;t talk to each other. DreamCRM does the same jobs as one product — so a
              website lead becomes a patient, the patient gets a portal, and the visit triggers a
              review request with nobody copying data between tabs.
            </p>
            <div className="mt-6">
              <GhostCta href="/compare">See the honest comparisons</GhostCta>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 p-2 shadow-sm">
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
                <tr className="border-t-2 border-teal-200 bg-teal-50/60">
                  <td className="px-3 py-3 font-bold text-gray-950">DreamCRM — all of it</td>
                  <td className="px-3 py-3 text-right font-bold text-teal-700">$150–500/mo</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </ScrollReveal>

      {/* ── Pillars ── */}
      <section className="border-y border-gray-100 bg-gray-50/70">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <ScrollReveal>
            <SectionTitle sub="Every patient-facing job, one login. Every card opens the full walkthrough — and there's a daily-ops layer behind them.">
              Everything patient-facing, in one place
            </SectionTitle>
          </ScrollReveal>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((p, i) => (
              <ScrollReveal key={p.title} delay={Math.min(i * 60, 240)}>
                <Link
                  href={p.href}
                  className="group block h-full rounded-xl border border-gray-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md hover:shadow-teal-100"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {p.glyph}
                    </svg>
                  </span>
                  <h3 className="mt-3.5 text-[0.98rem] font-bold text-gray-950">{p.title}</h3>
                  <p className="mt-1.5 text-[0.85rem] leading-relaxed text-gray-600">{p.body}</p>
                  <span className="mt-3 inline-block text-[0.82rem] font-semibold text-teal-700 group-hover:underline">
                    Learn more →
                  </span>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Honest by default ── */}
      <ScrollReveal as="section" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <Eyebrow>Why practices trust it</Eyebrow>
            <h2 className="text-[1.7rem] font-bold leading-tight tracking-tight sm:text-[2.1rem]">
              Honest by default
            </h2>
            <p className="mt-4 text-[0.95rem] leading-relaxed text-gray-600">
              Dental software has a trust problem — surprise invoices, term contracts, sync agents
              that break quietly. We took the opposite position on every one of those, in writing.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {TENETS.map((t) => (
              <div key={t.title} className="rounded-xl border border-gray-200 p-5">
                <p className="flex items-center gap-2 text-[0.95rem] font-bold text-gray-950">
                  <CheckIcon className="h-4 w-4 shrink-0 text-teal-700" />
                  {t.title}
                </p>
                <p className="mt-2 text-[0.85rem] leading-relaxed text-gray-600">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>

      {/* ── The first afternoon ── */}
      <section className="border-t border-gray-100">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <ScrollReveal>
            <SectionTitle sub="No implementation project, no onboarding call queue — the trial starts the moment you finish the four-step setup.">
              Your first afternoon on DreamCRM
            </SectionTitle>
          </ScrollReveal>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: '1',
                title: 'Create your account',
                body: 'Name, practice, address, web address, brand color. Four screens, no card.',
              },
              {
                step: '2',
                title: 'Answer a short interview',
                body: 'The AI asks about your practice and drafts your whole website — services, about, FAQ — in your voice.',
              },
              {
                step: '3',
                title: 'Your site + trial go live',
                body: 'A finished practice site on your address, and 7 days of the full Premium platform to run for real.',
              },
              {
                step: '4',
                title: 'Connect as you go',
                body: 'Google Business, Gmail, social accounts, Open Dental — each takes minutes, none blocks the rest.',
              },
            ].map((st, i) => (
              <ScrollReveal key={st.step} delay={Math.min(i * 60, 240)}>
                <div className="relative h-full rounded-xl border border-gray-200 bg-white p-5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-[0.85rem] font-bold text-white">
                    {st.step}
                  </span>
                  <h3 className="mt-3.5 text-[0.98rem] font-bold text-gray-950">{st.title}</h3>
                  <p className="mt-1.5 text-[0.85rem] leading-relaxed text-gray-600">{st.body}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison teaser ── */}
      <section className="border-t border-gray-100 bg-gray-50/70">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <ScrollReveal>
            <SectionTitle sub="Page-length comparisons — including what each vendor does better than us.">
              Evaluating the alternatives? Good.
            </SectionTitle>
          </ScrollReveal>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {COMPARISONS.map((c, i) => (
              <ScrollReveal key={c.slug} delay={Math.min(i * 60, 240)}>
                <Link
                  href={`/compare/${c.slug}`}
                  className="block h-full rounded-xl border border-gray-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md hover:shadow-teal-100"
                >
                  <p className="text-[0.78rem] font-semibold text-gray-400">DreamCRM vs</p>
                  <p className="mt-0.5 text-[1.05rem] font-bold text-gray-950">{c.name}</p>
                  <p className="mt-1 text-[0.78rem] leading-snug text-gray-500">{c.category}</p>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ── */}
      <ScrollReveal as="section" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <SectionTitle sub="Published on the page, no discovery call. Month-to-month, cancel anytime.">
          Flat pricing, month-to-month
        </SectionTitle>
        <div className="grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl border bg-white p-6 ${plan.id === 'pro' ? 'border-teal-400 shadow-lg shadow-teal-100 ring-1 ring-teal-400' : 'border-gray-200'}`}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-[1rem] font-bold">{plan.name}</h3>
                {plan.id === 'pro' && (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[0.7rem] font-bold text-teal-700">
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
                    <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/pricing"
                className="mt-5 inline-block text-[0.85rem] font-semibold text-teal-700 hover:underline"
              >
                Full plan details →
              </Link>
            </div>
          ))}
        </div>
      </ScrollReveal>

      {/* ── Final CTA ── */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <ScrollReveal>
          <div className="relative overflow-hidden rounded-2xl bg-gray-950 px-8 py-16 text-center">
            <div
              className="absolute inset-0 opacity-[0.15]"
              style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, #2f52b3 0%, transparent 45%), radial-gradient(circle at 75% 85%, #7ca5ff 0%, transparent 40%)' }}
              aria-hidden="true"
            />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-[1.8rem] font-bold leading-tight tracking-tight text-white sm:text-[2.3rem]">
                See it running before you sign up for anything
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-[0.95rem] leading-relaxed text-gray-400">
                Dream Dental is a fully-populated demo practice — browse its public website. When
                you&apos;re convinced, every practice starts with 7 days of Premium, free, no card.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-lg bg-teal-700 px-5 py-2.5 text-[0.92rem] font-semibold text-white hover:bg-teal-600"
                >
                  Start your free trial
                </Link>
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
          </div>
        </ScrollReveal>
      </section>
    </>
  )
}
