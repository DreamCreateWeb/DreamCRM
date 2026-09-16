import Link from 'next/link'
import {
  PageHero,
  SectionOpener,
  FaqList,
  PrimaryCta,
  GhostCta,
  ToneTile,
  MONO_LABEL,
  DAY_WIRE,
  type ToneTileGlyph,
} from '@/components/marketing/ui'
import { JsonLd, breadcrumbLd, faqPageLd } from '@/lib/marketing/seo'
import { getQuotedPlan } from '@/lib/stripe-config'
import { PAYOUT_MIN_CENTS, formatBps } from '@/lib/types/referrals'
import ApplyForm from './apply-form'

export const metadata = {
  title: 'DreamCRM partner program — 10% recurring for dental consultants & advisors',
  description:
    'Refer dental practices to DreamCRM and earn 10% of every payment, month after month, for as long as they stay. For practice consultants, dental CPAs and bookkeepers, IT providers, and agencies.',
  alternates: { canonical: '/partner-program' },
}

/**
 * THE PARTNER PROGRAM — `BRAND.md` Part 8 move 6, page 6 (the tools).
 *
 * THE THIRD BESPOKE HERO, and the same `from-teal-50/60` band as `/roi`,
 * `/compare/[vendor]` and `GuideShell` before it. It imported `Eyebrow`, so
 * a grep for the shared chrome found it and a reader would have called it
 * converted; it rendered its own band around that eyebrow, so a VISITOR would
 * not have. `PageHero` opens it now.
 *
 * THE MOVE IS THE MATH. The whole page turns on one number a reader wants to
 * do in their head — *if I send ten practices, what does that pay?* — and it
 * was a sentence with the answer typed into it. It is a mono equation now,
 * the same register `/roi` gives its own arithmetic on the sibling page in
 * this PR (Part 4: mono for any number the reader is meant to compare), and
 * every term in it is COMPUTED. That matters more here than anywhere else on
 * the site, because the old copy's `$200` was a coincidence: ten practices ×
 * 10% of a $200 plan happens to equal the plan price today, so at the next
 * reprice the page would have read "ten practices = $200/mo to you" beside a
 * different plan price and been quietly, embarrassingly wrong.
 *
 * WHAT RESOLVES AND WHAT DOES NOT, because the line is worth stating:
 *
 *  - **The PLAN PRICE resolves** from `getQuotedPlan()` — DREAMCRM-38's rule,
 *    and this page was the sixth surface holding a copy of it (three copies,
 *    in fact: a step card and two FAQ answers). It is on
 *    `tests/marketing/pricing-price-source.test.tsx`'s scan now.
 *  - **The PAYOUT FLOOR resolves** from `PAYOUT_MIN_CENTS`, which is the
 *    number `payoutPartner` actually enforces. A marketing page promising a
 *    $25 floor while the service enforces something else is the same defect
 *    class one domain over.
 *  - **The RATE does not, and that is deliberate.** `STANDARD_RATE_BPS` is
 *    declared here because 10% is a PUBLISHED PROGRAM TERM rather than a
 *    fact the product computes — the page says so out loud two paragraphs
 *    down ("your exact rate and term are written into your partner
 *    agreement"), and per-partner rates already override it. Its twin is
 *    `referral_partner.default_percent_bps`, whose column default is 1000;
 *    if that default ever moves, this is the line to move with it. Reaching
 *    into a schema default from a marketing page to avoid typing a number
 *    the page is the publisher of would be the wrong direction of
 *    dependency.
 *
 * NOTHING BELOW THE HERO CARRIES A DECORATIVE LAYER — pages 1–5's answer.
 * Measured run: `BRAND.md` Part 7, "The tools, measured".
 *
 * NO EMOJI ON THIS PAGE'S BODY. Part 5 bans them in billing copy, and a page
 * about commission rates and payout floors is that register whichever side of
 * the money you are on. The one popper in `apply-form.tsx` stays: it fires on
 * a real win the visitor just caused, which is the glyph's entire permission.
 */

/**
 * The published standard rate, in basis points. See the note above on why
 * this is declared rather than resolved. `formatBps` is the same formatter
 * the partner portal renders a real agreement's rate with, so the page and
 * the portal cannot spell the same number two ways.
 */
const STANDARD_RATE_BPS = 1000

const PLAN = getQuotedPlan()
const usd = (n: number) => `$${n.toLocaleString('en-US')}`
/** What one referred practice pays a partner each month, at the standard rate. */
const PER_PRACTICE_MONTHLY = Math.floor((PLAN.price * STANDARD_RATE_BPS) / 10000)
/** The worked example's size — ten is a number a reader can hold. */
const EXAMPLE_PRACTICES = 10
const PAYOUT_FLOOR = Math.round(PAYOUT_MIN_CENTS / 100)
const RATE = formatBps(STANDARD_RATE_BPS)

/** Rendered verbatim below AND emitted as FAQPage schema — one source. */
const FAQ = [
  {
    q: 'How much does the DreamCRM partner program pay?',
    a: `The standard rate is ${RATE} of every payment from every practice you refer — recurring, month after month, for as long as they stay subscribed. At the ${usd(PLAN.price)}/mo plan that’s ${usd(PER_PRACTICE_MONTHLY)} per practice per month. Your exact rate and term are written into your partner agreement, so there’s never a surprise.`,
  },
  {
    q: 'How do payouts work?',
    a: `Commissions accrue automatically the moment a referred practice’s invoice is paid — you can watch them accrue live in your partner portal. Payouts go straight to your bank through Stripe, once your accrued balance reaches the ${usd(PAYOUT_FLOOR)} minimum.`,
  },
  {
    q: 'How are my referrals tracked?',
    a: 'You introduce the practice (or send them our way and tell us), and we tag them to you when their account is created. Every referral, its status, and every dollar accrued is visible in your partner portal — no spreadsheets, no chasing.',
  },
  {
    q: 'Who is this for?',
    a: `People dental practices already trust: practice-management consultants and coaches, dental CPAs and bookkeepers, IT providers, marketing agencies, and study-club leaders. If practices ask you “what software should we use?”, this program pays you for the answer you’d give anyway — and DreamCRM is easy to stand behind: ${usd(PLAN.price)}/mo published, month-to-month, free 7-day trial, no contracts.`,
  },
]

/**
 * TIER A (`BRAND.md` Part 3): every step is a different KIND of thing — an
 * introduction, a subscription, an accrual — so each earns its own tile.
 */
const STEPS: Array<{ glyph: ToneTileGlyph; title: string; body: string }> = [
  {
    glyph: 'people',
    title: 'Introduce a practice',
    body: 'Send them to the free trial, or make a warm intro — whatever fits how you work. We tag the account to you.',
  },
  {
    glyph: 'tag',
    title: 'They subscribe',
    body: `${usd(PLAN.price)}/mo, month-to-month, no contract — an easy recommendation to stand behind, because they can leave anytime.`,
  },
  {
    glyph: 'money',
    title: 'You earn on every invoice',
    body: `${RATE} accrues automatically each time they pay. Watch it live in your portal; Stripe deposits it once you clear ${usd(PAYOUT_FLOOR)}.`,
  },
]

/** TIER A again — four different kinds of term, four different statements. */
const TERMS: Array<[ToneTileGlyph, string]> = [
  ['tag', `${RATE} of every paid invoice, standard`],
  ['sync', 'Recurring — not a one-time bounty'],
  ['chart', 'Live referral + commission tracking portal'],
  ['money', `Stripe payouts to your bank (${usd(PAYOUT_FLOOR)} minimum)`],
]

export default function PartnerProgramPage() {
  const total = String(STEPS.length).padStart(2, '0')
  const exampleMonthly = PER_PRACTICE_MONTHLY * EXAMPLE_PRACTICES

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

      <PageHero
        eyebrow="Partner program"
        title="You advise dental practices. Get paid when they thrive."
        sub={`Refer a practice to DreamCRM and earn ${RATE} of every payment they make — recurring, for as long as they stay. Live tracking in your own partner portal, payouts straight to your bank.`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <PrimaryCta href="#apply">Apply to the program</PrimaryCta>
          <GhostCta href="/grade">Run a free practice grade</GhostCta>
        </div>
      </PageHero>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────
             Three equal cards in a `md:grid-cols-3` was the shape pages 3, 4
             and 5 each corrected — equivalent tiles are what a CHECKLIST
             looks like, which is the owner's tone-tile veto one altitude up.
             These are not equivalent: they are a sequence, and a sequence
             reads as rows with a position on each. Same chapter-mark idiom as
             the product tour and the resource shelf. ── */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <SectionOpener
          eyebrow="How it works"
          title="Three steps, and you only do the first one"
          lede="There is no quota, no minimum, and no dashboard for you to operate. The product does its own convincing."
        />

        <ol>
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-b py-7" style={{ borderColor: DAY_WIRE }}>
              <div className="grid gap-x-10 gap-y-3 lg:grid-cols-12">
                <div className="lg:col-span-5">
                  <div className={`flex items-center gap-3 text-gray-500 ${MONO_LABEL}`}>
                    <ToneTile glyph={s.glyph} size="md" />
                    {/* `aria-hidden` with no `sr-only` twin — an `<ol>` already
                        announces "2 of 3". Page 5's index made the same call. */}
                    <span aria-hidden="true">
                      {String(i + 1).padStart(2, '0')} / {total}
                    </span>
                  </div>
                  <h3 className="mt-3 text-[1.2rem] font-bold leading-snug tracking-[-0.02em] text-gray-950">
                    {s.title}
                  </h3>
                </div>
                <p className="max-w-2xl text-[0.95rem] leading-relaxed text-gray-700 lg:col-span-7">
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── THE MATH, PLAINLY ─────────────────────────────────────────────
             The page's one real moment, and it is usefulness rather than
             ornament: a reader arrives wanting to do this sum and the old
             page did it for them in a sentence they had to parse. Every term
             is computed, so it stays true through a reprice. ── */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <SectionOpener
          eyebrow="The math, plainly"
          title="What ten practices pays you"
          lede="Not a projection — the same arithmetic your partner portal runs on every paid invoice."
        />

        <div
          className="max-w-3xl rounded-[14px] border bg-white p-5 sm:p-6"
          style={{ borderColor: DAY_WIRE }}
        >
          {/* THE SPOKEN VERSION IS A SENTENCE. Split across flex children the
              equation reads to a screen reader as six disconnected scraps,
              and `×` is pronounced differently by every engine — so the
              visual line is `aria-hidden` and the spoken one is prose. Same
              call as `/roi`'s formula in this PR. */}
          <p className="sr-only">
            {EXAMPLE_PRACTICES} practices, times {usd(PLAN.price)} a month, times {RATE}, equals{' '}
            {usd(exampleMonthly)} a month to you, every month.
          </p>
          <div
            className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5 font-mono-num text-[0.95rem] leading-relaxed text-gray-800"
            aria-hidden="true"
          >
            <span>{EXAMPLE_PRACTICES} practices</span>
            <span className="text-teal-700">×</span>
            <span>{usd(PLAN.price)}/mo</span>
            <span className="text-teal-700">×</span>
            <span>{RATE}</span>
            <span className="text-teal-700">=</span>
            <span className="font-bold text-gray-950">{usd(exampleMonthly)}/mo to you</span>
          </div>
          <p
            className="mt-4 border-t pt-4 text-[0.92rem] leading-relaxed text-gray-700"
            style={{ borderColor: DAY_WIRE }}
          >
            Every month, for work you already do: being the person practices trust for advice.
            They get a free 7-day trial, a published price, and{' '}
            <Link href="/grade" className="font-semibold text-teal-700 hover:underline">
              a free practice grade
            </Link>{' '}
            you can run with a client in five minutes.
          </p>

          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {TERMS.map(([glyph, t]) => (
              <li
                key={t}
                className="flex items-start gap-2.5 text-[0.9rem] leading-relaxed text-gray-700"
              >
                <ToneTile glyph={glyph} className="mt-px" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── THE QUESTIONS (rendered twin of the FAQPage schema) ─────────── */}
      <section className="border-y bg-[#F8FAFF]" style={{ borderColor: DAY_WIRE }}>
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <SectionOpener
            eyebrow="Straight answers"
            title="Common questions"
            lede="What it pays, how the money reaches your bank, how a referral gets tagged to you, and who this is actually for."
          />
          <FaqList items={FAQ} className="max-w-3xl" />
        </div>
      </section>

      {/* ── APPLY — the page's bookend ────────────────────────────────────
             The 36px gradient rule the page opened on, closing it. Hard left
             on the hero's own column rather than the old centred stack: a
             centred block under a hard-left hero is the drift move 6 exists
             to close. ── */}
      <section id="apply" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-14 sm:px-6 lg:py-20">
        <div className="grid gap-x-12 gap-y-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
              <span
                className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
                aria-hidden="true"
              />
              Apply
            </div>
            <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.2rem]">
              Tell us who you work with
            </h2>
            <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
              A real person reads every application, and fits get their partner invite within a
              couple of business days. No automated scoring, no drip sequence afterwards.
            </p>
          </div>
          <div className="lg:col-span-7">
            <ApplyForm />
          </div>
        </div>
      </section>
    </>
  )
}
