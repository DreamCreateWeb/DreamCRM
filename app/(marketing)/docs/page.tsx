import Link from 'next/link'
import { DOCS, docsByCategory } from '@/lib/marketing/docs'
import {
  PageHero,
  PrimaryCta,
  GhostCta,
  ToneTile,
  ToneDash,
  MONO_LABEL,
  DAY_WIRE,
} from '@/components/marketing/ui'

export const metadata = {
  title: 'Help docs — DreamCRM',
  alternates: { canonical: '/docs' },
  description:
    'Setup guides and how-tos for every part of DreamCRM: website, booking, patient portal, reviews, recall, shop, and the PMS sync.',
}

/**
 * THE HELP DOCS INDEX — `BRAND.md` Part 8 move 6, page 6.
 *
 * TIER B, AND IT IS THE CLEANEST CASE OF IT ON THE SITE. `BRAND.md` Part 3:
 * a tile on the GROUP, a tone dash on each row, where the rows are one kind
 * of thing under a heading that already names the subject. Twenty-nine
 * articles under four headings is exactly that shape — "eight ways of saying
 * website do not need eight globes" is the pricing inventory's version of
 * the same sentence. So each shelf carries one tile from
 * `lib/marketing/tone-tiles.ts` and each article carries a dash in that
 * shelf's tone.
 *
 * `DOC_CATEGORIES` became `{ name, glyph }` to make that possible, and the
 * glyph is REQUIRED — page 5's `RESOURCE_GUIDES.glyph` call: a fifth shelf
 * cannot compile until somebody decides what it is about.
 *
 * SECTION CONTAINERS ALL MATCH. The body sat on `max-w-5xl` under a
 * `max-w-6xl` hero, so every shelf started 64px right of the `h1` — the
 * mismatch pages 1–5 each paid for. One `max-w-6xl` column now.
 *
 * THE COUNTS ARE COMPUTED, in the header and on every shelf. A number written
 * into prose about a countable fact in the tree goes stale silently, which is
 * what happened twice in move 3.
 *
 * NOTHING BELOW THE HERO CARRIES A DECORATIVE LAYER — pages 1–5's answer.
 * Measured run: `BRAND.md` Part 7, "The content routes, measured".
 *
 * NO EMOJI. There is no moment on a directory and no named human writing it
 * (`BRAND.md` Part 5's two separate clauses, which page 5 records being run
 * together). The one glyph on this route is the tone vocabulary.
 */
export default function DocsIndexPage() {
  const groups = docsByCategory()
  const total = String(DOCS.length).padStart(2, '0')

  return (
    <>
      <PageHero
        eyebrow="Help docs"
        title="Everything, explained in front-desk language"
        sub="Short, honest guides — most under five minutes. The product also explains itself the first time you open each page."
      />

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: DAY_WIRE }}>
          <h2 className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>On the shelf</h2>
          <p className={`ml-auto shrink-0 text-gray-500 ${MONO_LABEL}`}>
            <span aria-hidden="true">{total}</span>
            <span className="sr-only">{DOCS.length} articles</span>
          </p>
        </div>

        {/* MULTI-COLUMN, NOT A GRID. `md:grid-cols-2` aligns rows, so the
            four-article shelf sat beside the eight-article one and left ~250px
            of dead space under it at 1440 — the shelves have genuinely
            different lengths and a grid makes that a hole rather than a
            shape. CSS columns pack them; `break-inside-avoid` is what keeps a
            shelf from being split across the fold, which is the failure this
            layout would otherwise trade for. */}
        <div className="gap-x-12 pt-10 md:columns-2">
          {groups.map((group) => (
            <div key={group.category.name} className="mb-10 break-inside-avoid">
              <div className="flex items-center gap-3">
                <ToneTile glyph={group.category.glyph} size="md" />
                <h3 className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>{group.category.name}</h3>
                <p className={`ml-auto shrink-0 text-gray-500 ${MONO_LABEL}`}>
                  <span aria-hidden="true">
                    {String(group.articles.length).padStart(2, '0')}
                  </span>
                  <span className="sr-only">
                    {group.articles.length} article{group.articles.length === 1 ? '' : 's'}
                  </span>
                </p>
              </div>
              <ul className="mt-3">
                {group.articles.map((a) => (
                  <li key={a.slug} className="border-t" style={{ borderColor: DAY_WIRE }}>
                    <Link href={`/docs/${a.slug}`} className="mkt-nudge-host group block py-3.5">
                      <p className="flex items-start gap-2.5">
                        <ToneDash glyph={group.category.glyph} className="mt-[0.55em]" />
                        <span className="min-w-0 text-[0.95rem] font-semibold leading-snug text-gray-950 group-hover:text-teal-700 group-hover:underline">
                          {a.title}
                        </span>
                        <span className={`ml-auto shrink-0 pt-px text-gray-500 ${MONO_LABEL}`}>
                          {a.minutes} min
                        </span>
                      </p>
                      <p className="mt-1 pl-[1.25rem] text-[0.88rem] leading-snug text-gray-600">
                        {a.summary}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── THE CLOSE — the page's bookend ─────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:pb-20">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            Can’t find it
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            A person answers
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            Email{' '}
            <a
              href="mailto:hello@dreamcreatestudio.com"
              className="font-semibold text-teal-700 hover:underline"
            >
              hello@dreamcreatestudio.com
            </a>{' '}
            and tell us what you were looking for. If it should have been here, it usually is
            within a week.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">Start free — 7 days, no card</PrimaryCta>
            <GhostCta href="/product">See what DreamCRM does</GhostCta>
          </div>
        </div>
      </section>
    </>
  )
}
