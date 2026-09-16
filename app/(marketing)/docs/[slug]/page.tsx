import { notFound } from 'next/navigation'
import Link from 'next/link'
import { DOCS, getDoc, DOC_CATEGORY_GLYPH } from '@/lib/marketing/docs'
import { JsonLd, breadcrumbLd } from '@/lib/marketing/seo'
import {
  PageHero,
  PrimaryCta,
  GhostCta,
  ToneTile,
  ToneDash,
  MONO_LABEL,
  DAY_WIRE,
} from '@/components/marketing/ui'

/**
 * A HELP ARTICLE — `BRAND.md` Part 8 move 6, page 6 (the second half).
 *
 * ── THE ISSUE'S PREMISE WAS WRONG AGAIN, AND THIS IS THE FOURTH TIME ──────
 *
 * DREAMCRM-80 lists `docs/page.tsx` and `docs/[slug]/page.tsx` under *"already
 * inheriting the new chrome from move 4; bodies only"*. True of the INDEX. Not
 * true here: this route rendered a hand-rolled `<h1>` inside a bare
 * `mx-auto max-w-3xl` article and never called `PageHero` at all — the same
 * shape `compare/[vendor]` was found in on page 2 and `GuideShell` on page 5,
 * now on every doc in the registry at once. `/blog/[slug]` beside it is the
 * fifth.
 *
 * **The count of pages wearing this brand has now been wrong FOUR times, in
 * the same direction, for the same reason**, which has stopped being a
 * coincidence and become a property of how move 4's claim was phrased. "All
 * eight subpages inherit it without being opened" counted ROUTE GROUPS; a page
 * that renders its own hero does not inherit the one it never called, and a
 * dynamic route is ONE entry in that count and a registry's worth of pages to
 * a reader.
 * The standing instruction page 5 wrote — *check whether the page actually
 * renders `PageHero`* — is the one that keeps paying, and the honest version
 * of it is `git grep -L PageHero` over the route files rather than a count.
 *
 * ── THE CHAPTER RAIL IS NOT HERE, AND MEASURING IS WHY ───────────────────
 *
 * The obvious move was page 5's: these are articles, the right half of a 1440
 * article is empty, and `doc.sections[].heading` is structured data a rail
 * could be derived from without a hand-kept list. It was built that way first.
 *
 * **Then the registry was counted, and no doc in it has more than ONE
 * heading** — most have none at all. A rail gated on "more than one chapter"
 * would therefore have rendered on exactly zero of these routes: a component
 * that looks like coverage, reviews like coverage, and is nothing. That is
 * `deadExclusions`' whole lesson in a new costume (`e2e/axe-baseline.ts`), and
 * the only reason it was caught before merge is that the e2e stop asserting
 * the rail went looking for a doc with two headings and could not find one. A
 * guard that cannot fail is the same defect as a rail that cannot render.
 *
 * So there is no chapter rail. A help doc here is a few paragraphs and a step
 * list — it has no chapter structure to index, and inventing one by promoting
 * paragraphs to headings would be restyling CONTENT to justify a component.
 *
 * ── WHAT FILLS THE MARGIN IS CONTENT THE PAGE ALREADY HAD ────────────────
 *
 * `More in <category>` was at the BOTTOM of the article, below the last
 * paragraph, which is the one place a reader who has decided this doc is not
 * the one they wanted will never scroll to. It is in the right column now,
 * sticky, `lg:` and up — the honest answer to the question a docs reader
 * actually arrives with next (*is there a better article for me?*), sitting
 * in the space that was empty.
 *
 * It is on the RIGHT for page 5's reason: the product tour's first draft put
 * its rail in the LEFT margin and moved every heading ~180px right of the
 * hero's, because a structural column is a narrower container by another
 * name. Here the article still starts exactly where the `h1` starts.
 *
 * AND IT IS NOT `hidden` BELOW `lg`, which is where it parts company with
 * page 5's rail. That rail is a table of contents — pure redundancy on a
 * phone, where stacking it would put ten tab stops between the reader and the
 * first sentence, so `hidden` was right. This is REAL CONTENT with nowhere
 * else to be: hiding it below `lg` would delete three links from the page on
 * the width where most help-doc traffic actually is. It stacks under the
 * article instead, which is where it already was.
 *
 * ── SECTION CONTAINERS ALL MATCH ──────────────────────────────────────────
 *
 * The old article was `mx-auto max-w-3xl` — centred, and narrower than the
 * hero it now sits under, so at 1440 every paragraph began ~250px right of the
 * `h1`. Page 1's cost, handed forward through five pages: narrow the TEXT,
 * never the CONTAINER. Every section is `max-w-6xl`; the reading measure is
 * `max-w-2xl` on the prose itself.
 *
 * NOTHING BELOW THE HERO CARRIES A DECORATIVE LAYER, so every run in the body
 * rides white at its flat ratio — `gray-700` body 10.30, `gray-600` 6.91,
 * `gray-500` mono labels 5.30, `teal-700` links 7.05, all through
 * `tests/a11y/palette.ts`. Only the hero runs needed the instrument; they are
 * in `BRAND.md` Part 7, "The docs and the changelog, measured".
 *
 * NO EMOJI — Part 5's set marks a moment, and following a setup step is not
 * one.
 */

interface Props {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const doc = getDoc(slug)
  if (!doc) return {}
  return {
    title: `${doc.title} — DreamCRM docs`,
    description: doc.summary,
    alternates: { canonical: `/docs/${slug}` },
  }
}

/**
 * THE ANCHOR A SECTION IS REACHABLE BY, derived from its own heading — the
 * same pure function `guideHeadingId` is, and for the same reason: the rail
 * and the heading are rendered from two places in this file and must agree
 * without a list to keep in sync.
 */
export function docHeadingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default async function DocArticlePage({ params }: Props) {
  const { slug } = await params
  const doc = getDoc(slug)
  if (!doc) notFound()

  const related = DOCS.filter((d) => d.category === doc.category && d.slug !== doc.slug).slice(0, 3)
  const glyph = DOC_CATEGORY_GLYPH[doc.category]

  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'Docs', path: '/docs' },
          { name: doc.title, path: `/docs/${doc.slug}` },
        ])}
      />

      <PageHero eyebrow={doc.category} title={doc.title} sub={doc.summary}>
        {/* The article's spine — the category's subject tile, the honest read
            time, and the way back. Mono, dot-separated: the home hero's trust
            row arriving on a help article, exactly as it does on a guide. */}
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-gray-600 ${MONO_LABEL}`}>
          <ToneTile glyph={glyph} size="sm" />
          <span>{doc.minutes}-minute read</span>
          <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
          <Link href="/docs" className="mkt-nudge-host inline-flex items-center gap-2 text-teal-700 hover:underline">
            <span className="mkt-nudge-back" aria-hidden="true">
              ←
            </span>
            All docs
          </Link>
        </div>
      </PageHero>

      <div className="mx-auto max-w-6xl px-4 pb-6 pt-2 sm:px-6">
        <div className="lg:grid lg:grid-cols-12 lg:gap-x-10">
          <article className="max-w-2xl lg:col-span-8">
            {doc.sections.map((section, i) => (
              <section key={i}>
                {section.heading && (
                  /* The hairline ABOVE the heading is the structure —
                     `DAY_WIRE`, the same 1px edge the manifesto's beliefs, the
                     tour's chapters and a guide's `GuideH2` are separated by.
                     No tile per heading: the article's subject is stated ONCE,
                     on its tile in the hero. A tile on every `h2` is the
                     bland-check-mark veto in a new costume (Part 3). */
                  <h2
                    id={docHeadingId(section.heading)}
                    className="mt-12 scroll-mt-24 border-t pt-8 text-[1.45rem] font-bold leading-snug tracking-[-0.02em] text-gray-950 sm:text-[1.6rem]"
                    style={{ borderColor: DAY_WIRE }}
                  >
                    {section.heading}
                  </h2>
                )}
                {section.paragraphs?.map((p, j) => (
                  <p key={j} className="mt-4 text-[1rem] leading-relaxed text-gray-700">
                    {p}
                  </p>
                ))}
                {section.steps && (
                  /* THE STEPS, AND THE NUMERAL IS THE MOVE. These were
                     `rounded-full bg-teal-100` circles carrying `teal-700` —
                     a pill (Part 3 reserves `999px` for eyebrow badges and
                     status chips, and a step marker is neither) in a tint/ink
                     pair nothing grades. They are the tone tiles' own recipe
                     now: the `-200` tint carrying the `-800` ink, measured at
                     6.49 in `lib/marketing/tone-tiles.ts`, at the 10px control
                     radius, with the numeral in mono — Part 4's rule that any
                     number a reader is meant to follow is mono.

                     The numeral is `aria-hidden` with no `sr-only` twin:
                     these are `<li>`s in an `<ol>`, which every screen reader
                     already announces as "3 of 5". */
                  <ol className="mt-5 space-y-4">
                    {section.steps.map((step, j) => (
                      <li key={j} className="flex gap-3.5">
                        <span
                          className={`mt-[0.1rem] flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-teal-200 text-teal-800 ${MONO_LABEL}`}
                          aria-hidden="true"
                        >
                          {j + 1}
                        </span>
                        <span className="text-[1rem] leading-relaxed text-gray-700">{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}

          </article>

          {/* ── THE MARGIN — `More in <category>`, moved out of the
                 article's basement into the space a 1440 page was wasting.
                 See the header: this is real content rather than a table of
                 contents, so it STACKS below `lg` instead of hiding. ── */}
          {related.length > 0 && (
            <aside className="mt-12 lg:col-span-4 lg:mt-0">
              <div className="lg:sticky lg:top-24">
                <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: DAY_WIRE }}>
                  <ToneTile glyph={glyph} size="md" />
                  <p className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>More in {doc.category}</p>
                  <p className={`ml-auto shrink-0 text-gray-500 ${MONO_LABEL}`}>
                    <span aria-hidden="true">{String(related.length).padStart(2, '0')}</span>
                    <span className="sr-only">{related.length} articles</span>
                  </p>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {related.map((r) => (
                    <li key={r.slug} className="flex items-start gap-2.5">
                      <ToneDash glyph={glyph} className="mt-[0.6em]" />
                      <Link
                        href={`/docs/${r.slug}`}
                        className="text-[0.95rem] leading-snug text-gray-600 hover:text-teal-700 hover:underline"
                      >
                        {r.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* ── THE CLOSE — the page's bookend ────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:pb-20">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            Still stuck?
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            Email us and a person answers
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            If this article did not get you there,{' '}
            <a
              href="mailto:hello@dreamcreatestudio.com"
              className="font-semibold text-teal-700 hover:underline"
            >
              hello@dreamcreatestudio.com
            </a>{' '}
            reaches a human — and the doc gets fixed too.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">Start free — 7 days</PrimaryCta>
            <GhostCta href="/docs">All help docs</GhostCta>
          </div>
        </div>
      </section>
    </>
  )
}
