import { notFound } from 'next/navigation'
import Link from 'next/link'
import { DOCS, docCategory, getDoc } from '@/lib/marketing/docs'
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
 * A HELP-DOC ARTICLE — `BRAND.md` Part 8 move 6, page 6.
 *
 * **THE FOURTH BESPOKE HERO, AND DREAMCRM-80's OWN AUDIT MISSED IT.** The
 * issue lists this route under *"already inheriting the new chrome from move
 * 4; bodies only"*. It was not: this file rendered a bare
 * `<article className="mx-auto max-w-3xl">` with a hand-rolled breadcrumb,
 * `h1`, summary and read-time — no `PageHero`, no `Eyebrow`, no daylight at
 * all. Twenty-nine public routes opening on nothing.
 *
 * **That is the FOURTH time the count of pages wearing this brand has been
 * wrong in the same direction** — `compare/[vendor]` (page 2), the three
 * `GuideShell` articles (page 5), and now this and `/blog/[slug]`. Page 5
 * handed forward "check whether the page actually renders `PageHero` rather
 * than trusting a count of subpages", and the lesson has to widen: **an
 * ISSUE's audit of which pages are converted is exactly as unreliable as a
 * document's**, because both are written by reading route folders rather
 * than by opening each file. The only instrument that has never been wrong
 * here is `git grep PageHero -- 'app/(marketing)'`.
 *
 * NO CHAPTER RAIL, and that is deliberate rather than an omission. Page 5
 * gave its guides a derived rail because they are "the longest sustained
 * reading columns on the site — eight to ten screens". A doc is 2–5 minutes
 * and most have three or four sections; a rail beside it is page 3's
 * cautionary tale with nothing to show for it (a sticky structural column is
 * a narrower container by another name). The `related` shelf at the bottom
 * answers the only question this length raises: *what else is on this shelf.*
 *
 * SECTION CONTAINERS ALL MATCH — one `max-w-6xl` column, the reading measure
 * held by narrowing the TEXT rather than the container.
 *
 * NOTHING BELOW THE HERO CARRIES A DECORATIVE LAYER — pages 1–5's answer.
 * Measured run: `BRAND.md` Part 7, "The content routes, measured".
 *
 * NO EMOJI. Part 5's body-copy permission needs a NAMED HUMAN writing in the
 * first person, and a help doc is a corporate "we" — the same reading page 5
 * arrived at for the resource guides, and for the same two clauses.
 */
export default async function DocArticlePage({ params }: Props) {
  const { slug } = await params
  const doc = getDoc(slug)
  if (!doc) notFound()

  const category = docCategory(doc.category)
  const related = DOCS.filter((d) => d.category === doc.category && d.slug !== doc.slug).slice(0, 3)

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
        {/* The read-time spine — `PageHero`'s `children` slot, the fourth run
            page 5 measured on the guide hero and found costs nothing thanks to
            the bottom fade. The breadcrumb link lives here rather than above
            the `h1`: the old page put it in the first line of the page, which
            made the first thing a reader met a navigation control instead of
            the article's subject. */}
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-gray-600 ${MONO_LABEL}`}>
          <span>{doc.minutes} min read</span>
          <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
          <Link href="/docs" className="rounded-sm text-teal-700 hover:underline">
            All help docs
          </Link>
        </div>
      </PageHero>

      <article className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="max-w-2xl">
          {doc.sections.map((section, i) => (
            <section key={i} className={i > 0 ? 'mt-10' : ''}>
              {section.heading && (
                <h2 className="mb-3 text-[1.25rem] font-bold leading-snug tracking-[-0.02em] text-gray-950 sm:text-[1.4rem]">
                  {section.heading}
                </h2>
              )}
              {section.paragraphs?.map((p, j) => (
                <p key={j} className="mb-3 text-[0.98rem] leading-relaxed text-gray-700">
                  {p}
                </p>
              ))}
              {section.steps && (
                <ol className="mt-4">
                  {section.steps.map((step, j) => (
                    <li
                      key={j}
                      className="flex gap-4 border-t py-3.5"
                      style={{ borderColor: DAY_WIRE }}
                    >
                      {/* Part 3's small-tile step (12px) carrying a mono
                          numeral, not the old `rounded-full bg-teal-100`
                          bubble: `999px` is reserved for eyebrow badges and
                          status chips, and a step number is neither. The
                          numeral is `aria-hidden` with no `sr-only` twin —
                          these are `<li>`s in an `<ol>`. */}
                      <span
                        className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-[10px] bg-teal-50 text-teal-700 ${MONO_LABEL}`}
                        aria-hidden="true"
                      >
                        {j + 1}
                      </span>
                      <span className="text-[0.98rem] leading-relaxed text-gray-700">{step}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>

        {related.length > 0 && category && (
          /* TIER B, matching the index: one tile on the shelf, a tone dash on
             each row. Three articles under a heading that already names the
             subject is the definition. */
          <aside className="mt-14 max-w-2xl">
            <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: DAY_WIRE }}>
              <ToneTile glyph={category.glyph} size="md" />
              <h2 className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>More in {doc.category}</h2>
            </div>
            <ul>
              {related.map((r) => (
                <li key={r.slug} className="border-b" style={{ borderColor: DAY_WIRE }}>
                  <Link href={`/docs/${r.slug}`} className="group block py-3.5">
                    <p className="flex items-start gap-2.5">
                      <ToneDash glyph={category.glyph} className="mt-[0.55em]" />
                      <span className="min-w-0 text-[0.95rem] font-semibold leading-snug text-gray-950 group-hover:text-teal-700 group-hover:underline">
                        {r.title}
                      </span>
                      <span className={`ml-auto shrink-0 pt-px text-gray-500 ${MONO_LABEL}`}>
                        {r.minutes} min
                      </span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </article>

      {/* ── THE CLOSE — the page's bookend ─────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:pb-20">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            Try it
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            Everything in this doc is in the free trial
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            Seven days, no card, the whole product — including the parts this page just walked
            you through.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">Start your free trial</PrimaryCta>
            <GhostCta href="/docs">All help docs</GhostCta>
          </div>
        </div>
      </section>
    </>
  )
}
