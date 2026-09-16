import Link from 'next/link'
import { COMPARISONS, COMPARISON_DISCLAIMER } from '@/lib/marketing/comparisons'
import { PageHero, SectionOpener, MONO_LABEL, DAY_WIRE } from '@/components/marketing/ui'
import { usd } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { JsonLd, SITE_URL } from '@/lib/marketing/seo'

/**
 * THE COMPARISON INDEX — `BRAND.md` Part 8 move 6, page 2 (with
 * `compare/[vendor]`, which is where the two ledger defects lived).
 *
 * This page had no width defect of its own — it measures +0 at all three
 * widths before and after — so the work here is the LANGUAGE: hard-left
 * sections on one `max-w-6xl` column, Part 3's radius ladder against a page
 * that was uniformly `rounded-xl`, `surface-1` + `DAY_WIRE` in place of
 * `gray-50` + `gray-200`, and mono micro-labels where a label is a label.
 *
 * THE CONSOLIDATION MATH keeps its table, and keeps it as a `<table>`. It is
 * two columns of six rows — it fits 390 with room, which is exactly why the
 * vendor page's thirteen-row three-column matrix could not, and why that one
 * reflows and this one does not. Reflowing a table that already fits would be
 * cargo-culting the fix.
 *
 * NO EMOJI. Part 5 keeps comparisons on the never list by name.
 *
 * OUR OWN PRICE RESOLVES, it is not typed (DREAMCRM-38, as applied to the
 * pricing page on move 6 page 1). The `$200/mo` in the savings table was a
 * fourth hand-typed copy of a number that has already drifted once in this
 * repo — and it sits at the bottom of a column of competitor prices, which is
 * the worst possible place to be wrong. What is NOT touched: the reported
 * spend bands beside it, which are ranges about a market rather than a price
 * we charge, and everything in `lib/marketing/comparisons.ts`.
 */

/** Ours, resolved rather than typed. Pure config — no database, no Stripe. */
const PLAN = getQuotedPlan()

export const metadata = {
  title: 'Compare DreamCRM to the alternatives',
  alternates: { canonical: '/compare' },
  description: `Honest, page-length comparisons against ${COMPARISONS.map((c) => c.name).join(', ')} — reported pricing included, plus what each vendor does better than us.`,
}

/**
 * What a practice typically pays for the jobs DreamCRM does as one product.
 * These are market BANDS, not claims about any named vendor's price — the
 * per-vendor numbers live on the comparison pages with their sourcing hedge.
 */
const REPLACES: Array<[string, string]> = [
  ['Website agency retainer', '$150–500/mo'],
  ['Online booking vendor', '$200–350/mo'],
  ['Patient communications suite', '$250–400/mo'],
  ['Review management tool', '$100–300/mo'],
  ['Recall / reactivation service', '$150–300/mo'],
  ['Job board listings', '$100–400/mo'],
]

export default function CompareIndexPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'DreamCRM comparisons',
          itemListElement: COMPARISONS.map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: `DreamCRM vs ${c.name}`,
            url: `${SITE_URL}/compare/${c.slug}`,
          })),
        }}
      />
      <PageHero
        eyebrow="Comparisons"
        title="Evaluating us against the field? Good."
        sub="Every vendor below is genuinely good at something, and each page says exactly what. Then it shows where DreamCRM wins, feature by feature, with no asterisks."
      />

      {/* ── THE VENDOR CARDS ──────────────────────────────────────────────
             Part 3's card step (14px) and the emission shadow, which is what
             makes a card on this ground read as lit from under rather than as
             a box. The hover is a lift plus a deeper spill — depth changing,
             not a border colour — and it is 150ms ease-out with no overshoot
             (Part 6's interaction band). ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <SectionOpener
          eyebrow="The field"
          title="Five comparisons, written the way we'd want one written about us"
          lede="Each page leads with what the other vendor is genuinely better at. If that is your deciding factor, we would rather you found out here than three months in."
        />
        <ul className="grid gap-4 md:grid-cols-2">
          {COMPARISONS.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/compare/${c.slug}`}
                className="group flex h-full flex-col rounded-[14px] border bg-white p-6 shadow-[0_1px_4px_-2px_rgb(58_103_217/0.14),0_18px_44px_-34px_rgb(58_103_217/0.45)] transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-[0_2px_6px_-2px_rgb(58_103_217/0.18),0_26px_54px_-32px_rgb(58_103_217/0.6)]"
                style={{ borderColor: DAY_WIRE }}
              >
                <p className={`text-gray-500 ${MONO_LABEL}`}>DreamCRM vs</p>
                <h3 className="mt-2 text-[1.35rem] font-bold tracking-[-0.02em] text-gray-950">
                  {c.name}
                </h3>
                <p className="mt-1 text-[0.85rem] font-semibold text-teal-700">{c.category}</p>
                <p className="mt-3 line-clamp-3 text-[0.9rem] leading-relaxed text-gray-600">
                  {c.summary}
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-[0.85rem] font-semibold text-teal-700">
                  Read the full comparison
                  <span
                    className="transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 max-w-3xl text-[0.8rem] leading-relaxed text-gray-500">
          {COMPARISON_DISCLAIMER}
        </p>
      </section>

      {/* ── THE CONSOLIDATION MATH ────────────────────────────────────────
             Moved here from the homepage 2026-07-19 — this is the down-funnel
             home for the savings argument. ── */}
      <section className="border-y bg-[#F8FAFF]" style={{ borderColor: DAY_WIRE }}>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <SectionOpener
                eyebrow="The math, if you're counting"
                title="One product, or six subscriptions that don't talk"
                lede="A typical practice spends $800–$2,000 a month across patient-facing tools that don't talk to each other. DreamCRM does the same jobs as one product — so a website lead becomes a patient, the patient gets a portal, and the visit triggers a review request with nobody copying data between tabs."
              />
            </div>
            {/* An OPAQUE white panel: every run inside it rides white at its
                flat ratio, whatever the light behind it is doing. */}
            <div
              className="rounded-[14px] border bg-white p-2 shadow-[0_1px_4px_-2px_rgb(58_103_217/0.14),0_18px_44px_-34px_rgb(58_103_217/0.45)]"
              style={{ borderColor: DAY_WIRE }}
            >
              <table className="w-full text-[0.875rem]">
                <caption className="sr-only">
                  What a practice typically pays for the jobs DreamCRM does as one product
                </caption>
                <thead>
                  <tr className="text-left">
                    <th scope="col" className={`px-4 py-3 text-gray-500 ${MONO_LABEL}`}>
                      Replaces
                    </th>
                    <th scope="col" className={`px-4 py-3 text-right text-gray-500 ${MONO_LABEL}`}>
                      Typical spend
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {REPLACES.map(([tool, price]) => (
                    <tr key={tool} className="border-t" style={{ borderColor: DAY_WIRE }}>
                      <th
                        scope="row"
                        className="px-4 py-3 text-left text-[0.875rem] font-medium text-gray-800"
                      >
                        {tool}
                      </th>
                      <td className="px-4 py-3 text-right text-gray-500 line-through">{price}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-teal-200 bg-teal-50/70">
                    <th scope="row" className="px-4 py-3.5 text-left font-bold text-gray-950">
                      DreamCRM — all of it
                    </th>
                    <td className="px-4 py-3.5 text-right font-bold text-teal-700">
                      {usd(PLAN.price)}/mo
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-8 max-w-3xl text-[0.8rem] leading-relaxed text-gray-500">
            Spend bands are typical market ranges for each category, not quotes from any named
            vendor. Ours is the published price.{' '}
            <Link href="/pricing" className="font-semibold text-teal-700 hover:underline">
              See what&apos;s included →
            </Link>
          </p>
        </div>
      </section>
    </>
  )
}
