import Link from 'next/link'
import { PageHero, MONO_LABEL, DAY_WIRE, PrimaryCta } from '@/components/marketing/ui'
import { JsonLd, breadcrumbLd, pageMetadata } from '@/lib/marketing/seo'
import { buildAbout } from '@/lib/marketing/about'
import { MARKETING, TRIAL, usd } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'

const ABOUT = buildAbout()
const PRICE = usd(getQuotedPlan().price)

export const metadata = pageMetadata({
  title: `About ${MARKETING.productName}: dental front-office software by ${MARKETING.companyName}`,
  description:
    `${MARKETING.productName} is dental practice software by ${MARKETING.companyName}: website, booking, patient portal, messages, reviews and recall in one system. ` +
    `${PRICE}/mo, ${TRIAL.name}.`,
  path: ABOUT.path,
})

/**
 * /about — the facts page. The words are DATA (`lib/marketing/about.ts`),
 * arranged from the listing kit so this page and every outside profile say
 * the same thing; that file's header says why the page exists.
 *
 * It wears the legal pages' layout on purpose — `PageHero`, the `DAY_WIRE`
 * hairline above each heading, one readable column — because it is a page to
 * be read slowly and quoted, by a person or by a model. So the facts are a
 * real definition list in the server HTML, with no tile, mock or motion
 * between a reader and the sentence they came for.
 */
export default function AboutPage() {
  const h2 = 'scroll-mt-24 text-[1.45rem] font-bold leading-snug tracking-[-0.02em] text-gray-950 sm:text-[1.6rem]'
  const body = 'text-[1rem] leading-relaxed text-gray-700'
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'About', path: ABOUT.path },
        ])}
      />

      <PageHero eyebrow="About" title={ABOUT.title} sub={ABOUT.summary}>
        {/* The same door, in the same shape and the same words, as the
            comparison pages' hero (`compare/[vendor]/page.tsx`): the button,
            and beside it the two numbers a reader wants before pressing it —
            both resolved. The wrapper keeps the button from shrinking beside
            its caption; that file says what happened when it could. */}
        <div className="flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <div className="sm:shrink-0">
            <PrimaryCta href="/signup">Start your free trial</PrimaryCta>
          </div>
          <p className="text-[0.85rem] leading-relaxed text-gray-600">
            {TRIAL.chip}. Card to start, not charged until the trial ends. {PRICE}/mo after, month-to-month.
          </p>
        </div>
      </PageHero>

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-2 sm:px-6 lg:pb-20">
        <article className="max-w-2xl">
          <section aria-labelledby="the-facts">
            <h2 id="the-facts" className={`${h2} mt-2`}>
              The facts
            </h2>
            <dl className="mt-4">
              {ABOUT.facts.map((fact, i) => (
                <div
                  key={fact.term}
                  className={i === 0 ? 'py-4' : 'border-t py-4'}
                  style={i === 0 ? undefined : { borderColor: DAY_WIRE }}
                >
                  <dt className={`text-gray-600 ${MONO_LABEL}`}>{fact.term}</dt>
                  <dd className={`mt-1.5 ${body}`}>{fact.detail}</dd>
                </div>
              ))}
            </dl>
            <p className={`mt-2 ${body}`}>
              Who operates {MARKETING.companyName}, and how to reach them, is in the{' '}
              <Link href="/privacy#contact" className="text-teal-700 underline underline-offset-2">
                Privacy Policy
              </Link>
              . The agreement itself is the{' '}
              <Link href="/terms" className="text-teal-700 underline underline-offset-2">
                Terms of Service
              </Link>
              .
            </p>
          </section>

          <section aria-labelledby="what-is-included">
            <h2 id="what-is-included" className={`${h2} mt-12 border-t pt-8`} style={{ borderColor: DAY_WIRE }}>
              What is included
            </h2>
            <ul className={`mt-4 list-disc space-y-2.5 pl-5 ${body}`}>
              {ABOUT.included.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="what-it-does-not-do">
            <h2 id="what-it-does-not-do" className={`${h2} mt-12 border-t pt-8`} style={{ borderColor: DAY_WIRE }}>
              What it does not do
            </h2>
            <ul className={`mt-4 list-disc space-y-2.5 pl-5 ${body}`}>
              {ABOUT.notIncluded.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className={`mt-4 ${body}`}>We would rather you read that here than find it out on a call.</p>
          </section>

          <section aria-labelledby="the-same-name">
            <h2 id="the-same-name" className={`${h2} mt-12 border-t pt-8`} style={{ borderColor: DAY_WIRE }}>
              Other products share the name
            </h2>
            {ABOUT.sameName.map((p) => (
              <p key={p} className={`mt-4 ${body}`}>
                {p}
              </p>
            ))}
          </section>

          <section aria-labelledby="how-it-compares">
            <h2 id="how-it-compares" className={`${h2} mt-12 border-t pt-8`} style={{ borderColor: DAY_WIRE }}>
              How it compares
            </h2>
            <p className={`mt-4 ${body}`}>
              Each comparison leads with what the other product does better, and quotes it from its own site with the
              day it was read.
            </p>
            <ul className={`mt-4 list-disc space-y-2.5 pl-5 ${body}`}>
              {ABOUT.compare.map((c) => (
                <li key={c.href}>
                  <Link href={c.href} className="text-teal-700 underline underline-offset-2">
                    {MARKETING.productName} and {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </article>
      </div>
    </>
  )
}
