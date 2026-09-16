import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'
import { getServerSession } from '@/lib/session'
import { DEMO_URL } from '@/lib/marketing/site'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { JsonLd, softwareApplicationLd } from '@/lib/marketing/seo'
import ScrollReveal from '@/components/clinic-site/scroll-reveal'
import CinematicSpine from '@/components/marketing/cinematic-spine'
import {
  Eyebrow,
  SectionTitle,
  GhostCta,
  ToneTile,
  type ToneTileGlyph,
  DashboardMock,
  MarqueeStrip,
  MONO_LABEL,
  DAY_WIRE,
  DaylightSky,
  HeroGhostCta,
  HeroPrimaryCta,
  HeroReplyBubble,
  HeroStatTile,
} from '@/components/marketing/ui'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'DreamCRM — the patient-relationship platform for dental practices',
  description:
    'The patient-relationship platform for dental practices: website, online booking, patient portal, messaging, reviews, recall, and an online store — one system, wrapped around the PMS you already run. 7-day free trial, no card. $200/mo founding practice rate (regularly $500), month-to-month.',
  openGraph: {
    title: 'DreamCRM — the patient-relationship platform for dental practices',
    description:
      'Everything between you and your patients — website, booking, portal, messages, reviews, recall — in one calm system. Keep your PMS.',
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
    title: 'PMS sync',
    body: 'Open Dental, Dentrix + more through one bridge — official paths only.',
    href: '/product#integrations',
    glyph: <path d="M9 7h6a4 4 0 0 1 0 8h-2m-4 2H5a4 4 0 0 1 0-8h2m1 4h8" />,
  },
]

/* The glyph is part of the tenet, not a decoration chosen at render time —
   `BRAND.md` Part 3's tone tiles are a vocabulary, and the subject a line is
   about belongs beside the line's own words. Four tenets, four statements:
   the published price, the marked gaps, the audit trail, the open door. */
const TENETS: Array<{ title: string; body: string; glyph: ToneTileGlyph }> = [
  {
    glyph: 'tag',
    title: 'The price is on the page',
    body: 'One plan, $200/mo — published. No discovery call, no custom quote, no per-feature add-ons appearing on invoice three.',
  },
  {
    glyph: 'flag',
    title: 'Our gaps are marked',
    body: 'No VoIP phones. No SMS texting yet — it\u2019s on the roadmap, not on the invoice. It says so on the pricing page and in every comparison — before you buy, not after.',
  },
  {
    glyph: 'shield',
    title: 'Audit-clean sync',
    body: 'Every write we make into your PMS lands in its own audit trail under a sanctioned integration — visible, attributable, yours. The system of record stays the system of record.',
  },
  {
    glyph: 'door',
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
      <JsonLd data={softwareApplicationLd([{ name: 'DreamCRM', price: 200 }])} />
      {/* ── Hero — THE DAYLIGHT BAND (BRAND.md Part 8, move 1) ───────────
             The page is light now, hero included. The owner lived with the
             night band that shipped on DREAMCRM-54 and reversed it on
             DREAMCRM-67 — "i want to move heavier into the white/light theme"
             — so the dark opening is gone and the page's one dark surface is
             the footer it always closed on.

             WHAT THE LIGHT GROUND CHANGES ABOUT THE GRADING, and it is not
             "nothing to grade any more". Daylight pairs ARE covered by the
             source rules in `tests/a11y/class-pairs.ts`, which is why the
             headline's `CLIPPED_TEXT_EXEMPTIONS` entry was deleted in this
             same PR rather than re-pointed: on white, rule 4 grades the stops
             against the ground they actually ride and is simply right. But the
             decorative layers are still `background-image`, and axe still
             reads `background-color`, so the BLOOMS are invisible to every
             gate in this repo — and on white a saturated bloom walks the
             GROUND DOWN under dark ink, which is the night band's risk
             inverted rather than removed. Every lobe is therefore centred
             outside the reading column (`DaylightSky`), and the rendered run —
             darkest pixel under each run of glyphs, grain ON — is recorded in
             BRAND.md Part 7. ── */}
      <section className="relative overflow-hidden bg-white">
        <DaylightSky />
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-y-14 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)] lg:gap-x-8 lg:pb-24 lg:pt-20">
          {/* ── The reading column. Hard left, never centred: BRAND.md Part 4,
                 and round B's "only halfway" was as much about type scale and
                 alignment as about colour. ── */}
          <div className="min-w-0 text-left">
            <p
              className={`mkt-enter mb-6 inline-flex items-center gap-2.5 rounded-full border bg-white px-3.5 py-1.5 text-teal-700 shadow-[0_2px_10px_-6px_rgb(26_36_64/0.3)] ${MONO_LABEL}`}
              style={{ borderColor: DAY_WIRE }}
            >
              {/* The band's one pulsing thing (BRAND.md Part 6, ~1.8s). The
                  glow is a second, larger dot behind the solid one, so what
                  breathes is light rather than the label's layout. */}
              <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
                <span className="mkt-live absolute inset-0 rounded-full bg-teal-500" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-teal-600" />
              </span>
              Built for dental practices · syncs with Open Dental
            </p>
            {/* 86px at 1440 (5.375rem), stepping down through 834 to a size
                that still reads as DISPLAY at 390 — BRAND.md Parts 4 and 10.
                Type steps down; it does not reflow into a different design. */}
            <h1 className="mkt-enter mkt-d1 text-[2.85rem] font-extrabold leading-[0.98] tracking-[-0.035em] text-gray-950 sm:text-[4rem] lg:text-[5.375rem]">
              Your whole front office.
              <br />
              {/* THE SIGNATURE GRADIENT, and every stop is legal AS INK on
                  white: teal-600 5.09, violet-700 6.14, fuchsia-700 6.27
                  (BRAND.md Part 7, re-derived from the palette by
                  `token-contrast.test.ts`). `fuchsia-600` is the trap and is
                  NOT used — 4.66 on white but 4.46 on surface-1, so it would
                  pass rule 4 (which grades against white, deliberately) and
                  fail the page the moment this treatment lands on a raised
                  panel. That is the 4.18 lesson in its light-ground costume.

                  This is where the night band's exemption used to be needed.
                  It is not needed now, so it is gone rather than re-pointed:
                  rule 4 grades these three stops against the ground they
                  really ride and passes them on the measurement. */}
              <span className="bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700 bg-clip-text text-transparent">
                One calm system.
              </span>
            </h1>
            <p className="mkt-enter mkt-d2 mt-7 max-w-xl text-[1.08rem] leading-relaxed text-gray-600">
              DreamCRM is the patient-relationship platform for dental practices — the
              website, booking, portal, messages, reviews, and recall that run everything
              between you and your patients, in one system that feels calm. And your PMS?
              It stays exactly where it is.
            </p>
            <div className="mkt-enter mkt-d3 mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <HeroPrimaryCta href="/signup">Start your free trial</HeroPrimaryCta>
              <HeroGhostCta href="/product">Tour the platform</HeroGhostCta>
            </div>
            {/* The trust row loses its check marks here. That is the owner's
                second veto from DREAMCRM-67 — "bland check marks as icons" —
                and the mono row is what he approved in round B. Move 3
                (DREAMCRM-71) took the tick everywhere else and replaced it
                with the tone-tile set; this row keeps NO mark at all, because
                the approved composition shows it as plain mono with dot
                separators. Four tiles here would be four statements the
                headline has already made.

                gray-600, not gray-500: 6.91 on white against 5.30, and this
                row sits closest to the fuchsia lobe's tail. */}
            <div className={`mkt-enter mkt-d4 mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-gray-600 ${MONO_LABEL}`}>
              {['7 days free', 'No card to start', '$200/mo after, flat', 'Month-to-month'].map((t, i) => (
                <span key={t} className="flex items-center gap-3">
                  {i > 0 && <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />}
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* ── THE BLEED — BRAND.md Part 3's one deliberate grid-break, and
                 Part 10's "a phone that drops the bleed is a phone showing a
                 different brand". The mock crosses the container's right edge
                 at EVERY width.

                 IT IS ACHIEVED BY CLIPPING, not by letting the document get
                 wider: the negative right margin widens this item's border
                 box, and the `overflow-hidden` on the <section> above cuts it
                 off at the viewport. Part 10 says to check that by measuring
                 `scrollWidth` against `clientWidth` rather than by looking at
                 it, because the bug this replaces LOOKED fine.

                 KEEP EACH MOCK A DIRECT CHILD of `.mkt-float` /
                 `.mkt-float-slow`. `DECORATIVE_MOCKS` in `e2e/axe.ts` is
                 `.mkt-float > [aria-hidden="true"]` — the drift wrapper AND
                 the attribute — and it is the only reason `marketing: home`
                 can hold a ceiling of ZERO. Wrap a mock in anything and the
                 exclusion goes dead (`deadExclusions` fails) and 41
                 illustration contrast findings come back. The glass therefore
                 rides ON the float wrapper rather than inside it. ── */}
          <div className="mkt-enter mkt-d4 relative -mr-[14vw] min-w-0 sm:-mr-[12vw] lg:-mr-[31vw]">
            <div
              className="mkt-float rounded-2xl border p-2 shadow-[0_0_70px_-20px_rgb(93_71_222/0.45),0_24px_80px_-44px_rgb(26_36_64/0.45)] backdrop-blur-sm"
              style={{ borderColor: DAY_WIRE, backgroundColor: 'rgb(255 255 255 / 0.72)' }}
            >
              <DashboardMock />
            </div>

            {/* The detached pieces, floating in FRONT of the mock. Absolutely
                positioned so they overlap it, and each one still its float
                wrapper's direct `aria-hidden` child. */}
            <div className="mkt-float-slow pointer-events-none absolute -top-7 left-3 z-10 hidden sm:block lg:left-[-13%]">
              <HeroStatTile label="New patients MTD" value="12" sub="+3 vs last month" />
            </div>
            <div className="mkt-float pointer-events-none absolute -bottom-9 left-2 z-10 lg:left-[-9%]">
              <HeroReplyBubble />
            </div>
          </div>
        </div>
      </section>

      <MarqueeStrip />

      {/* ── THE CINEMATIC SPINE — BRAND.md Part 6, Part 8 move 2
             (DREAMCRM-70). "On the homepage it is the spine", so it takes the
             slot the old "What it feels like" section held: the same story,
             told by showing the product working rather than asserting three
             bullets about it. That section's headline and lede are carried
             forward into the spine's own intro.

             WHERE IT SITS, AND WHY NOT IN THE HERO. Part 6's step 1 says "the
             product sits in its frame under the headline" and step 2 "the
             headline fades behind it", which reads at first like the HERO's
             headline and mock. It is the spine's own headline and the spine's
             own frame, and it has to be: the daylight hero landed on
             DREAMCRM-69 with the owner's sign-off on its composition — 86px
             hard left, the mock bleeding off the RIGHT edge with detached
             pieces floating in front of it — and Part 8 is explicit that move
             2 "is not a re-skin". Growing that asymmetric hero mock to full
             bleed under a fading hero headline would rebuild the thing move 1
             just shipped, and would invalidate the decorative-layer run Part 7
             records for the hero AT REST. So the spine is the section below
             the ticker, with a frame of its own, and the hero is untouched.

             It is a client component because the sequence needs the scroll
             position. Everything a reader has to be able to read is in the
             server HTML as four ordinary stacked sections — the component's
             header says why the stacked layout is the BASE rather than the
             fallback. ── */}
      <CinematicSpine />

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
            <div className="mt-5">
              <GhostCta href="/why">Read the full manifesto</GhostCta>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {TENETS.map((t) => (
              <div key={t.title} className="group rounded-xl border border-gray-200 p-5">
                <p className="flex items-center gap-2.5 text-[0.95rem] font-bold text-gray-950">
                  <ToneTile glyph={t.glyph} size="md" />
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
                  <p className="text-[0.78rem] font-semibold text-gray-500">DreamCRM vs</p>
                  <p className="mt-0.5 text-[1.05rem] font-bold text-gray-950">{c.name}</p>
                  <p className="mt-1 text-[0.78rem] leading-snug text-gray-500">{c.category}</p>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing teaser — one plan, founding rate ── */}
      <ScrollReveal as="section" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <SectionTitle sub="Published on the page, no discovery call. Month-to-month, cancel anytime.">
          One plan. The whole platform.
        </SectionTitle>
        <div className="mx-auto max-w-lg rounded-2xl border border-teal-200 bg-white p-8 text-center shadow-[0_2px_6px_rgba(76,125,240,0.06),0_18px_44px_rgba(76,125,240,0.14)]">
          <p className="text-[0.78rem] font-bold uppercase tracking-wider text-teal-700">
            Founding practice rate
          </p>
          <p className="mt-2 flex items-baseline justify-center gap-3">
            <span className="text-[1.2rem] font-semibold text-gray-500 line-through decoration-2">$500</span>
            <span className="text-[2.6rem] font-extrabold tracking-tight text-gray-950">$200</span>
            <span className="text-[0.9rem] font-medium text-gray-500">/mo</span>
          </p>
          <p className="mt-1 text-[0.875rem] text-gray-600">
            Everything DreamCRM does — website, booking, portal, messaging,
            reviews, recall, shop, PMS sync. Rate locked for as long as you stay.
          </p>
          <ul className="mx-auto mt-4 max-w-xs space-y-2.5 text-left">
            {([
              ['layers', 'Every module included'],
              ['calendar', 'Month-to-month, no contract'],
              ['gift', 'Annual option: 2 months free'],
            ] as Array<[ToneTileGlyph, string]>).map(([glyph, f]) => (
              <li key={f} className="flex items-center gap-2.5 text-[0.85rem] text-gray-700">
                <ToneTile glyph={glyph} />
                {f}
              </li>
            ))}
          </ul>
          <Link
            href="/pricing"
            className="mt-5 inline-block text-[0.875rem] font-semibold text-teal-700 hover:underline"
          >
            Full pricing details →
          </Link>
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
