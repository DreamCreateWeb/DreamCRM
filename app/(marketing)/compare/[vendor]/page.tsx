import { notFound } from 'next/navigation'
import Link from 'next/link'
import { COMPARISONS, COMPARISON_DISCLAIMER, buildComparisonFaq, getComparison } from '@/lib/marketing/comparisons'
import {
  PageHero,
  PrimaryCta,
  GhostCta,
  MatrixMark,
  ToneTile,
  SectionOpener,
  MONO_LABEL,
  DAY_WIRE,
} from '@/components/marketing/ui'
import { DEMO_URL, usd } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { JsonLd, breadcrumbLd, faqPageLd } from '@/lib/marketing/seo'

/**
 * THE VENDOR COMPARISON — `BRAND.md` Part 8 move 6, page 2.
 *
 * Two things happen in this file and they are the same edit, which is unusual
 * enough to say out loud: the page comes across to Daylight Dream, and the two
 * OPEN defects in `docs/RELEASE.md` Part 5 that both live on the capability
 * matrix close as a consequence of how it is rebuilt. Part 10 makes zero
 * horizontal scroll build-blocking, so "reflow the matrix" was always the
 * preferred of the two answers the ledger laid out; the other one (keep the
 * scroll box, give it `tabindex` and a name) closes one defect and leaves the
 * page still dragging sideways on a phone.
 *
 * ── THE SIDEWAYS SCROLL, AND WHY THE LEDGER'S LEAD WAS WRONG ─────────────
 *
 * The entry said the width was "travelling THROUGH this scroll container", and
 * offered the usual cause — "an ancestor sizing to content as a flex/grid item
 * without `min-width: 0`" — explicitly as a lead rather than a diagnosis. It
 * is worth recording that the lead did not survive contact, because the real
 * mechanism is a trap that will catch somebody else:
 *
 *   Every ancestor of the old scroll box was `display: block` with a computed
 *   `min-width: 0px` and a measured width of 390px. Nothing sized to content.
 *   `document.body.scrollWidth` was **390** — correct — while
 *   `documentElement.scrollWidth` was **602**, and a document that widens
 *   where its own body does not is the shape of the answer.
 *
 *   `MatrixMark` emits `<span className="sr-only">Yes</span>` beside each
 *   glyph. Tailwind's `sr-only` is `position: absolute`, and NO ancestor
 *   inside the scroll box was positioned — so the containing block of all 26
 *   of those spans resolved to the initial containing block, OUTSIDE the
 *   scroller (`offsetParent` read `BODY`). An absolutely-positioned descendant
 *   whose containing block is outside a scroll container contributes nothing
 *   to that container's scrollable overflow; it contributes to its real
 *   containing block's. So each span sat at its static position — up to
 *   x = 601.5, inside the 672px table — and widened the DOCUMENT. 601.5 → 602,
 *   and 602 − 390 = **212**, the exact number in the ledger.
 *
 *   Both halves of that were confirmed by isolation rather than argued:
 *   deleting only the `sr-only` spans took the overflow to 0, and so did
 *   setting `position: relative` on the wrapper alone (which gives those spans
 *   a containing block INSIDE the scroller).
 *
 * The ledger's own scan is what hid it, and that is the transferable part: it
 * looked for elements with no `overflow-x` ancestor and found none — correctly,
 * because the spans DO have one in the DOM tree. Scrollable overflow follows
 * the CONTAINING-BLOCK chain, not the DOM ancestry, and for an abspos element
 * those two come apart. A "zero escaping elements" result does not mean zero
 * elements escaped.
 *
 * The fix here does not rely on knowing any of that: there is no scroll
 * container on this page any more, at any width.
 *
 * ── THE MATRIX, REBUILT ──────────────────────────────────────────────────
 *
 * Below `md` the matrix is a card per capability; from `md` up it is a real
 * `<table>` with no `min-width`, so it fits its column instead of demanding
 * 672px inside 358. That closes the second entry too — `scrollable-region-
 * focusable` is a finding ABOUT a scroll region, and there is no longer one.
 *
 * TWO PRESENTATIONS, ONE SOURCE. Both render from `c.matrix`, so they cannot
 * disagree, and exactly one is in the accessibility tree at a time (`hidden`
 * is `display: none`). The alternative — one `<table>` reflowed with CSS —
 * means `display: block` on the table parts, which drops the implicit table
 * roles and needs them re-asserted with ARIA to get back to where the semantic
 * markup already is. A real table where a table reads well, and cards where it
 * does not, is the cheaper honesty.
 *
 * IT IS NOT FREE AND THE PRICE IS MEASURED RATHER THAN WAVED AT: every string
 * in the matrix is in the HTML twice. This page went from **30.0 KB to 37.5 KB
 * gzipped** (+25%) — and that figure is the whole PR, the new sections and the
 * price panel included, not the duplication alone. Duplicated markup is close
 * to free after compression, which is why the uncompressed +46% is the
 * misleading number to quote. 7.5 KB on the wire for a real `<table>` on the
 * width where a table reads, and no sideways drag on the width where it does
 * not, is a trade worth making on the one page whose entire job is a matrix.
 * It would not be worth making for a three-row table, and `compare/page.tsx`
 * does not make it.
 *
 * `<th scope="row">` on the capability, `scope="col"` on the three headings:
 * the marks are the VALUE in a yes/partial/no matrix (which is the whole
 * argument for `MatrixMark` being the one tick on this site the check-mark
 * veto exempts — `tests/marketing/tone-tiles.test.ts`), and a value is only
 * legible to a screen reader if its row and column announce with it.
 *
 * ── THE REST OF THE PAGE ─────────────────────────────────────────────────
 *
 *  - **`PageHero`, replacing a bespoke one.** This page never inherited move
 *    4 — it carried its own `bg-gradient-to-b from-teal-50/60` band with a
 *    hand-rolled `Eyebrow`/`h1` pair, which is the drift move 6 exists to
 *    close. Its runs are measured on THIS page rather than inherited from the
 *    component's table (`BRAND.md` Part 7, the move-6 rule).
 *  - **Hard left on one `max-w-6xl` column** (Part 4, and move 6 page 1's
 *    first inherited lesson: a narrower CONTAINER moves a section's hard-left
 *    edge off the page's column, so the reading measure is constrained on the
 *    LIST instead).
 *  - **Part 3's radius ladder** — 14px cards, 12px tiles, 10px controls —
 *    against a page that predates it and was uniformly `rounded-xl`.
 *  - **`surface-1` and `DAY_WIRE`** instead of `gray-50` and `gray-200`.
 *  - **0.75rem, not 0.72rem.** The note type under each mark was set at
 *    0.72rem = 11.52px, under Part 4's own 12px floor.
 *    `tests/a11y/legibility-floor.test.ts` does not scan `app/(marketing)` at
 *    all, so nothing was ever going to say so — see the ledger entry this PR
 *    adds for the six that remain on other pages. (The size is spelled in
 *    prose here rather than as the class literal on purpose: that guard parses
 *    `text-[…]` out of raw source, so quoting the offending class inside a
 *    comment would become a false positive the day the scan is widened.)
 *
 * NO EMOJI ON THIS PAGE. Part 5 keeps comparisons on the never list by name,
 * alongside pricing, and the DREAMCRM-56 reversal did not touch either.
 *
 * NOTHING WE ASSERT ABOUT A COMPETITOR MOVED. Every claim on this page still
 * renders verbatim out of `lib/marketing/comparisons.ts`, which is untouched
 * by this PR: a restyle is not the place to change what we say about someone
 * else's product, and the honesty bar in that file's header is the reason it
 * reads the way it does. The one number that is ours — our own price — stopped
 * being typed here and resolves from `getQuotedPlan()` (DREAMCRM-38's rule, as
 * applied to pricing on move 6 page 1).
 */

/** Ours, resolved rather than typed — DREAMCRM-38. Pure config, no I/O. */
const PLAN = getQuotedPlan()

interface Props {
  params: Promise<{ vendor: string }>
}

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ vendor: c.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { vendor } = await params
  const c = getComparison(vendor)
  if (!c) return {}
  // Title + description carry the queries this page exists to win —
  // "{vendor} pricing" and "{vendor} alternative(s)" (marketing-engine
  // Part 5: BOFU comparison pages, the terms thin-domain challengers rank
  // for today).
  return {
    title: `DreamCRM vs ${c.name}: pricing, features & alternatives`,
    description: `${c.name} pricing as reported, what it genuinely does well, and an honest feature-by-feature comparison with DreamCRM — a ${usd(PLAN.price)}/mo published, dentistry-native alternative.`,
    alternates: { canonical: `/compare/${c.slug}` },
  }
}

export default async function ComparePage({ params }: Props) {
  const { vendor } = await params
  const c = getComparison(vendor)
  if (!c) notFound()
  // Derived from the page's own registry entry, and rendered verbatim in
  // the FAQ section below — the schema describes only content that is
  // actually on the page.
  const faq = buildComparisonFaq(c)

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Compare', path: '/compare' },
            { name: `DreamCRM vs ${c.name}`, path: `/compare/${c.slug}` },
          ]),
          faqPageLd(faq),
        ]}
      />

      <PageHero eyebrow="Comparison" title={`DreamCRM vs ${c.name}`} sub={c.summary}>
        {/* ── THE PRICE PANEL, BREAKING THE SEAM ──────────────────────────
               Move 6 page 1's grid-break, in the form this page has one: the
               two prices side by side, in the hero's own light, rather than a
               grey note tucked under the summary.

               IT COSTS NO CONTRAST. The panel is an opaque `bg-white` card, so
               every run inside it rides white at its flat ratio whatever the
               bloom behind it is doing — the only ink on a decorative layer on
               this page is the hero's own, and it is measured in `BRAND.md`
               Part 7 against THIS page rather than inherited from `PageHero`'s
               component table. ── */}
        <div
          className="max-w-2xl rounded-[14px] border bg-white p-5 shadow-[0_1px_4px_-2px_rgb(58_103_217/0.14),0_18px_44px_-34px_rgb(58_103_217/0.45)]"
          style={{ borderColor: DAY_WIRE }}
        >
          <p className={`text-gray-500 ${MONO_LABEL}`}>{c.category}</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className={`text-gray-500 ${MONO_LABEL}`}>{c.name}</dt>
              <dd className="mt-1.5 text-[0.85rem] leading-relaxed text-gray-700">
                {c.reportedPricing}.
              </dd>
            </div>
            <div className="sm:border-l sm:pl-4" style={{ borderColor: DAY_WIRE }}>
              <dt className={`text-teal-700 ${MONO_LABEL}`}>DreamCRM</dt>
              <dd className="mt-1.5 text-[0.85rem] leading-relaxed text-gray-700">
                {usd(PLAN.price)}/mo published (founding practice rate), month-to-month.
              </dd>
            </div>
          </dl>
        </div>
      </PageHero>

      {/* ── WHAT THEY DO WELL, AND WHERE WE WIN ──────────────────────────
             Both columns are TIER A (`BRAND.md` Part 3): every line is a
             different KIND of thing, so every line takes its own tone tile.
             `ourStrengths.glyph` stays REQUIRED in the registry type — a new
             vendor cannot compile without somebody deciding what each win is
             about, which is the only reason a tile says anything. ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <SectionOpener
          eyebrow="Both sides"
          title={`What ${c.name} is good at, and what we are`}
          lede="Every vendor here is genuinely good at something, and the page says exactly what before it says anything else. If their strengths are your deciding factors, weigh them seriously."
        />
        <div className="grid gap-8 md:grid-cols-2 lg:gap-10">
          <div>
            <h3 className={`mb-4 text-gray-500 ${MONO_LABEL}`}>Where {c.name} shines</h3>
            <ul className="space-y-3">
              {c.theirStrengths.map((s) => (
                <li
                  key={s.title}
                  className="rounded-[14px] border bg-white p-5"
                  style={{ borderColor: DAY_WIRE }}
                >
                  <p className="text-[0.95rem] font-bold text-gray-950">{s.title}</p>
                  <p className="mt-1.5 text-[0.875rem] leading-relaxed text-gray-600">{s.body}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className={`mb-4 text-teal-700 ${MONO_LABEL}`}>Where DreamCRM wins</h3>
            <ul className="space-y-3">
              {c.ourStrengths.map((s) => (
                <li
                  key={s.title}
                  className="group rounded-[14px] border bg-white p-5 shadow-[0_1px_4px_-2px_rgb(58_103_217/0.14),0_18px_44px_-34px_rgb(58_103_217/0.45)]"
                  style={{ borderColor: DAY_WIRE }}
                >
                  <p className="flex items-center gap-3 text-[0.95rem] font-bold text-gray-950">
                    <ToneTile glyph={s.glyph} size="md" />
                    <span className="min-w-0">{s.title}</span>
                  </p>
                  <p className="mt-1.5 text-[0.875rem] leading-relaxed text-gray-700">{s.body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[0.82rem] leading-relaxed text-gray-500">
              Every claim above is verifiable in the product today.
            </p>
          </div>
        </div>
      </section>

      {/* ── THE CAPABILITY MATRIX ────────────────────────────────────────
             The two OPEN ledger entries lived on the old version of this
             block; the file header has the mechanism and the isolation that
             settled it. What matters for anyone editing below: DO NOT
             reintroduce an `overflow-x-auto` wrapper with a `min-w-*` table
             inside it. It looks like it contains the table, `body.scrollWidth`
             agrees that it does, and the `sr-only` spans inside `MatrixMark`
             still drag the DOCUMENT 212px wider at 390. ── */}
      <section className="border-y bg-[#F8FAFF]" style={{ borderColor: DAY_WIRE }}>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <SectionOpener
            eyebrow="Feature by feature"
            title="The whole matrix, including the rows we lose"
            lede="Two of these rows are ours to lose and they are left in. A comparison that only lists the columns we win is a brochure."
          />

          {/* Phones: a card per capability. No scroll container, and at 390
              the two marks still sit SIDE BY SIDE — the comparison is the
              point of the page, and stacking them would turn a matrix into
              two lists. */}
          <ul className="space-y-3 md:hidden">
            {c.matrix.map((row) => (
              <li
                key={row.feature}
                className="rounded-[14px] border bg-white p-4"
                style={{ borderColor: DAY_WIRE }}
              >
                <p className="text-[0.9rem] font-semibold leading-snug text-gray-950">
                  {row.feature}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className={`text-teal-700 ${MONO_LABEL}`}>DreamCRM</p>
                    <p className="mt-1.5">
                      <MatrixMark value={row.dreamcrm} />
                    </p>
                    {row.dreamcrmNote && (
                      <p className="mt-1.5 text-[0.75rem] leading-snug text-gray-500">
                        {row.dreamcrmNote}
                      </p>
                    )}
                  </div>
                  <div className="border-l pl-3" style={{ borderColor: DAY_WIRE }}>
                    <p className={`min-w-0 text-gray-500 ${MONO_LABEL}`}>{c.name}</p>
                    <p className="mt-1.5">
                      <MatrixMark value={row.vendor} />
                    </p>
                    {row.vendorNote && (
                      <p className="mt-1.5 text-[0.75rem] leading-snug text-gray-500">
                        {row.vendorNote}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* `md` and up: a real table, sized to its column. No `min-w-*`, so
              nothing on this page can ever want a scrollbar. */}
          <div
            className="hidden rounded-[14px] border bg-white md:block"
            style={{ borderColor: DAY_WIRE }}
          >
            <table className="w-full text-left text-[0.875rem]">
              <caption className="sr-only">
                DreamCRM compared with {c.name}, capability by capability
              </caption>
              <thead>
                <tr className="border-b" style={{ borderColor: DAY_WIRE }}>
                  <th scope="col" className={`px-5 py-4 text-gray-500 ${MONO_LABEL}`}>
                    Capability
                  </th>
                  <th
                    scope="col"
                    className={`w-[10.5rem] px-5 py-4 text-teal-700 lg:w-[13rem] ${MONO_LABEL}`}
                  >
                    DreamCRM
                  </th>
                  <th
                    scope="col"
                    className={`w-[10.5rem] px-5 py-4 text-gray-500 lg:w-[13rem] ${MONO_LABEL}`}
                  >
                    {c.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {c.matrix.map((row) => (
                  <tr key={row.feature} className="border-t align-top" style={{ borderColor: DAY_WIRE }}>
                    <th
                      scope="row"
                      className="px-5 py-4 text-[0.875rem] font-medium leading-snug text-gray-800"
                    >
                      {row.feature}
                    </th>
                    <td className="px-5 py-4">
                      <MatrixMark value={row.dreamcrm} />
                      {row.dreamcrmNote && (
                        <p className="mt-1.5 text-[0.75rem] leading-snug text-gray-500">
                          {row.dreamcrmNote}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <MatrixMark value={row.vendor} />
                      {row.vendorNote && (
                        <p className="mt-1.5 text-[0.75rem] leading-snug text-gray-500">
                          {row.vendorNote}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 max-w-3xl text-[0.8rem] leading-relaxed text-gray-500">
            {COMPARISON_DISCLAIMER}
          </p>
        </div>
      </section>

      {/* ── THE BOTTOM LINE ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <SectionOpener eyebrow="The bottom line" title="Which one you should pick" lede={c.bottomLine} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[14px] border bg-white p-6" style={{ borderColor: DAY_WIRE }}>
            <p className={`text-gray-500 ${MONO_LABEL}`}>Choose {c.name} if</p>
            <ul className="mt-4 space-y-2.5">
              {c.theirStrengths.map((s) => (
                <li
                  key={s.title}
                  className="flex items-start gap-3 text-[0.9rem] leading-snug text-gray-700"
                >
                  <span
                    className="mt-[0.45rem] h-[3px] w-2.5 shrink-0 rounded-full bg-gray-400"
                    aria-hidden="true"
                  />
                  {s.title} matters most to you
                </li>
              ))}
            </ul>
          </div>
          <div
            className="rounded-[14px] border bg-white p-6 shadow-[0_1px_4px_-2px_rgb(58_103_217/0.14),0_18px_44px_-34px_rgb(58_103_217/0.45)]"
            style={{ borderColor: DAY_WIRE }}
          >
            <p className={`text-teal-700 ${MONO_LABEL}`}>Choose DreamCRM if</p>
            <ul className="mt-4 space-y-2.5">
              {c.ourStrengths.slice(0, 3).map((s) => (
                <li
                  key={s.title}
                  className="flex items-start gap-3 text-[0.9rem] leading-snug text-gray-800"
                >
                  <ToneTile glyph={s.glyph} className="mt-px" />
                  <span className="min-w-0">
                    {s.title} — if that&apos;s what you&apos;re missing
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── THE QUESTIONS BUYERS TYPE (rendered twin of the FAQPage schema) ── */}
      <section className="border-y bg-[#F8FAFF]" style={{ borderColor: DAY_WIRE }}>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <SectionOpener
            eyebrow="Straight answers"
            title={`Common questions about ${c.name}`}
            lede="The same questions people type before they ask us, answered the way we would answer them on a call."
          />
          <div className="max-w-3xl space-y-2.5">
            {faq.map((f) => (
              <details
                key={f.q}
                className="group rounded-[14px] border bg-white px-5 py-4 transition-shadow duration-150 ease-out open:shadow-[0_1px_4px_-2px_rgb(58_103_217/0.14),0_18px_44px_-34px_rgb(58_103_217/0.45)]"
                style={{ borderColor: DAY_WIRE }}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[0.95rem] font-semibold text-gray-950 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  {/* The pricing page's affordance, not a second recipe: a
                      12px tile that turns 45° on open, 200ms ease-out with no
                      spring overshoot (Part 6's interaction band — overshoot
                      is the dashboard's register and reads as bounce here). */}
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-teal-50 text-[1.05rem] font-bold leading-none text-teal-700 transition-transform duration-200 ease-out group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-[0.9rem] leading-relaxed text-gray-600">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-[0.8rem] leading-relaxed text-gray-500">
            {COMPARISON_DISCLAIMER}
          </p>
        </div>
      </section>

      {/* ── THE CLOSE — the page's bookend ────────────────────────────────
             It opens with a 36px gradient rule under the header and closes
             with the same mark, so the brand's three hues are the first and
             last thing on the page. Every stop is legal as ink on white
             (Part 7's table); `fuchsia-700`, never `fuchsia-600`, which
             clears on white by 0.16 and FAILS on `surface-1`. ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            Start today
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            Run it for a week before you decide.
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            Seven days of the whole platform on your own practice — your website, your
            booking page, your patients. No card, and nothing to cancel if you walk away.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">Start your free trial</PrimaryCta>
            <GhostCta href={DEMO_URL} external>
              Browse the demo practice ↗
            </GhostCta>
          </div>
          <div className="mt-8 grid gap-2 text-[0.88rem] text-gray-600 sm:grid-cols-2">
            <p>
              Not sure what your practice is missing?{' '}
              <Link href="/grade" className="font-semibold text-teal-700 hover:underline">
                Grade your online presence free →
              </Link>
            </p>
            <p>
              Comparing someone else?{' '}
              <Link href="/compare" className="font-semibold text-teal-700 hover:underline">
                All comparisons →
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
